use crate::api::{Result, TheseusSerializableError};
use async_zip::base::read::seek::ZipFileReader;
use async_zip::tokio::write::ZipFileWriter;
use async_zip::{Compression, ZipEntryBuilder};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Runtime, State as TauriState};
use theseus::prelude::{State as TheseusState, instance, jre};
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::Mutex;
use uuid::Uuid;

const SERVERS_DIRECTORY_NAME: &str = "eden-servers";
const PROFILES_FILE_NAME: &str = "profiles.json";
const SERVER_JAR_NAME: &str = "server.jar";
const CLIENT_ONLY_PATTERNS: &[&str] = &[
    "sodium", "iris", "indium", "modmenu", "reeses-sodium", "entityculling",
    "dynamic-fps", "lambdynamiclights", "continuity", "citresewn", "notenoughanimations",
    "skinlayers", "appleskin", "betterf3", "xaeros_minimap", "xaerosworldmap",
    "journeymap", "emi-", "rei-", "jei-", "controlling", "mouse-tweaks",
    "inventoryprofilesnext", "shulkerboxtooltip", "notenoughcrashes", "zoomify",
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
    pid: Option<u32>,
    profile_id: Option<String>,
    java_path: Option<PathBuf>,
    java_major: Option<u32>,
    copied_mods: usize,
    excluded_mods: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LocalServerProfile {
    id: String,
    name: String,
    directory: String,
    core: String,
    game_version: String,
    loader_version: Option<String>,
    memory_mb: u32,
    port: u16,
    offline_mode: bool,
    icon_path: Option<String>,
    core_jar: Option<String>,
    source_instance_id: Option<String>,
    prepared: bool,
    created_at: String,
}

#[derive(Clone, Serialize)]
pub struct LocalServerStatus {
    profile: Option<LocalServerProfile>,
    prepared: bool,
    running: bool,
    pid: Option<u32>,
    directory: Option<String>,
    java_major: Option<u32>,
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
    profile_id: Option<String>,
}

#[derive(Serialize)]
pub struct ServerPackResult {
    destination: String,
    copied_mods: usize,
    excluded_mods: usize,
}

#[derive(Deserialize)]
struct FabricInstallerVersion {
    version: String,
    stable: bool,
}

#[derive(Deserialize)]
struct FabricLoaderVersion {
    loader: FabricLoaderInfo,
}

#[derive(Deserialize)]
struct FabricLoaderInfo {
    version: String,
    stable: bool,
}

pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::<R>::new("local-server")
        .invoke_handler(tauri::generate_handler![
            local_server_list,
            local_server_create,
            local_server_remove,
            local_server_status,
            local_server_prepare,
            local_server_start,
            local_server_add_content,
            local_server_convert_instance,
            local_server_send_command,
            local_server_stop,
            local_server_force_stop,
        ])
        .build()
}

fn server_error(message: impl Into<String>) -> TheseusSerializableError {
    std::io::Error::other(message.into()).into()
}

async fn servers_root() -> Result<PathBuf> {
    let state = TheseusState::get().await?;
    Ok(state.directories.config_dir.join(SERVERS_DIRECTORY_NAME))
}

async fn load_profiles() -> Result<Vec<LocalServerProfile>> {
    let path = servers_root().await?.join(PROFILES_FILE_NAME);
    if !tokio::fs::try_exists(&path).await? {
        return Ok(Vec::new());
    }
    let bytes = tokio::fs::read(&path).await?;
    serde_json::from_slice(&bytes)
        .map_err(|error| server_error(format!("Не удалось прочитать список серверов: {error}")))
}

async fn save_profiles(profiles: &[LocalServerProfile]) -> Result<()> {
    let root = servers_root().await?;
    tokio::fs::create_dir_all(&root).await?;
    let path = root.join(PROFILES_FILE_NAME);
    let temporary = root.join(format!("{PROFILES_FILE_NAME}.part"));
    let json = serde_json::to_vec_pretty(profiles)
        .map_err(|error| server_error(format!("Не удалось сохранить список серверов: {error}")))?;
    tokio::fs::write(&temporary, json).await?;
    if tokio::fs::try_exists(&path).await? {
        tokio::fs::remove_file(&path).await?;
    }
    tokio::fs::rename(temporary, path).await?;
    Ok(())
}

