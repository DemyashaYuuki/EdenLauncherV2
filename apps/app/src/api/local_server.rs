use crate::api::{Result, TheseusSerializableError};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State as TauriState};
use theseus::prelude::{State as TheseusState, instance, jre};
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::Mutex;

const SERVER_DIRECTORY_NAME: &str = "edenworld-local-server";
const SERVER_JAR_NAME: &str = "fabric-server-launch.jar";
const SERVER_MOD_PATTERNS: &[&str] = &[
    "fabric-api-",
    "lithium-",
    "voicechat-",
    "placeholder-api-",
    "forcetablistheads-",
];
const SERVER_CONFIG_PATHS: &[&str] = &[
    "lithium.properties",
    "voicechat/voicechat-server.properties",
];

#[derive(Clone, Default)]
pub struct LocalServerManager {
    inner: Arc<Mutex<LocalServerRuntime>>,
}

#[derive(Default)]
struct LocalServerRuntime {
    child: Option<Arc<Mutex<Child>>>,
    stdin: Option<ChildStdin>,
    running: bool,
    prepared: bool,
    pid: Option<u32>,
    server_dir: Option<PathBuf>,
    java_path: Option<PathBuf>,
    java_major: Option<u32>,
    game_version: Option<String>,
    loader_version: Option<String>,
    port: u16,
    copied_mods: usize,
    excluded_mods: usize,
}

#[derive(Clone, Serialize)]
pub struct LocalServerStatus {
    prepared: bool,
    running: bool,
    pid: Option<u32>,
    directory: Option<String>,
    java_major: Option<u32>,
    game_version: Option<String>,
    loader_version: Option<String>,
    port: u16,
    connect_address: String,
    copied_mods: usize,
    excluded_mods: usize,
}

#[derive(Clone, Serialize)]
struct LocalServerProgress {
    stage: &'static str,
    message: String,
    progress: u8,
}

#[derive(Clone, Serialize)]
struct LocalServerConsoleEvent {
    stream: &'static str,
    line: String,
}

#[derive(Clone, Serialize)]
struct LocalServerStateEvent {
    running: bool,
    pid: Option<u32>,
    exit_code: Option<i32>,
}

#[derive(Deserialize)]
struct FabricInstallerVersion {
    version: String,
    stable: bool,
}

pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("local-server")
        .invoke_handler(tauri::generate_handler![
            local_server_status,
            local_server_prepare,
            local_server_start,
            local_server_send_command,
            local_server_stop,
            local_server_force_stop,
        ])
        .build()
}

fn server_error(message: impl Into<String>) -> TheseusSerializableError {
    std::io::Error::other(message.into()).into()
}

fn status_from_runtime(runtime: &LocalServerRuntime) -> LocalServerStatus {
    let port = if runtime.port == 0 { 25565 } else { runtime.port };
    LocalServerStatus {
        prepared: runtime.prepared,
        running: runtime.running,
        pid: runtime.pid,
        directory: runtime
            .server_dir
            .as_ref()
            .map(|path| path.to_string_lossy().into_owned()),
        java_major: runtime.java_major,
        game_version: runtime.game_version.clone(),
        loader_version: runtime.loader_version.clone(),
        port,
        connect_address: format!("localhost:{port}"),
        copied_mods: runtime.copied_mods,
        excluded_mods: runtime.excluded_mods,
    }
}

fn emit_progress(
    app: &AppHandle,
    stage: &'static str,
    message: impl Into<String>,
    progress: u8,
) {
    let _ = app.emit(
        "local-server-progress",
        LocalServerProgress {
            stage,
            message: message.into(),
            progress,
        },
    );
}

fn required_java_major(game_version: &str) -> u32 {
    let mut parts = game_version.split('.');
    let major = parts.next().and_then(|part| part.parse::<u32>().ok());
    let minor = parts.next().and_then(|part| part.parse::<u32>().ok());
    let patch = parts.next().and_then(|part| part.parse::<u32>().ok());

    match (major, minor, patch) {
        (Some(1), Some(minor), Some(patch)) if minor > 20 || (minor == 20 && patch >= 5) => 21,
        (Some(1), Some(minor), _) if minor >= 18 => 17,
        _ => 8,
    }
}

fn is_server_mod(file_name: &str) -> bool {
    let normalized = file_name.to_ascii_lowercase();
    SERVER_MOD_PATTERNS
        .iter()
        .any(|pattern| normalized.starts_with(pattern))
}

