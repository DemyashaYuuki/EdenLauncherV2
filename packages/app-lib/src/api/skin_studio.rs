//! Skin Studio project library.
//!
//! Projects live under one library root (the default sits in the launcher settings directory, the
//! user may choose another folder). Every path coming from the frontend is a `/`-separated path
//! relative to that root; components are validated and the resolved location is checked against
//! the canonical root, so neither `..` nor links can escape it. Writes go to a temporary file in the
//! same directory and are renamed into place. Deleted entries are moved to `.trash`; autosaves for
//! crash recovery are kept outside the library and bounded in count and size.

use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use base64::Engine;
use serde::{Deserialize, Serialize};

use crate::{ErrorKind, State};

const STUDIO_DIR: &str = "skin-studio";
const SETTINGS_FILE: &str = "settings.json";
const LIBRARY_DIR: &str = "library";
const RECOVERY_DIR: &str = "recovery";
const TRASH_DIR: &str = ".trash";
const PROJECT_EXTENSION: &str = "edenskin";
const MAX_DEPTH: usize = 6;
const MAX_FILE_BYTES: usize = 64 * 1024 * 1024;
const MAX_LIST_ENTRIES: usize = 5000;
const MAX_RECOVERY_FILES: usize = 24;
const MAX_RECOVERY_BYTES: u64 = 192 * 1024 * 1024;
const DROPPED_EXTENSIONS: &[&str] = &[
    "png", "edenskin", "tcn", "xml", "gpl", "gimp", "aco", "act", "swtch",
    "json",
];

#[derive(Serialize, Deserialize, Default)]
struct StudioSettings {
    library_root: Option<PathBuf>,
}