fn find_profile(
    profiles: &[LocalServerProfile],
    profile_id: &str,
) -> Result<LocalServerProfile> {
    profiles
        .iter()
        .find(|profile| profile.id == profile_id)
        .cloned()
        .ok_or_else(|| server_error("Сервер не найден."))
}

fn profile_directory(profile: &LocalServerProfile) -> PathBuf {
    PathBuf::from(&profile.directory)
}

fn status_from(
    runtime: &LocalServerRuntime,
    profile: Option<LocalServerProfile>,
) -> LocalServerStatus {
    let port = profile.as_ref().map(|item| item.port).unwrap_or(25565);
    let directory = profile.as_ref().map(|item| item.directory.clone());
    let prepared = profile.as_ref().is_some_and(|item| {
        item.prepared && profile_directory(item).join(SERVER_JAR_NAME).is_file()
    });
    let is_active_profile = profile.as_ref().is_some_and(|item| {
        runtime.profile_id.as_deref() == Some(item.id.as_str())
    });
    LocalServerStatus {
        profile,
        prepared,
        running: runtime.running && is_active_profile,
        pid: if is_active_profile { runtime.pid } else { None },
        directory,
        java_major: runtime.java_major,
        port,
        connect_address: format!("localhost:{port}"),
        copied_mods: runtime.copied_mods,
        excluded_mods: runtime.excluded_mods,
    }
}

fn emit_progress<R: Runtime>(
    app: &AppHandle<R>,
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
        (Some(26), _, _) => 25,
        (Some(1), Some(minor), patch)
            if minor > 20 || (minor == 20 && patch.unwrap_or_default() >= 5) => 21,
        (Some(1), Some(minor), _) if minor >= 18 => 17,
        _ => 8,
    }
}

async fn resolve_server_java(java_major: u32) -> Result<PathBuf> {
    let installed_versions = jre::get_java_versions().await?;
    let saved_path = installed_versions
        .get(&java_major)
        .map(|version| PathBuf::from(&version.path));
    let java_path = if let Some(path) = saved_path
        && tokio::fs::try_exists(&path).await?
    {
        path
    } else {
        jre::auto_install_java(java_major).await?
    };
    #[cfg(target_os = "windows")]
    let java_path = {
        let console_java = java_path.with_file_name("java.exe");
        if tokio::fs::try_exists(&console_java).await? {
            console_java
        } else {
            java_path
        }
    };
    Ok(java_path)
}

fn valid_core(core: &str) -> bool {
    matches!(core, "vanilla" | "fabric" | "paper" | "purpur" | "forge" | "neoforge")
}

fn content_directory(profile: &LocalServerProfile) -> &'static str {
    if matches!(profile.core.as_str(), "paper" | "purpur") {
        "plugins"
    } else if profile.core == "vanilla" {
        "world/datapacks"
    } else {
        "mods"
    }
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

fn http_client() -> Result<tauri_plugin_http::reqwest::Client> {
    tauri_plugin_http::reqwest::Client::builder()
        .timeout(Duration::from_secs(240))
        .user_agent("EdenLauncher/2 (https://edenworld.fun/)")
        .build()
        .map_err(|error| server_error(format!("Не удалось создать HTTP-клиент: {error}")))
}

async fn download_to(url: &str, destination: &Path, context: &str) -> Result<()> {
    let response = http_client()?
        .get(url)
        .send()
        .await
        .map_err(|error| server_error(format!("{context}: {error}")))?;
    let data = response_bytes(response, context).await?;
    let temporary = destination.with_extension("jar.part");
    tokio::fs::write(&temporary, data).await?;
    if tokio::fs::try_exists(destination).await? {
        tokio::fs::remove_file(destination).await?;
    }
    tokio::fs::rename(temporary, destination).await?;
    Ok(())
}