async fn resolve_server_java(java_major: u32) -> Result<PathBuf> {
    let installed_versions = jre::get_java_versions().await?;
    let saved_path = installed_versions
        .get(&java_major)
        .map(|version| PathBuf::from(&version.path));

    let mut java_path = if let Some(path) = saved_path
        && tokio::fs::try_exists(&path).await?
    {
        path
    } else {
        jre::auto_install_java(java_major).await?
    };

    // EdenLauncher normally keeps javaw.exe for the game client on Windows.
    // The local server needs java.exe so its redirected stdout/stderr reach
    // the console embedded in the launcher.
    #[cfg(target_os = "windows")]
    {
        let console_java = java_path.with_file_name("java.exe");
        if tokio::fs::try_exists(&console_java).await? {
            java_path = console_java;
        }
    }

    Ok(java_path)
}

async fn copy_directory(source: &Path, destination: &Path) -> Result<()> {
    if !tokio::fs::try_exists(source).await? {
        return Ok(());
    }

    let mut pending = vec![(source.to_path_buf(), destination.to_path_buf())];
    while let Some((current_source, current_destination)) = pending.pop() {
        tokio::fs::create_dir_all(&current_destination).await?;
        let mut entries = tokio::fs::read_dir(&current_source).await?;
        while let Some(entry) = entries.next_entry().await? {
            let file_type = entry.file_type().await?;
            let target = current_destination.join(entry.file_name());
            if file_type.is_dir() {
                pending.push((entry.path(), target));
            } else if file_type.is_file() {
                tokio::fs::copy(entry.path(), target).await?;
            }
        }
    }

    Ok(())
}

async fn copy_server_mods(source: &Path, destination: &Path) -> Result<(usize, usize)> {
    tokio::fs::create_dir_all(destination).await?;
    if !tokio::fs::try_exists(source).await? {
        return Ok((0, 0));
    }

    let mut copied = 0;
    let mut excluded = 0;
    let mut entries = tokio::fs::read_dir(source).await?;
    while let Some(entry) = entries.next_entry().await? {
        if !entry.file_type().await?.is_file() {
            continue;
        }

        let file_name = entry.file_name().to_string_lossy().into_owned();
        if is_server_mod(&file_name) {
            tokio::fs::copy(entry.path(), destination.join(&file_name)).await?;
            copied += 1;
        } else if file_name.to_ascii_lowercase().ends_with(".jar") {
            excluded += 1;
        }
    }

    Ok((copied, excluded))
}

async fn copy_server_configs(source: &Path, destination: &Path) -> Result<()> {
    for relative_path in SERVER_CONFIG_PATHS {
        let source_path = source.join(relative_path);
        if !tokio::fs::try_exists(&source_path).await? {
            continue;
        }
        let destination_path = destination.join(relative_path);
        if let Some(parent) = destination_path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        tokio::fs::copy(source_path, destination_path).await?;
    }
    Ok(())
}

async fn response_bytes(
    response: tauri_plugin_http::reqwest::Response,
    context: &str,
) -> Result<Vec<u8>> {
    let status = response.status();
    if !status.is_success() {
        return Err(server_error(format!("{context}: HTTP {status}")));
    }
    response
        .bytes()
        .await
        .map(|bytes| bytes.to_vec())
        .map_err(|error| server_error(format!("{context}: {error}")))
}

async fn download_fabric_server(
    destination: &Path,
    game_version: &str,
    loader_version: &str,
) -> Result<()> {
    let client = tauri_plugin_http::reqwest::Client::builder()
        .timeout(Duration::from_secs(180))
        .build()
        .map_err(|error| server_error(format!("Не удалось создать HTTP-клиент: {error}")))?;

    let installers_response = client
        .get("https://meta.fabricmc.net/v2/versions/installer")
        .send()
        .await
        .map_err(|error| server_error(format!("Не удалось получить версии Fabric Installer: {error}")))?;
    let installers = response_bytes(installers_response, "Fabric Installer")
        .await
        .and_then(|bytes| {
            serde_json::from_slice::<Vec<FabricInstallerVersion>>(&bytes)
                .map_err(|error| server_error(format!("Некорректный ответ Fabric Meta: {error}")))
        })?;
    let installer = installers
        .iter()
        .find(|installer| installer.stable)
        .or_else(|| installers.first())
        .ok_or_else(|| server_error("Fabric Meta не вернул доступную версию установщика."))?;

    let game_version = urlencoding::encode(game_version);
    let loader_version = urlencoding::encode(loader_version);
    let installer_version = urlencoding::encode(&installer.version);
    let download_url = format!(
        "https://meta.fabricmc.net/v2/versions/loader/{game_version}/{loader_version}/{installer_version}/server/jar"
    );
    let jar_response = client
        .get(download_url)
        .send()
        .await
        .map_err(|error| server_error(format!("Не удалось скачать сервер Fabric: {error}")))?;
    let jar = response_bytes(jar_response, "Сервер Fabric").await?;
    let temporary_path = destination.with_extension("jar.part");
    tokio::fs::write(&temporary_path, jar).await?;
    if tokio::fs::try_exists(destination).await? {
        tokio::fs::remove_file(destination).await?;
    }
    tokio::fs::rename(temporary_path, destination).await?;
    Ok(())
}

