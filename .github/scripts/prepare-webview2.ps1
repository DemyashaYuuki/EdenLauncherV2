param(
	[string]$CacheDirectory = (Join-Path $env:LOCALAPPDATA 'tauri'),
	[string]$EvidenceDirectory = (Join-Path $PWD 'windows-installer-evidence')
)

$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $CacheDirectory, $EvidenceDirectory | Out-Null
$sourceUrl = 'https://go.microsoft.com/fwlink/p/?LinkId=2124703'
$candidate = Join-Path $CacheDirectory ('webview2-' + [guid]::NewGuid().ToString('N') + '.exe')
$handler = [Net.Http.HttpClientHandler]::new()
$handler.AllowAutoRedirect = $false
$client = [Net.Http.HttpClient]::new($handler)
$client.Timeout = [TimeSpan]::FromMinutes(5)

try {
	$uri = [uri]$sourceUrl
	for ($redirects = 0; $redirects -le 10; $redirects++) {
		if ($uri.Scheme -ne 'https') { throw 'WebView2 download attempted a non-HTTPS redirect' }
		$response = $client.GetAsync($uri).GetAwaiter().GetResult()
		if ([int]$response.StatusCode -in @(301, 302, 303, 307, 308)) {
			if (!$response.Headers.Location) { throw 'WebView2 redirect has no destination' }
			$uri = [uri]::new($uri, $response.Headers.Location)
			$response.Dispose()
			continue
		}
		$response.EnsureSuccessStatusCode() | Out-Null
		if ($uri.Host -ne 'msedge.sf.dl.delivery.mp.microsoft.com') {
			throw "Unexpected WebView2 download host: $($uri.Host)"
		}
		[IO.File]::WriteAllBytes($candidate, $response.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult())
		$response.Dispose()
		break
	}
	if (!(Test-Path -LiteralPath $candidate)) { throw 'WebView2 download did not complete' }
	$signature = Get-AuthenticodeSignature -LiteralPath $candidate
	if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch '(^|,\s*)CN=Microsoft Corporation(,|$)') {
		throw "WebView2 signature rejected: $($signature.Status) / $($signature.StatusMessage)"
	}
	$hash = (Get-FileHash -LiteralPath $candidate -Algorithm SHA256).Hash.ToLowerInvariant()
	$record = [ordered]@{
		SourceUrl = $sourceUrl
		FinalUrl = $uri.AbsoluteUri
		SHA256 = $hash
		Bytes = (Get-Item -LiteralPath $candidate).Length
		Status = [string]$signature.Status
		StatusMessage = $signature.StatusMessage
		Subject = $signature.SignerCertificate.Subject
		Issuer = $signature.SignerCertificate.Issuer
		Thumbprint = $signature.SignerCertificate.Thumbprint
		TimestampSubject = $signature.TimeStamperCertificate.Subject
		VerifiedAtUtc = [DateTime]::UtcNow.ToString('o')
	}
	$record | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $EvidenceDirectory 'webview2-signature.json') -Encoding utf8
	$target = Join-Path $CacheDirectory 'MicrosoftEdgeWebview2Setup.exe'
	Move-Item -LiteralPath $candidate -Destination $target -Force
	Copy-Item -LiteralPath $target -Destination (Join-Path $EvidenceDirectory 'MicrosoftEdgeWebview2Setup.exe') -Force
	Write-Output ($record | ConvertTo-Json)
} finally {
	$client.Dispose()
	$handler.Dispose()
}