async fn download_fabric_server(
    destination: &Path,
    game_version: &str,
    requested_loader: Option<&str>,
) -> Result<String> {
    let client = http_client()?;
    let installers = response_bytes(
        client.get("https://meta.fabricmc.net/v2/versions/installer").send().await
            .map_err(|error| server_error(format!("Fabric Installer: {error}")))?,
        "Fabric Installer",
    ).await.and_then(|bytes| serde_json::from_slice::<Vec<FabricInstallerVersion>>(&bytes)
        .map_err(|error| server_error(format!("Некорректный ответ Fabric Meta: {error}"))))?;
    let installer = installers.iter().find(|item| item.stable).or_else(|| installers.first())
        .ok_or_else(|| server_error("Fabric не вернул доступный установщик."))?;
    let loader = if let Some(loader) = requested_loader.filter(|value| !value.trim().is_empty()) {
        loader.to_string()
    } else {
        let url = format!("https://meta.fabricmc.net/v2/versions/loader/{}", urlencoding::encode(game_version));
        let loaders = response_bytes(client.get(url).send().await
            .map_err(|error| server_error(format!("Fabric Loader: {error}")))?, "Fabric Loader")
            .await.and_then(|bytes| serde_json::from_slice::<Vec<FabricLoaderVersion>>(&bytes)
                .map_err(|error| server_error(format!("Некорректный ответ Fabric Loader: {error}"))))?;
        loaders.iter().find(|item| item.loader.stable).or_else(|| loaders.first())
            .map(|item| item.loader.version.clone())
            .ok_or_else(|| server_error("Fabric не поддерживает выбранную версию Minecraft."))?
    };
    let url = format!(
        "https://meta.fabricmc.net/v2/versions/loader/{}/{}/{}/server/jar",
        urlencoding::encode(game_version), urlencoding::encode(&loader),
        urlencoding::encode(&installer.version),
    );
    download_to(&url, destination, "Сервер Fabric").await?;
    Ok(loader)
}

async fn download_vanilla_server(destination: &Path, game_version: &str) -> Result<()> {
    let client = http_client()?;
    let manifest: Value = serde_json::from_slice(&response_bytes(
        client.get("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json").send().await
            .map_err(|error| server_error(format!("Minecraft manifest: {error}")))?,
        "Minecraft manifest",
    ).await?).map_err(|error| server_error(format!("Некорректный manifest Mojang: {error}")))?;
    let version_url = manifest["versions"].as_array()
        .and_then(|items| items.iter().find(|item| item["id"].as_str() == Some(game_version)))
        .and_then(|item| item["url"].as_str())
        .ok_or_else(|| server_error("У Mojang нет серверного ядра для этой версии."))?;
    let version: Value = serde_json::from_slice(&response_bytes(
        client.get(version_url).send().await
            .map_err(|error| server_error(format!("Minecraft version: {error}")))?,
        "Minecraft version",
    ).await?).map_err(|error| server_error(format!("Некорректные данные версии Minecraft: {error}")))?;
    let url = version["downloads"]["server"]["url"].as_str()
        .ok_or_else(|| server_error("Для выбранной версии не опубликован server.jar."))?;
    download_to(url, destination, "Vanilla server").await
}

async fn download_paper_server(destination: &Path, game_version: &str) -> Result<()> {
    let url = format!("https://fill.papermc.io/v3/projects/paper/versions/{}/builds", urlencoding::encode(game_version));
    let builds: Value = serde_json::from_slice(&response_bytes(
        http_client()?.get(url).send().await
            .map_err(|error| server_error(format!("Paper: {error}")))?, "Paper",
    ).await?).map_err(|error| server_error(format!("Некорректный ответ Paper: {error}")))?;
    let list = builds.as_array().ok_or_else(|| server_error("Paper не вернул список сборок."))?;
    let build = list.iter().find(|item| item["channel"].as_str() == Some("STABLE"))
        .or_else(|| list.first()).ok_or_else(|| server_error("Для этой версии Paper пока нет ядра."))?;
    let download_url = build["downloads"]["server:default"]["url"].as_str()
        .ok_or_else(|| server_error("Paper не вернул ссылку на server.jar."))?;
    download_to(download_url, destination, "Paper server").await
}