async fn write_server_properties(server_dir: &Path, port: u16) -> Result<()> {
    let path = server_dir.join("server.properties");
    let existing = if tokio::fs::try_exists(&path).await? {
        tokio::fs::read_to_string(&path).await.unwrap_or_default()
    } else {
        String::new()
    };
    let managed = [
        ("server-port", port.to_string()),
        ("server-ip", String::new()),
        ("online-mode", "false".to_string()),
        ("motd", "EdenWorld — локальный сервер".to_string()),
        ("allow-flight", "true".to_string()),
    ];
    let mut lines = existing
        .lines()
        .filter(|line| {
            !managed
                .iter()
                .any(|(key, _)| line.trim_start().starts_with(&format!("{key}=")))
        })
        .map(str::to_string)
        .collect::<Vec<_>>();
    lines.extend(managed.into_iter().map(|(key, value)| format!("{key}={value}")));
    tokio::fs::write(path, format!("{}\n", lines.join("\n"))).await?;
    Ok(())
}

async fn emit_console_lines<R>(app: AppHandle, reader: R, stream: &'static str)
where
    R: AsyncRead + Unpin + Send + 'static,
{
    let mut lines = BufReader::new(reader).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        let _ = app.emit(
            "local-server-console",
            LocalServerConsoleEvent { stream, line },
        );
    }
}

#[tauri::command]
pub async fn local_server_status(
    manager: TauriState<'_, LocalServerManager>,
) -> Result<LocalServerStatus> {
    Ok(status_from_runtime(&manager.inner.lock().await))
}

#[tauri::command]
pub async fn local_server_prepare(
    app: AppHandle,
    manager: TauriState<'_, LocalServerManager>,
    instance_id: String,
    game_version: String,
    loader: String,
    loader_version: String,
) -> Result<LocalServerStatus> {
    if loader != "fabric" {
        return Err(server_error(format!(
            "Локальный сервер EdenWorld поддерживает Fabric, а сборка использует {loader}."
        )));
    }
    if loader_version.trim().is_empty() {
        return Err(server_error("Не удалось определить версию Fabric Loader."));
    }
    if manager.inner.lock().await.running {
        return Err(server_error("Остановите локальный сервер перед повторной подготовкой."));
    }

    emit_progress(&app, "java", "Проверяем и загружаем необходимую Java…", 8);
    let java_major = required_java_major(&game_version);
    let java_path = resolve_server_java(java_major).await?;

    emit_progress(&app, "files", "Подготавливаем серверные файлы сборки…", 42);
    let instance_path = instance::get_full_path(&instance_id).await?;
    let state = TheseusState::get().await?;
    let server_dir = state.directories.config_dir.join(SERVER_DIRECTORY_NAME);
    tokio::fs::create_dir_all(&server_dir).await?;

    let (copied_mods, excluded_mods) = copy_server_mods(
        &instance_path.join("mods"),
        &server_dir.join("mods"),
    )
    .await?;
    copy_server_configs(&instance_path.join("config"), &server_dir.join("config")).await?;
    copy_directory(
        &instance_path.join("defaultconfigs"),
        &server_dir.join("defaultconfigs"),
    )
    .await?;

    emit_progress(&app, "fabric", "Загружаем серверное ядро Fabric…", 68);
    download_fabric_server(
        &server_dir.join(SERVER_JAR_NAME),
        &game_version,
        &loader_version,
    )
    .await?;
    tokio::fs::write(server_dir.join("eula.txt"), "eula=true\n").await?;
    write_server_properties(&server_dir, 25565).await?;

    let mut runtime = manager.inner.lock().await;
    runtime.prepared = true;
    runtime.server_dir = Some(server_dir);
    runtime.java_path = Some(java_path);
    runtime.java_major = Some(java_major);
    runtime.game_version = Some(game_version);
    runtime.loader_version = Some(loader_version);
    runtime.port = 25565;
    runtime.copied_mods = copied_mods;
    runtime.excluded_mods = excluded_mods;
    let status = status_from_runtime(&runtime);
    drop(runtime);

    emit_progress(&app, "ready", "Локальный сервер готов к запуску.", 100);
    Ok(status)
}

