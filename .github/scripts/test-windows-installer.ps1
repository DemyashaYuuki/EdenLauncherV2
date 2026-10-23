param(
	[Parameter(Mandatory)][string]$BundleDirectory,
	[string]$EvidenceDirectory = (Join-Path $PWD 'windows-installer-evidence')
)

$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true') { throw 'Installation tests are restricted to disposable GitHub Actions runners' }
$BundleDirectory = (Resolve-Path -LiteralPath $BundleDirectory).Path
New-Item -ItemType Directory -Force -Path $EvidenceDirectory | Out-Null
$fixtureRoot = Join-Path $env:RUNNER_TEMP ('eden-installer-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixtureRoot | Out-Null
$results = [ordered]@{ Tests = @(); Limitations = @('No interactive OAuth or in-app update-button test', 'No clean Windows VM without WebView2 unless this runner lacks the runtime') }

function Add-Result([string]$Name, $Details) {
	$results.Tests += [pscustomobject]@{ Name = $Name; Details = $Details }
	$results | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $EvidenceDirectory 'installation-tests.json') -Encoding utf8
}

function Invoke-Installer([string]$File, [string]$Arguments) {
	$process = Start-Process -FilePath $File -ArgumentList $Arguments -PassThru -WindowStyle Hidden
	if (!$process.WaitForExit(180000)) { Stop-Process -Id $process.Id -Force; throw "Installer timed out: $File" }
	if ($process.ExitCode -notin @(0, 3010)) { throw "Installer failed: $File / $($process.ExitCode)" }
	return $process.ExitCode
}

function Test-Launch([string]$Executable, [string]$Name) {
	$process = Start-Process -FilePath $Executable -PassThru -WindowStyle Hidden
	try {
		Start-Sleep -Seconds 15
		$process.Refresh()
		if ($process.HasExited) { throw "Application exited during launch smoke test: $Name / $($process.ExitCode)" }
		Add-Result $Name @{ ProcessSurvivedSeconds = 15; Pid = $process.Id; InteractiveUiVerified = $false }
	} finally {
		if (!$process.HasExited) { Stop-Process -Id $process.Id -Force }
	}
}

$exe = @(Get-ChildItem -LiteralPath (Join-Path $BundleDirectory 'nsis') -Filter '*-setup.exe' -File)
$msi = @(Get-ChildItem -LiteralPath (Join-Path $BundleDirectory 'msi') -Filter '*.msi' -File)
if ($exe.Count -ne 1 -or $msi.Count -ne 1) { throw 'Expected one EXE and one MSI installer' }
$extractRoot = Join-Path $fixtureRoot 'extracted'
& 'C:\Program Files\7-Zip\7z.exe' x $exe[0].FullName "-o$extractRoot" -y | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Installer extraction failed' }
$payloads = @(Get-ChildItem -LiteralPath $extractRoot -Filter 'MicrosoftEdgeWebview2Setup.exe' -Recurse -File)
if ($payloads.Count -ne 1) { throw 'Signed WebView2 bootstrapper is missing from installer' }
$expected = Get-Content -LiteralPath (Join-Path $EvidenceDirectory 'webview2-signature.json') -Raw | ConvertFrom-Json
$payloadSignature = Get-AuthenticodeSignature -LiteralPath $payloads[0].FullName
$payloadHash = (Get-FileHash -LiteralPath $payloads[0].FullName -Algorithm SHA256).Hash.ToLowerInvariant()
if ($payloadSignature.Status -ne 'Valid' -or $payloadHash -ne $expected.SHA256) { throw 'Embedded WebView2 differs from verified Microsoft payload' }
if (@(Get-ChildItem -LiteralPath $extractRoot -Filter 'NSISdl.dll' -Recurse -File).Count -ne 0) { throw 'Unexpected runtime downloader plugin in embedded-bootstrapper installer' }
Add-Result 'Embedded WebView2 signature and byte integrity' @{ SHA256 = $payloadHash; Status = [string]$payloadSignature.Status; StatusMessage = $payloadSignature.StatusMessage; Subject = $payloadSignature.SignerCertificate.Subject; Issuer = $payloadSignature.SignerCertificate.Issuer; RuntimeDownloaderPluginPresent = $false }