async fn download_core(profile: &mut LocalServerProfile) -> Result<()> {
    let destination = profile_directory(profile).join(SERVER_JAR_NAME);
    if tokio::fs::try_exists(&destination).await? {
        profile.core_jar = Some(destination.to_string_lossy().into_owned());
        return Ok(());
    }
    if let Some(selected_jar) = profile.core_jar.as_ref() {
        let selected_jar = PathBuf::from(selected_jar);
        if selected_jar != destination && tokio::fs::try_exists(&selected_jar).await? {
            tokio::fs::copy(selected_jar, &destination).await?;
            profile.core_jar = Some(destination.to_string_lossy().into_owned());
            return Ok(());
        }
    }
    match profile.core.as_str() {
        "vanilla" => download_vanilla_server(&destination, &profile.game_version).await?,
        "fabric" => {
            let loader = download_fabric_server(
                &destination, &profile.game_version, profile.loader_version.as_deref(),
            ).await?;
            profile.loader_version = Some(loader);
        }
        "paper" => download_paper_server(&destination, &profile.game_version).await?,
        "purpur" => {
            let url = format!("https://api.purpurmc.org/v2/purpur/{}/latest/download", urlencoding::encode(&profile.game_version));
            download_to(&url, &destination, "Purpur server").await?;
        }
        "forge" | "neoforge" => return Err(server_error(
            "Для Forge и NeoForge выберите готовый запускаемый файл ядра .jar в мастере.",
        )),
        _ => return Err(server_error("Неизвестный тип серверного ядра.")),
    }
    profile.core_jar = Some(destination.to_string_lossy().into_owned());
    Ok(())
}

async fn write_server_properties(profile: &LocalServerProfile) -> Result<()> {
    let path = profile_directory(profile).join("server.properties");
    let existing = if tokio::fs::try_exists(&path).await? {
        tokio::fs::read_to_string(&path).await.unwrap_or_default()
    } else { String::new() };
    let managed = [
        ("server-port", profile.port.to_string()),
        ("server-ip", String::new()),
        ("online-mode", (!profile.offline_mode).to_string()),
        ("motd", format!("{} — EdenLauncher", profile.name)),
        ("allow-flight", "true".to_string()),
    ];
    let mut lines = existing.lines().filter(|line| !managed.iter().any(|(key, _)| {
        line.trim_start().starts_with(&format!("{key}="))
    })).map(str::to_string).collect::<Vec<_>>();
    lines.extend(managed.into_iter().map(|(key, value)| format!("{key}={value}")));
    tokio::fs::write(path, format!("{}\n", lines.join("\n"))).await?;
    Ok(())
}

async fn copy_directory(source: &Path, destination: &Path) -> Result<()> {
    if !tokio::fs::try_exists(source).await? { return Ok(()); }
    let mut pending = vec![(source.to_path_buf(), destination.to_path_buf())];
    while let Some((current_source, current_destination)) = pending.pop() {
        tokio::fs::create_dir_all(&current_destination).await?;
        let mut entries = tokio::fs::read_dir(&current_source).await?;
        while let Some(entry) = entries.next_entry().await? {
            let target = current_destination.join(entry.file_name());
            if entry.file_type().await?.is_dir() {
                pending.push((entry.path(), target));
            } else if entry.file_type().await?.is_file() {
                tokio::fs::copy(entry.path(), target).await?;
            }
        }
    }
    Ok(())
}

async fn jar_declares_client_only(path: &Path) -> bool {
    let Ok(bytes) = tokio::fs::read(path).await else { return false; };
    let Ok(mut reader) = ZipFileReader::with_tokio(Cursor::new(bytes)).await else { return false; };
    let entries = reader.file().entries().iter().enumerate()
        .filter_map(|(index, entry)| entry.filename().as_str().ok().map(|name| (index, name.to_string())))
        .collect::<Vec<_>>();
    for (index, name) in entries {
        if name == "fabric.mod.json" || name == "quilt.mod.json" {
            let mut text = String::new();
            if let Ok(mut entry) = reader.reader_with_entry(index).await
                && entry.read_to_string_checked(&mut text).await.is_ok()
            {
                if let Ok(json) = serde_json::from_str::<Value>(&text) {
                    if json["environment"].as_str() == Some("client")
                        || json["quilt_loader"]["metadata"]["environment"].as_str() == Some("client")
                    { return true; }
                }
            }
        }
    }
    false
}