#[tauri::command]
pub async fn local_server_start(
    app: AppHandle,
    manager: TauriState<'_, LocalServerManager>,
    memory_mb: u32,
    port: u16,
) -> Result<LocalServerStatus> {
    if !(1024..=32768).contains(&memory_mb) {
        return Err(server_error("Для сервера можно выделить от 1024 до 32768 МБ ОЗУ."));
    }
    if port < 1024 {
        return Err(server_error("Используйте порт от 1024 до 65535."));
    }

    let mut runtime = manager.inner.lock().await;
    if runtime.running {
        return Ok(status_from_runtime(&runtime));
    }
    if !runtime.prepared {
        return Err(server_error("Сначала подготовьте файлы локального сервера."));
    }
    let server_dir = runtime
        .server_dir
        .clone()
        .ok_or_else(|| server_error("Каталог локального сервера не найден."))?;
    let java_path = runtime
        .java_path
        .clone()
        .ok_or_else(|| server_error("Java для локального сервера не подготовлена."))?;
    write_server_properties(&server_dir, port).await?;

    let mut command = Command::new(java_path);
    command
        .current_dir(&server_dir)
        .arg(format!("-Xms{}M", memory_mb.min(2048)))
        .arg(format!("-Xmx{memory_mb}M"))
        .arg("-jar")
        .arg(SERVER_JAR_NAME)
        .arg("nogui")
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.as_std_mut().creation_flags(0x08000000);
    }

    let mut child = command.spawn()?;
    let pid = child.id();
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| server_error("Не удалось открыть ввод консоли сервера."))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| server_error("Не удалось открыть вывод консоли сервера."))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| server_error("Не удалось открыть поток ошибок сервера."))?;
    let child = Arc::new(Mutex::new(child));

    runtime.child = Some(child.clone());
    runtime.stdin = Some(stdin);
    runtime.running = true;
    runtime.pid = pid;
    runtime.port = port;
    let status = status_from_runtime(&runtime);
    drop(runtime);

    let _ = app.emit(
        "local-server-state",
        LocalServerStateEvent {
            running: true,
            pid,
            exit_code: None,
        },
    );
    tokio::spawn(emit_console_lines(app.clone(), stdout, "stdout"));
    tokio::spawn(emit_console_lines(app.clone(), stderr, "stderr"));

    let manager = manager.inner.clone();
    tokio::spawn(async move {
        let exit_status = loop {
            let result = child.lock().await.try_wait();
            match result {
                Ok(Some(status)) => break Some(status),
                Ok(None) => tokio::time::sleep(Duration::from_millis(450)).await,
                Err(error) => {
                    let _ = app.emit(
                        "local-server-console",
                        LocalServerConsoleEvent {
                            stream: "stderr",
                            line: format!("Не удалось проверить состояние сервера: {error}"),
                        },
                    );
                    break None;
                }
            }
        };

        let mut runtime = manager.lock().await;
        runtime.running = false;
        runtime.pid = None;
        runtime.stdin = None;
        runtime.child = None;
        drop(runtime);
        let _ = app.emit(
            "local-server-state",
            LocalServerStateEvent {
                running: false,
                pid: None,
                exit_code: exit_status.and_then(|status| status.code()),
            },
        );
    });

    Ok(status)
}

#[tauri::command]
pub async fn local_server_send_command(
    manager: TauriState<'_, LocalServerManager>,
    command: String,
) -> Result<()> {
    let command = command.trim();
    if command.is_empty() {
        return Ok(());
    }
    if command.len() > 512 {
        return Err(server_error("Команда консоли слишком длинная."));
    }

    let mut runtime = manager.inner.lock().await;
    let stdin = runtime
        .stdin
        .as_mut()
        .ok_or_else(|| server_error("Локальный сервер не запущен."))?;
    stdin.write_all(format!("{command}\n").as_bytes()).await?;
    stdin.flush().await?;
    Ok(())
}

#[tauri::command]
pub async fn local_server_stop(
    manager: TauriState<'_, LocalServerManager>,
) -> Result<()> {
    let mut runtime = manager.inner.lock().await;
    let stdin = runtime
        .stdin
        .as_mut()
        .ok_or_else(|| server_error("Локальный сервер не запущен."))?;
    stdin.write_all(b"stop\n").await?;
    stdin.flush().await?;
    Ok(())
}

#[tauri::command]
pub async fn local_server_force_stop(
    manager: TauriState<'_, LocalServerManager>,
) -> Result<()> {
    let child = manager
        .inner
        .lock()
        .await
        .child
        .clone()
        .ok_or_else(|| server_error("Локальный сервер не запущен."))?;
    child.lock().await.kill().await?;
    Ok(())
}