$plugin = @(Get-ChildItem -LiteralPath $extractRoot -Filter 'System.dll' -Recurse -File)
$toolPlugin = Join-Path $env:LOCALAPPDATA 'tauri\NSIS\Plugins\x86-unicode\System.dll'
if ($plugin.Count -ne 1 -or !(Test-Path -LiteralPath $toolPlugin)) { throw 'NSIS System plugin comparison is unavailable' }
$pluginHash = (Get-FileHash -LiteralPath $plugin[0].FullName -Algorithm SHA256).Hash
if ($pluginHash -ne (Get-FileHash -LiteralPath $toolPlugin -Algorithm SHA256).Hash) { throw 'System.dll differs from the build toolchain' }
Add-Result 'NSIS System.dll provenance' @{ SHA256 = $pluginHash.ToLowerInvariant(); MatchesBuildToolchain = $true }

$runtimePaths = @('HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'HKCU:\Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}')
$runtimeBefore = @($runtimePaths | ForEach-Object { Get-ItemProperty -LiteralPath $_ -Name pv -ErrorAction SilentlyContinue } | ForEach-Object { $_.pv })
Add-Result 'WebView2 before installation' @{ Versions = $runtimeBefore; RuntimeRemovedForTest = $false }

$installRoot = Join-Path $fixtureRoot 'nsis-app'
$exitCode = Invoke-Installer $exe[0].FullName "/S /NS /D=$installRoot"
$app = Join-Path $installRoot 'EdenLauncher.exe'
if (!(Test-Path -LiteralPath $app)) { throw 'NSIS clean installation did not produce the app' }
Add-Result 'NSIS fresh application installation' @{ ExitCode = $exitCode; BinarySHA256 = (Get-FileHash -LiteralPath $app -Algorithm SHA256).Hash; FileVersion = (Get-Item -LiteralPath $app).VersionInfo.FileVersion }
Test-Launch $app 'NSIS application launch'

$markerPaths = @((Join-Path $env:APPDATA 'fun.edenworld.launcher\profiles\AuditFixture\preserve.txt'), (Join-Path $env:LOCALAPPDATA 'fun.edenworld.launcher\audit-preserve.txt'))
$markerText = 'EdenLauncher installer preservation fixture ' + [guid]::NewGuid().ToString('N')
foreach ($marker in $markerPaths) { New-Item -ItemType Directory -Force -Path (Split-Path $marker) | Out-Null; [IO.File]::WriteAllText($marker, $markerText) }
function Assert-DataPreserved([string]$Name) {
	foreach ($marker in $markerPaths) { if (!(Test-Path -LiteralPath $marker) -or [IO.File]::ReadAllText($marker) -ne $markerText) { throw "User data marker changed: $Name" } }
	Add-Result $Name @{ RoamingAndLocalMarkersPreserved = $true }
}

$exitCode = Invoke-Installer (Join-Path $installRoot 'uninstall.exe') '/S'
for ($attempt = 0; $attempt -lt 30 -and (Test-Path -LiteralPath $app); $attempt++) { Start-Sleep -Seconds 1 }
if (Test-Path -LiteralPath $app) { throw 'NSIS uninstallation did not remove the app' }
Assert-DataPreserved 'NSIS uninstall preserves data by default'