async fn copy_server_mods(source: &Path, destination: &Path) -> Result<(usize, usize)> {
    tokio::fs::create_dir_all(destination).await?;
    if !tokio::fs::try_exists(source).await? { return Ok((0, 0)); }
    let mut copied = 0;
    let mut excluded = 0;
    let mut entries = tokio::fs::read_dir(source).await?;
    while let Some(entry) = entries.next_entry().await? {
        if !entry.file_type().await?.is_file() { continue; }
        let file_name = entry.file_name().to_string_lossy().into_owned();
        if !file_name.to_ascii_lowercase().ends_with(".jar") { continue; }
        let normalized = file_name.to_ascii_lowercase();
        let client_only = CLIENT_ONLY_PATTERNS.iter().any(|pattern| normalized.contains(pattern))
            || jar_declares_client_only(&entry.path()).await;
        if client_only {
            let previously_copied = destination.join(&file_name);
            if tokio::fs::try_exists(&previously_copied).await? {
                tokio::fs::remove_file(previously_copied).await?;
            }
            excluded += 1;
        } else {
            tokio::fs::copy(entry.path(), destination.join(file_name)).await?;
            copied += 1;
        }
    }
    Ok((copied, excluded))
}

async fn convert_instance(instance_id: &str, destination: &Path) -> Result<(usize, usize)> {
    let source = instance::get_full_path(instance_id).await?;
    let result = copy_server_mods(&source.join("mods"), &destination.join("mods")).await?;
    copy_directory(&source.join("config"), &destination.join("config")).await?;
    copy_directory(&source.join("defaultconfigs"), &destination.join("defaultconfigs")).await?;
    Ok(result)
}

async fn zip_directory(source: &Path, output: &Path) -> Result<()> {
    let file = tokio::fs::File::create(output).await?;
    let mut writer = ZipFileWriter::with_tokio(file);
    let mut pending = vec![source.to_path_buf()];
    while let Some(directory) = pending.pop() {
        let mut entries = tokio::fs::read_dir(&directory).await?;
        while let Some(entry) = entries.next_entry().await? {
            if entry.file_type().await?.is_dir() {
                pending.push(entry.path());
            } else if entry.file_type().await?.is_file() {
                let relative = entry.path().strip_prefix(source)
                    .map_err(|error| server_error(format!("Ошибка пути экспорта: {error}")))?
                    .to_string_lossy().replace('\\', "/");
                let data = tokio::fs::read(entry.path()).await?;
                writer.write_entry_whole(
                    ZipEntryBuilder::new(relative.into(), Compression::Deflate), &data,
                ).await.map_err(|error| server_error(format!("Ошибка ZIP-экспорта: {error}")))?;
            }
        }
    }
    writer.close().await.map_err(|error| server_error(format!("Не удалось завершить ZIP: {error}")))?;
    Ok(())
}

async fn emit_console_lines<R: Runtime, T>(app: AppHandle<R>, reader: T, stream: &'static str)
where T: AsyncRead + Unpin + Send + 'static {
    let mut lines = BufReader::new(reader).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        let _ = app.emit("local-server-console", LocalServerConsoleEvent { stream, line });
    }
}