#[derive(Serialize, Debug, Clone)]
pub struct LibraryInfo {
    pub root: String,
    pub default_root: String,
    pub is_default: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EntryKind {
    Project,
    Png,
    Folder,
}

#[derive(Serialize, Debug, Clone)]
pub struct LibraryEntry {
    pub path: String,
    pub kind: EntryKind,
    pub size: u64,
    pub modified_ms: u64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TrashEntry {
    pub id: String,
    pub original_path: String,
    pub kind: EntryKind,
    pub deleted_ms: u64,
}

#[derive(Serialize, Debug, Clone)]
pub struct RecoveryEntry {
    pub doc_id: String,
    pub size: u64,
    pub modified_ms: u64,
}

fn input_error(message: &str) -> crate::Error {
    ErrorKind::InputError(message.to_string()).into()
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn modified_ms(metadata: &std::fs::Metadata) -> u64 {
    metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

async fn studio_dir() -> crate::Result<PathBuf> {
    let state = State::get().await?;
    Ok(state.directories.settings_dir.join(STUDIO_DIR))
}

fn read_settings(dir: &Path) -> StudioSettings {
    std::fs::read(dir.join(SETTINGS_FILE))
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

fn write_settings(dir: &Path, settings: &StudioSettings) -> crate::Result<()> {
    let bytes = serde_json::to_vec_pretty(settings)?;
    atomic_write(&dir.join(SETTINGS_FILE), &bytes, true)
}

/// Returns the library root, creating the default one when needed. A configured root that no
/// longer exists is reported instead of silently replaced.
async fn library_root() -> crate::Result<(PathBuf, PathBuf)> {
    let dir = studio_dir().await?;
    let default_root = dir.join(LIBRARY_DIR);
    let settings = read_settings(&dir);
    match settings.library_root {
        Some(root) => {
            if !root.is_dir() {
                return Err(input_error(
                    "The skin library folder is unavailable. Choose it again or reset to default.",
                ));
            }
            Ok((root, default_root))
        }
        None => {
            std::fs::create_dir_all(&default_root)?;
            Ok((default_root.clone(), default_root))
        }
    }
}

fn is_reserved_windows_name(part: &str) -> bool {
    let stem = part.split('.').next().unwrap_or(part).to_ascii_lowercase();
    matches!(stem.as_str(), "con" | "prn" | "aux" | "nul")
        || (stem.len() == 4
            && (stem.starts_with("com") || stem.starts_with("lpt"))
            && stem.as_bytes()[3].is_ascii_digit())
}

/// Validates one path component written by the frontend.
pub fn is_valid_component(part: &str) -> bool {
    !part.is_empty()
        && part.len() <= 128
        && !part.starts_with('.')
        && !part.ends_with('.')
        && !part.ends_with(' ')
        && !part.starts_with(' ')
        && part.chars().all(|c| {
            !c.is_control()
                && !matches!(
                    c,
                    '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'
                )
        })
        && !is_reserved_windows_name(part)
}

/// Splits and validates a library-relative path.
pub fn relative_parts(path: &str) -> crate::Result<Vec<String>> {
    let parts: Vec<String> = path.split('/').map(str::to_string).collect();
    if parts.is_empty()
        || parts.len() > MAX_DEPTH
        || !parts.iter().all(|p| is_valid_component(p))
    {
        return Err(input_error("Invalid library path"));
    }
    Ok(parts)
}

fn kind_for_name(name: &str) -> Option<EntryKind> {
    let lower = name.to_ascii_lowercase();
    if lower.ends_with(&format!(".{PROJECT_EXTENSION}")) {
        Some(EntryKind::Project)
    } else if lower.ends_with(".png") {
        Some(EntryKind::Png)
    } else {
        None
    }
}

fn join(root: &Path, parts: &[String]) -> PathBuf {
    let mut path = root.to_path_buf();
    for part in parts {
        path.push(part);
    }
    path
}

/// Checks that the closest existing ancestor of `target` resolves inside `root`.
fn ensure_inside(root: &Path, target: &Path) -> crate::Result<()> {
    let root = dunce::canonicalize(root)?;
    let mut probe = target.to_path_buf();
    loop {
        if probe.exists() {
            let resolved = dunce::canonicalize(&probe)?;
            if resolved.starts_with(&root) {
                return Ok(());
            }
            return Err(input_error("Path is outside of the skin library"));
        }
        if !probe.pop() {
            return Err(input_error("Path is outside of the skin library"));
        }
    }
}

fn resolve_file(root: &Path, path: &str) -> crate::Result<(PathBuf, EntryKind)> {
    let parts = relative_parts(path)?;
    let name = parts.last().ok_or_else(|| input_error("Invalid library path"))?;
    let kind = kind_for_name(name)
        .ok_or_else(|| input_error("Unsupported file type in library"))?;
    let target = join(root, &parts);
    ensure_inside(root, &target)?;
    Ok((target, kind))
}

fn resolve_any(root: &Path, path: &str) -> crate::Result<(PathBuf, EntryKind)> {
    let parts = relative_parts(path)?;
    let target = join(root, &parts);
    ensure_inside(root, &target)?;
    let name = parts.last().ok_or_else(|| input_error("Invalid library path"))?;
    let kind = if target.is_dir() {
        EntryKind::Folder
    } else {
        kind_for_name(name)
            .ok_or_else(|| input_error("Unsupported file type in library"))?
    };
    Ok((target, kind))
}

/// Writes through a temporary file in the destination directory, then renames it into place.
pub fn atomic_write(
    path: &Path,
    data: &[u8],
    overwrite: bool,
) -> crate::Result<()> {
    let parent = path
        .parent()
        .ok_or_else(|| input_error("Invalid destination"))?;
    std::fs::create_dir_all(parent)?;
    if !overwrite && path.exists() {
        return Err(input_error("A file with this name already exists"));
    }
    let mut temp = tempfile::NamedTempFile::new_in(parent)?;
    temp.write_all(data)?;
    temp.as_file().sync_all()?;
    if overwrite {
        temp.persist(path).map_err(|e| e.error)?;
    } else {
        temp.persist_noclobber(path).map_err(|e| e.error)?;
    }
    Ok(())
}

/// Decodes a base64 payload sent by the frontend, bounded to the studio file size limit.
pub fn decode_base64_payload(data: &str) -> crate::Result<Vec<u8>> {
    if data.len() > MAX_FILE_BYTES / 3 * 4 + 4 {
        return Err(input_error("File is too large"));
    }
    base64::engine::general_purpose::STANDARD
        .decode(data)
        .map_err(|_| input_error("Invalid file payload"))
}

fn encode_payload(bytes: &[u8]) -> String {
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

fn to_relative(root: &Path, path: &Path) -> Option<String> {
    let relative = path.strip_prefix(root).ok()?;
    let parts: Vec<String> = relative
        .components()
        .map(|c| c.as_os_str().to_string_lossy().to_string())
        .collect();
    Some(parts.join("/"))
}

pub async fn library_info() -> crate::Result<LibraryInfo> {
    let (root, default_root) = library_root().await?;
    Ok(LibraryInfo {
        is_default: root == default_root,
        root: root.to_string_lossy().to_string(),
        default_root: default_root.to_string_lossy().to_string(),
    })
}

/// Sets a user-chosen library folder (`None` restores the default). The folder must exist, be a
/// writable directory and must not be a filesystem root.
pub async fn set_library_root(path: Option<String>) -> crate::Result<LibraryInfo> {
    let dir = studio_dir().await?;
    std::fs::create_dir_all(&dir)?;
    let mut settings = read_settings(&dir);
    match path {
        None => settings.library_root = None,
        Some(raw) => {
            let candidate = PathBuf::from(raw);
            if !candidate.is_absolute() || !candidate.is_dir() {
                return Err(input_error("Choose an existing folder"));
            }
            let resolved = dunce::canonicalize(&candidate)?;
            if resolved.parent().is_none() {
                return Err(input_error("A drive root cannot be the skin library"));
            }
            let probe = resolved.join(format!(".eden-write-test-{}", now_ms()));
            std::fs::write(&probe, b"ok")?;
            std::fs::remove_file(&probe)?;
            settings.library_root = Some(resolved);
        }
    }
    write_settings(&dir, &settings)?;
    library_info().await
}

pub async fn list_library() -> crate::Result<Vec<LibraryEntry>> {
    let (root, _) = library_root().await?;
    tokio::task::spawn_blocking(move || -> crate::Result<Vec<LibraryEntry>> {
        let mut out = Vec::new();
        let mut stack = vec![(root.clone(), 0usize)];
        while let Some((dir, depth)) = stack.pop() {
            let Ok(read) = std::fs::read_dir(&dir) else {
                continue;
            };
            for entry in read.flatten() {
                if out.len() >= MAX_LIST_ENTRIES {
                    return Ok(out);
                }
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with('.') {
                    continue;
                }
                let Ok(file_type) = entry.file_type() else {
                    continue;
                };
                if file_type.is_symlink() {
                    continue;
                }
                let Ok(metadata) = entry.metadata() else {
                    continue;
                };
                let path = entry.path();
                let Some(relative) = to_relative(&root, &path) else {
                    continue;
                };
                if file_type.is_dir() {
                    if depth + 1 < MAX_DEPTH {
                        stack.push((path, depth + 1));
                    }
                    out.push(LibraryEntry {
                        path: relative,
                        kind: EntryKind::Folder,
                        size: 0,
                        modified_ms: modified_ms(&metadata),
                    });
                } else if let Some(kind) = kind_for_name(&name) {
                    out.push(LibraryEntry {
                        path: relative,
                        kind,
                        size: metadata.len(),
                        modified_ms: modified_ms(&metadata),
                    });
                }
            }
        }
        Ok(out)
    })
    .await?
}

pub async fn read_file(path: String) -> crate::Result<String> {
    let (root, _) = library_root().await?;
    let (target, _) = resolve_file(&root, &path)?;
    let metadata = tokio::fs::metadata(&target).await?;
    if metadata.len() > MAX_FILE_BYTES as u64 {
        return Err(input_error("File is too large"));
    }
    Ok(encode_payload(&tokio::fs::read(&target).await?))
}

pub async fn write_file(
    path: String,
    data: String,
    overwrite: bool,
) -> crate::Result<LibraryEntry> {
    let (root, _) = library_root().await?;
    let (target, kind) = resolve_file(&root, &path)?;
    let bytes = decode_base64_payload(&data)?;
    if bytes.len() > MAX_FILE_BYTES {
        return Err(input_error("File is too large"));
    }
    let size = bytes.len() as u64;
    let destination = target.clone();
    tokio::task::spawn_blocking(move || {
        atomic_write(&destination, &bytes, overwrite)
    })
    .await??;
    Ok(LibraryEntry {
        path,
        kind,
        size,
        modified_ms: now_ms(),
    })
}

pub async fn create_folder(path: String) -> crate::Result<()> {
    let (root, _) = library_root().await?;
    let parts = relative_parts(&path)?;
    let target = join(&root, &parts);
    ensure_inside(&root, &target)?;
    tokio::fs::create_dir_all(&target).await?;
    Ok(())
}

pub async fn rename_entry(from: String, to: String) -> crate::Result<()> {
    let (root, _) = library_root().await?;
    let (source, kind) = resolve_any(&root, &from)?;
    if !source.exists() {
        return Err(input_error("The item no longer exists"));
    }
    let target_parts = relative_parts(&to)?;
    let target = join(&root, &target_parts);
    ensure_inside(&root, &target)?;
    if kind != EntryKind::Folder
        && kind_for_name(target_parts.last().map(String::as_str).unwrap_or(""))
            != Some(kind)
    {
        return Err(input_error("The file type cannot be changed"));
    }
    if target.exists() {
        return Err(input_error("A file with this name already exists"));
    }
    if kind == EntryKind::Folder && target.starts_with(&source) {
        return Err(input_error("A folder cannot be moved into itself"));
    }
    if let Some(parent) = target.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    tokio::fs::rename(&source, &target).await?;
    Ok(())
}

pub async fn copy_entry(from: String, to: String) -> crate::Result<()> {
    let (root, _) = library_root().await?;
    let (source, kind) = resolve_file(&root, &from)?;
    let (target, target_kind) = resolve_file(&root, &to)?;
    if kind != target_kind {
        return Err(input_error("The file type cannot be changed"));
    }
    let metadata = tokio::fs::metadata(&source).await?;
    if metadata.len() > MAX_FILE_BYTES as u64 {
        return Err(input_error("File is too large"));
    }
    let bytes = tokio::fs::read(&source).await?;
    tokio::task::spawn_blocking(move || atomic_write(&target, &bytes, false))
        .await??;
    Ok(())
}

fn trash_dir(root: &Path) -> PathBuf {
    root.join(TRASH_DIR)
}

fn random_id() -> String {
    use rand::Rng;
    let value: u64 = rand::thread_rng().r#gen();
    format!("{}-{value:016x}", now_ms())
}

fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 80
        && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

/// Moves a library item to `.trash/<id>/` and records where it came from.
pub async fn trash_entry(path: String) -> crate::Result<TrashEntry> {
    let (root, _) = library_root().await?;
    let (source, kind) = resolve_any(&root, &path)?;
    if !source.exists() {
        return Err(input_error("The item no longer exists"));
    }
    let id = random_id();
    let holder = trash_dir(&root).join(&id);
    tokio::fs::create_dir_all(&holder).await?;
    let name = source
        .file_name()
        .ok_or_else(|| input_error("Invalid library path"))?
        .to_owned();
    tokio::fs::rename(&source, holder.join(&name)).await?;
    let entry = TrashEntry {
        id: id.clone(),
        original_path: path,
        kind,
        deleted_ms: now_ms(),
    };
    let manifest = serde_json::to_vec(&entry)?;
    let manifest_path = trash_dir(&root).join(format!("{id}.json"));
    tokio::task::spawn_blocking(move || {
        atomic_write(&manifest_path, &manifest, false)
    })
    .await??;
    Ok(entry)
}

pub async fn list_trash() -> crate::Result<Vec<TrashEntry>> {
    let (root, _) = library_root().await?;
    let dir = trash_dir(&root);
    let mut out = Vec::new();
    let Ok(mut read) = tokio::fs::read_dir(&dir).await else {
        return Ok(out);
    };
    while let Some(entry) = read.next_entry().await? {
        let name = entry.file_name().to_string_lossy().to_string();
        let Some(id) = name.strip_suffix(".json") else {
            continue;
        };
        if !valid_id(id) || !dir.join(id).is_dir() {
            continue;
        }
        let Ok(bytes) = tokio::fs::read(entry.path()).await else {
            continue;
        };
        if let Ok(manifest) = serde_json::from_slice::<TrashEntry>(&bytes)
            && manifest.id == id
        {
            out.push(manifest);
        }
    }
    out.sort_by(|a, b| b.deleted_ms.cmp(&a.deleted_ms));
    Ok(out)
}

/// Restores a trashed item to its original place, or next to it under a new name if the original
/// path is taken. Returns the restored library path.
pub async fn restore_trash(id: String) -> crate::Result<String> {
    if !valid_id(&id) {
        return Err(input_error("Invalid trash entry"));
    }
    let (root, _) = library_root().await?;
    let dir = trash_dir(&root);
    let manifest: TrashEntry =
        serde_json::from_slice(&tokio::fs::read(dir.join(format!("{id}.json"))).await?)?;
    let mut parts = relative_parts(&manifest.original_path)?;
    let holder = dir.join(&id);
    let mut stored = tokio::fs::read_dir(&holder).await?;
    let item = stored
        .next_entry()
        .await?
        .ok_or_else(|| input_error("The trashed item is missing"))?;
    let mut target = join(&root, &parts);
    let mut counter = 2;
    while target.exists() {
        let last = parts.len() - 1;
        let original = relative_parts(&manifest.original_path)?[last].clone();
        let (stem, ext) = match original.rfind('.') {
            Some(dot) if manifest.kind != EntryKind::Folder => {
                (original[..dot].to_string(), original[dot..].to_string())
            }
            _ => (original.clone(), String::new()),
        };
        parts[last] = format!("{stem} ({counter}){ext}");
        target = join(&root, &parts);
        counter += 1;
        if counter > 1000 {
            return Err(input_error("Could not find a free name to restore"));
        }
    }
    ensure_inside(&root, &target)?;
    if let Some(parent) = target.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    tokio::fs::rename(item.path(), &target).await?;
    tokio::fs::remove_dir_all(&holder).await.ok();
    tokio::fs::remove_file(dir.join(format!("{id}.json"))).await.ok();
    Ok(parts.join("/"))
}

/// Permanently removes one trashed item, or all of them when `id` is `None`. Returns the count.
pub async fn purge_trash(id: Option<String>) -> crate::Result<u32> {
    let (root, _) = library_root().await?;
    let dir = trash_dir(&root);
    let ids: Vec<String> = match id {
        Some(id) => {
            if !valid_id(&id) {
                return Err(input_error("Invalid trash entry"));
            }
            vec![id]
        }
        None => list_trash().await?.into_iter().map(|e| e.id).collect(),
    };
    let mut removed = 0;
    for id in ids {
        let holder = dir.join(&id);
        if holder.is_dir() {
            tokio::fs::remove_dir_all(&holder).await?;
            removed += 1;
        }
        tokio::fs::remove_file(dir.join(format!("{id}.json"))).await.ok();
    }
    Ok(removed)
}

async fn recovery_dir() -> crate::Result<PathBuf> {
    let dir = studio_dir().await?.join(RECOVERY_DIR);
    tokio::fs::create_dir_all(&dir).await?;
    Ok(dir)
}

fn valid_doc_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 80
        && id
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

/// Stores an autosave and prunes the oldest ones beyond the count and size budget.
pub async fn recovery_put(doc_id: String, data: String) -> crate::Result<()> {
    if !valid_doc_id(&doc_id) {
        return Err(input_error("Invalid document id"));
    }
    let bytes = decode_base64_payload(&data)?;
    let dir = recovery_dir().await?;
    let target = dir.join(format!("{doc_id}.{PROJECT_EXTENSION}"));
    tokio::task::spawn_blocking(move || -> crate::Result<()> {
        atomic_write(&target, &bytes, true)?;
        let mut files: Vec<(PathBuf, u64, u64)> = std::fs::read_dir(&dir)?
            .flatten()
            .filter_map(|e| {
                let metadata = e.metadata().ok()?;
                metadata
                    .is_file()
                    .then(|| (e.path(), metadata.len(), modified_ms(&metadata)))
            })
            .collect();
        files.sort_by(|a, b| b.2.cmp(&a.2));
        let mut total = 0u64;
        for (index, (path, size, _)) in files.iter().enumerate() {
            total += size;
            if index >= MAX_RECOVERY_FILES || total > MAX_RECOVERY_BYTES {
                std::fs::remove_file(path).ok();
            }
        }
        Ok(())
    })
    .await??;
    Ok(())
}

pub async fn recovery_list() -> crate::Result<Vec<RecoveryEntry>> {
    let dir = recovery_dir().await?;
    let mut out = Vec::new();
    let mut read = tokio::fs::read_dir(&dir).await?;
    while let Some(entry) = read.next_entry().await? {
        let name = entry.file_name().to_string_lossy().to_string();
        let Some(doc_id) = name.strip_suffix(&format!(".{PROJECT_EXTENSION}"))
        else {
            continue;
        };
        if !valid_doc_id(doc_id) {
            continue;
        }
        let metadata = entry.metadata().await?;
        out.push(RecoveryEntry {
            doc_id: doc_id.to_string(),
            size: metadata.len(),
            modified_ms: modified_ms(&metadata),
        });
    }
    out.sort_by(|a, b| b.modified_ms.cmp(&a.modified_ms));
    Ok(out)
}

pub async fn recovery_get(doc_id: String) -> crate::Result<String> {
    if !valid_doc_id(&doc_id) {
        return Err(input_error("Invalid document id"));
    }
    let path = recovery_dir()
        .await?
        .join(format!("{doc_id}.{PROJECT_EXTENSION}"));
    Ok(encode_payload(&tokio::fs::read(path).await?))
}

pub async fn recovery_delete(doc_id: String) -> crate::Result<()> {
    if !valid_doc_id(&doc_id) {
        return Err(input_error("Invalid document id"));
    }
    let path = recovery_dir()
        .await?
        .join(format!("{doc_id}.{PROJECT_EXTENSION}"));
    match tokio::fs::remove_file(path).await {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

/// Reads a file the user dropped on the window. Only studio file types are accepted and the size
/// is checked before reading.
pub async fn read_dropped(path: String) -> crate::Result<String> {
    let path = PathBuf::from(path);
    let extension = path
        .extension()
        .map(|e| e.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    if !DROPPED_EXTENSIONS.contains(&extension.as_str()) {
        return Err(input_error("Unsupported file type"));
    }
    let metadata = tokio::fs::metadata(&path).await?;
    if !metadata.is_file() || metadata.len() > MAX_FILE_BYTES as u64 {
        return Err(input_error("File is too large or not a file"));
    }
    Ok(encode_payload(&tokio::fs::read(&path).await?))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_traversal_and_reserved_names() {
        assert!(relative_parts("skins/My skin.edenskin").is_ok());
        assert!(relative_parts("../evil.edenskin").is_err());
        assert!(relative_parts("a/./b.edenskin").is_err());
        assert!(relative_parts("C:/evil.edenskin").is_err());
        assert!(relative_parts("a\\b.edenskin").is_err());
        assert!(relative_parts(".trash/x.edenskin").is_err());
        assert!(relative_parts("CON.edenskin").is_err());
        assert!(relative_parts("a/b/c/d/e/f/g.edenskin").is_err());
        assert!(relative_parts("").is_err());
    }

    #[test]
    fn atomic_write_respects_overwrite() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("a.edenskin");
        atomic_write(&path, b"one", false).unwrap();
        assert!(atomic_write(&path, b"two", false).is_err());
        atomic_write(&path, b"three", true).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"three");
    }

    #[test]
    fn ensure_inside_blocks_escapes() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("root");
        std::fs::create_dir_all(&root).unwrap();
        assert!(ensure_inside(&root, &root.join("x/y.edenskin")).is_ok());
        assert!(ensure_inside(&root, &dir.path().join("other.edenskin")).is_err());
    }
}