$oldInstaller = Join-Path $fixtureRoot 'EdenLauncher_2.9.0_x64-setup.exe'
Invoke-WebRequest -Uri 'https://github.com/DemyashaYuuki/EdenLauncherV2/releases/download/v2.9.0/EdenLauncher_2.9.0_x64-setup.exe' -OutFile $oldInstaller
if ((Get-FileHash -LiteralPath $oldInstaller -Algorithm SHA256).Hash -ne '7a690d28aff9ca292c5767cb63d3d1c8b6a6c9e726cf66e257b0a54bc605d35c') { throw '2.9.0 baseline checksum mismatch' }
$exitCode = Invoke-Installer $oldInstaller "/S /NS /D=$installRoot"
if (!(Test-Path -LiteralPath $app)) { throw '2.9.0 baseline installation failed' }
$oldVersion = (Get-Item -LiteralPath $app).VersionInfo.FileVersion
$exitCode = Invoke-Installer $exe[0].FullName '/S /NS'
$newVersion = (Get-Item -LiteralPath $app).VersionInfo.FileVersion
if ($newVersion -eq $oldVersion -or $newVersion -notlike '2.9.1*') { throw 'Application version did not upgrade to 2.9.1' }
Add-Result 'Installer upgrade 2.9.0 to 2.9.1' @{ OldVersion = $oldVersion; NewVersion = $newVersion; ExitCode = $exitCode; InstallerFlags = '/S /NS'; InAppButtonTested = $false }
Assert-DataPreserved 'Upgrade preserves user data'
Test-Launch $app 'Application launch after upgrade'
$exitCode = Invoke-Installer (Join-Path $installRoot 'uninstall.exe') '/S'
for ($attempt = 0; $attempt -lt 30 -and (Test-Path -LiteralPath $app); $attempt++) { Start-Sleep -Seconds 1 }
if (Test-Path -LiteralPath $app) { throw 'Post-upgrade uninstallation failed' }
Assert-DataPreserved 'Post-upgrade uninstall preserves user data'

$msiRoot = Join-Path $fixtureRoot 'msi-app'
$msiLog = Join-Path $EvidenceDirectory 'msi-install.log'
$exitCode = Invoke-Installer 'msiexec.exe' "/i `"$($msi[0].FullName)`" /qn /norestart INSTALLDIR=`"$msiRoot`" /L*v `"$msiLog`""
$msiApp = Join-Path $msiRoot 'EdenLauncher.exe'
if (!(Test-Path -LiteralPath $msiApp)) { throw 'MSI installation did not produce the app at INSTALLDIR' }
Add-Result 'MSI installation' @{ ExitCode = $exitCode; FileVersion = (Get-Item -LiteralPath $msiApp).VersionInfo.FileVersion }
Test-Launch $msiApp 'MSI application launch'
$exitCode = Invoke-Installer 'msiexec.exe' "/x `"$($msi[0].FullName)`" /qn /norestart"
if (Test-Path -LiteralPath $msiApp) { throw 'MSI uninstallation did not remove the app' }
Assert-DataPreserved 'MSI uninstall preserves data'

try {
	$defender = Get-MpComputerStatus -ErrorAction Stop
	if ($defender.AntivirusEnabled) {
		Start-MpScan -ScanType CustomScan -ScanPath $BundleDirectory -ErrorAction Stop
		$detections = @(Get-MpThreatDetection -ErrorAction Stop | Where-Object { ($_.Resources -join ' ') -like "*$BundleDirectory*" })
		Add-Result 'Microsoft Defender custom scan' @{ Available = $true; DetectionCount = $detections.Count; Detections = $detections }
	} else { Add-Result 'Microsoft Defender custom scan' @{ Available = $false; Reason = 'Antivirus is not enabled on runner; no security settings changed' } }
} catch { Add-Result 'Microsoft Defender custom scan' @{ Available = $false; Reason = $_.Exception.Message } }

$hashes = @($exe[0], $msi[0]) | ForEach-Object { [pscustomobject]@{ Name = $_.Name; SHA256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant(); Bytes = $_.Length } }
$hashes | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $EvidenceDirectory 'installer-hashes.json') -Encoding utf8
Add-Result 'Completed' @{ AtUtc = [DateTime]::UtcNow.ToString('o') }