#[tauri::command]
pub async fn local_server_list() -> Result<Vec<LocalServerProfile>> {
    load_profiles().await
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn local_server_create(
    name: String,
    directory: Option<String>,
    core: String,
    game_version: String,
    loader_version: Option<String>,
    memory_mb: u32,
    port: u16,
    offline_mode: bool,
    icon_path: Option<String>,
    core_jar: Option<String>,
    source_instance_id: Option<String>,
) -> Result<LocalServerProfile> {
    let name = name.trim();
    if name.is_empty() || name.len() > 64 { return Err(server_error("Введите название сервера до 64 символов.")); }
    if !valid_core(&core) { return Err(server_error("Выберите поддерживаемое серверное ядро.")); }
    if !(1024..=65535).contains(&port) { return Err(server_error("Порт должен быть от 1024 до 65535.")); }
    if !(1024..=65536).contains(&memory_mb) { return Err(server_error("Для сервера можно выделить от 1 до 64 ГБ ОЗУ.")); }
    let id = Uuid::new_v4().to_string();
    let directory = match directory.filter(|path| !path.trim().is_empty()) {
        Some(path) => PathBuf::from(path),
        None => servers_root().await?.join(&id),
    };
    tokio::fs::create_dir_all(&directory).await?;
    let icon_path = if let Some(source) = icon_path.filter(|path| !path.trim().is_empty()) {
        let source = PathBuf::from(source);
        if source.is_file() {
            let extension = source.extension().and_then(|value| value.to_str()).unwrap_or("png");
            let destination = directory.join(format!(".eden-server-icon.{extension}"));
            tokio::fs::copy(source, &destination).await?;
            Some(destination.to_string_lossy().into_owned())
        } else {
            None
        }
    } else {
        None
    };
    let profile = LocalServerProfile {
        id, name: name.to_string(), directory: directory.to_string_lossy().into_owned(), core,
        game_version: game_version.trim().to_string(), loader_version, memory_mb, port,
        offline_mode, icon_path, core_jar, source_instance_id, prepared: false,
        created_at: Utc::now().to_rfc3339(),
    };
    let mut profiles = load_profiles().await?;
    profiles.push(profile.clone());
    save_profiles(&profiles).await?;
    Ok(profile)
}

#[tauri::command]
pub async fn local_server_remove(
    manager: TauriState<'_, LocalServerManager>,
    profile_id: String,
) -> Result<()> {
    let runtime = manager.inner.lock().await;
    if runtime.running && runtime.profile_id.as_deref() == Some(profile_id.as_str()) {
        return Err(server_error("Сначала остановите этот сервер."));
    }
    drop(runtime);
    let mut profiles = load_profiles().await?;
    let before = profiles.len();
    profiles.retain(|profile| profile.id != profile_id);
    if profiles.len() == before { return Err(server_error("Сервер не найден.")); }
    save_profiles(&profiles).await
}

#[tauri::command]
pub async fn local_server_status(
    manager: TauriState<'_, LocalServerManager>,
    profile_id: Option<String>,
) -> Result<LocalServerStatus> {
    let target = {
        let runtime = manager.inner.lock().await;
        profile_id.or_else(|| runtime.profile_id.clone())
    };
    let profile = if let Some(id) = target {
        load_profiles().await?.into_iter().find(|profile| profile.id == id)
    } else { None };
    let runtime = manager.inner.lock().await;
    Ok(status_from(&runtime, profile))
}

#[tauri::command]
pub async fn local_server_prepare<R: Runtime>(
    app: AppHandle<R>, manager: TauriState<'_, LocalServerManager>, profile_id: String,
) -> Result<LocalServerStatus> {
    if manager.inner.lock().await.running { return Err(server_error("Остановите запущенный сервер.")); }
    let mut profiles = load_profiles().await?;
    let index = profiles.iter().position(|profile| profile.id == profile_id)
        .ok_or_else(|| server_error("Сервер не найден."))?;
    let mut profile = profiles[index].clone();
    let directory = profile_directory(&profile);
    tokio::fs::create_dir_all(&directory).await?;
    emit_progress(&app, "java", "Проверяем и загружаем подходящую Java…", 10);
    let java_major = required_java_major(&profile.game_version);
    let java_path = resolve_server_java(java_major).await?;
    let mut copied_mods = 0;
    let mut excluded_mods = 0;
    if let Some(instance_id) = profile.source_instance_id.as_deref() {
        emit_progress(&app, "files", "Переносим серверную часть сборки…", 38);
        (copied_mods, excluded_mods) = convert_instance(instance_id, &directory).await?;
    }
    emit_progress(&app, "core", format!("Подготавливаем ядро {}…", profile.core), 66);
    download_core(&mut profile).await?;
    tokio::fs::write(directory.join("eula.txt"), "eula=true\n").await?;
    write_server_properties(&profile).await?;
    profile.prepared = true;
    profiles[index] = profile.clone();
    save_profiles(&profiles).await?;
    let mut runtime = manager.inner.lock().await;
    runtime.profile_id = Some(profile.id.clone());
    runtime.java_path = Some(java_path);
    runtime.java_major = Some(java_major);
    runtime.copied_mods = copied_mods;
    runtime.excluded_mods = excluded_mods;
    let status = status_from(&runtime, Some(profile));
    drop(runtime);
    emit_progress(&app, "ready", "Сервер готов к запуску.", 100);
    Ok(status)
}

#[tauri::command]
pub async fn local_server_start<R: Runtime>(
    app: AppHandle<R>, manager: TauriState<'_, LocalServerManager>, profile_id: String,
) -> Result<LocalServerStatus> {
    let profile = find_profile(&load_profiles().await?, &profile_id)?;
    if !profile.prepared || !profile_directory(&profile).join(SERVER_JAR_NAME).is_file() {
        return Err(server_error("Сначала подготовьте сервер."));
    }
    let cached_java = {
        let runtime = manager.inner.lock().await;
        if runtime.running { return Err(server_error("Другой локальный сервер уже запущен.")); }
        if runtime.profile_id.as_deref() == Some(profile_id.as_str()) {
            runtime.java_path.clone()
        } else {
            None
        }
    };
    let java_major = required_java_major(&profile.game_version);
    let java_path = if let Some(path) = cached_java {
        path
    } else {
        resolve_server_java(java_major).await?
    };
    write_server_properties(&profile).await?;
    let mut runtime = manager.inner.lock().await;
    if runtime.running { return Err(server_error("Другой локальный сервер уже запущен.")); }
    let mut command = Command::new(&java_path);
    command.current_dir(profile_directory(&profile))
        .arg(format!("-Xms{}M", profile.memory_mb.min(2048)))
        .arg(format!("-Xmx{}M", profile.memory_mb))
        .arg("-jar").arg(SERVER_JAR_NAME).arg("nogui")
        .stdin(std::process::Stdio::piped()).stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped()).kill_on_drop(true);
    #[cfg(target_os = "windows")]
    { use std::os::windows::process::CommandExt; command.as_std_mut().creation_flags(0x08000000); }
    let mut child = command.spawn()?;
    let pid = child.id();
    let stdin = child.stdin.take().ok_or_else(|| server_error("Не удалось открыть ввод консоли."))?;
    let stdout = child.stdout.take().ok_or_else(|| server_error("Не удалось открыть вывод консоли."))?;
    let stderr = child.stderr.take().ok_or_else(|| server_error("Не удалось открыть поток ошибок."))?;
    let child = Arc::new(Mutex::new(child));
    runtime.child = Some(child.clone()); runtime.stdin = Some(stdin); runtime.running = true;
    runtime.pid = pid; runtime.profile_id = Some(profile_id.clone()); runtime.java_path = Some(java_path);
    runtime.java_major = Some(java_major);
    let status = status_from(&runtime, Some(profile));
    drop(runtime);
    let _ = app.emit("local-server-state", LocalServerStateEvent {
        running: true, pid, exit_code: None, profile_id: Some(profile_id.clone()),
    });
    tokio::spawn(emit_console_lines(app.clone(), stdout, "stdout"));
    tokio::spawn(emit_console_lines(app.clone(), stderr, "stderr"));
    let shared_runtime = manager.inner.clone();
    tokio::spawn(async move {
        let exit_status = loop {
            match child.lock().await.try_wait() {
                Ok(Some(status)) => break Some(status),
                Ok(None) => tokio::time::sleep(Duration::from_millis(450)).await,
                Err(error) => {
                    let _ = app.emit("local-server-console", LocalServerConsoleEvent {
                        stream: "stderr", line: format!("Не удалось проверить сервер: {error}"),
                    });
                    break None;
                }
            }
        };
        let mut runtime = shared_runtime.lock().await;
        runtime.running = false; runtime.pid = None; runtime.stdin = None; runtime.child = None;
        drop(runtime);
        let _ = app.emit("local-server-state", LocalServerStateEvent {
            running: false, pid: None, exit_code: exit_status.and_then(|status| status.code()),
            profile_id: Some(profile_id),
        });
    });
    Ok(status)
}

#[tauri::command]
pub async fn local_server_add_content(profile_id: String, paths: Vec<String>) -> Result<usize> {
    let profile = find_profile(&load_profiles().await?, &profile_id)?;
    let destination = profile_directory(&profile).join(content_directory(&profile));
    tokio::fs::create_dir_all(&destination).await?;
    let mut copied = 0;
    for path in paths {
        let path = PathBuf::from(path);
        if !path.is_file() { continue; }
        let Some(name) = path.file_name() else { continue; };
        tokio::fs::copy(&path, destination.join(name)).await?;
        copied += 1;
    }
    Ok(copied)
}

#[tauri::command]
pub async fn local_server_convert_instance(
    instance_id: String, profile_id: Option<String>, export_path: Option<String>,
) -> Result<ServerPackResult> {
    if profile_id.is_none() == export_path.is_none() {
        return Err(server_error("Выберите сервер или путь для ZIP-экспорта."));
    }
    if let Some(profile_id) = profile_id {
        let profile = find_profile(&load_profiles().await?, &profile_id)?;
        let destination = profile_directory(&profile);
        let (copied_mods, excluded_mods) = convert_instance(&instance_id, &destination).await?;
        return Ok(ServerPackResult {
            destination: destination.to_string_lossy().into_owned(), copied_mods, excluded_mods,
        });
    }
    let output = PathBuf::from(export_path.unwrap_or_default());
    let root = servers_root().await?;
    let staging = root.join(format!("export-staging-{}", Uuid::new_v4()));
    tokio::fs::create_dir_all(&staging).await?;
    let (copied_mods, excluded_mods) = convert_instance(&instance_id, &staging).await?;
    tokio::fs::write(staging.join("README.txt"), format!(
        "Серверная сборка создана EdenLauncher.\nСкопировано модов: {copied_mods}.\nИсключено клиентских модов: {excluded_mods}.\n"
    )).await?;
    zip_directory(&staging, &output).await?;
    if staging.starts_with(&root) { tokio::fs::remove_dir_all(&staging).await?; }
    Ok(ServerPackResult {
        destination: output.to_string_lossy().into_owned(), copied_mods, excluded_mods,
    })
}

#[tauri::command]
pub async fn local_server_send_command(
    manager: TauriState<'_, LocalServerManager>, command: String,
) -> Result<()> {
    let command = command.trim();
    if command.is_empty() { return Ok(()); }
    if command.len() > 512 { return Err(server_error("Команда слишком длинная.")); }
    let mut runtime = manager.inner.lock().await;
    let stdin = runtime.stdin.as_mut().ok_or_else(|| server_error("Сервер не запущен."))?;
    stdin.write_all(format!("{command}\n").as_bytes()).await?;
    stdin.flush().await?;
    Ok(())
}

#[tauri::command]
pub async fn local_server_stop(manager: TauriState<'_, LocalServerManager>) -> Result<()> {
    let mut runtime = manager.inner.lock().await;
    let stdin = runtime.stdin.as_mut().ok_or_else(|| server_error("Сервер не запущен."))?;
    stdin.write_all(b"stop\n").await?; stdin.flush().await?; Ok(())
}

#[tauri::command]
pub async fn local_server_force_stop(manager: TauriState<'_, LocalServerManager>) -> Result<()> {
    let child = manager.inner.lock().await.child.clone()
        .ok_or_else(|| server_error("Сервер не запущен."))?;
    child.lock().await.kill().await?; Ok(())
}
