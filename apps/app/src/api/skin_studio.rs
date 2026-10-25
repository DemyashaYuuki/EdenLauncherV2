use crate::api::Result;

use theseus::minecraft_skins::{
    self, AccountCapes, Bytes, MinecraftSkinVariant, SkinApplyReport,
};
use theseus::skin_studio;

pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("skin-studio")
        .invoke_handler(tauri::generate_handler![
            skin_studio_library_info,
            skin_studio_set_library_root,
            skin_studio_list,
            skin_studio_read,
            skin_studio_write,
            skin_studio_create_folder,
            skin_studio_rename,
            skin_studio_copy,
            skin_studio_trash,
            skin_studio_list_trash,
            skin_studio_restore,
            skin_studio_purge_trash,
            skin_studio_recovery_put,
            skin_studio_recovery_list,
            skin_studio_recovery_get,
            skin_studio_recovery_delete,
            skin_studio_read_dropped,
            skin_studio_apply_microsoft,
            skin_studio_microsoft_capes,
            skin_studio_set_microsoft_cape,
        ])
        .build()
}

#[tauri::command]
pub async fn skin_studio_library_info() -> Result<skin_studio::LibraryInfo> {
    Ok(skin_studio::library_info().await?)
}

#[tauri::command]
pub async fn skin_studio_set_library_root(
    path: Option<String>,
) -> Result<skin_studio::LibraryInfo> {
    Ok(skin_studio::set_library_root(path).await?)
}

#[tauri::command]
pub async fn skin_studio_list() -> Result<Vec<skin_studio::LibraryEntry>> {
    Ok(skin_studio::list_library().await?)
}

#[tauri::command]
pub async fn skin_studio_read(path: String) -> Result<String> {
    Ok(skin_studio::read_file(path).await?)
}

#[tauri::command]
pub async fn skin_studio_write(
    path: String,
    data: String,
    overwrite: bool,
) -> Result<skin_studio::LibraryEntry> {
    Ok(skin_studio::write_file(path, data, overwrite).await?)
}

#[tauri::command]
pub async fn skin_studio_create_folder(path: String) -> Result<()> {
    Ok(skin_studio::create_folder(path).await?)
}

#[tauri::command]
pub async fn skin_studio_rename(from: String, to: String) -> Result<()> {
    Ok(skin_studio::rename_entry(from, to).await?)
}

#[tauri::command]
pub async fn skin_studio_copy(from: String, to: String) -> Result<()> {
    Ok(skin_studio::copy_entry(from, to).await?)
}

#[tauri::command]
pub async fn skin_studio_trash(
    path: String,
) -> Result<skin_studio::TrashEntry> {
    Ok(skin_studio::trash_entry(path).await?)
}

#[tauri::command]
pub async fn skin_studio_list_trash() -> Result<Vec<skin_studio::TrashEntry>> {
    Ok(skin_studio::list_trash().await?)
}

#[tauri::command]
pub async fn skin_studio_restore(id: String) -> Result<String> {
    Ok(skin_studio::restore_trash(id).await?)
}

#[tauri::command]
pub async fn skin_studio_purge_trash(id: Option<String>) -> Result<u32> {
    Ok(skin_studio::purge_trash(id).await?)
}

#[tauri::command]
pub async fn skin_studio_recovery_put(
    doc_id: String,
    data: String,
) -> Result<()> {
    Ok(skin_studio::recovery_put(doc_id, data).await?)
}

#[tauri::command]
pub async fn skin_studio_recovery_list()
-> Result<Vec<skin_studio::RecoveryEntry>> {
    Ok(skin_studio::recovery_list().await?)
}

#[tauri::command]
pub async fn skin_studio_recovery_get(doc_id: String) -> Result<String> {
    Ok(skin_studio::recovery_get(doc_id).await?)
}

#[tauri::command]
pub async fn skin_studio_recovery_delete(doc_id: String) -> Result<()> {
    Ok(skin_studio::recovery_delete(doc_id).await?)
}

#[tauri::command]
pub async fn skin_studio_read_dropped(path: String) -> Result<String> {
    Ok(skin_studio::read_dropped(path).await?)
}

#[tauri::command]
pub async fn skin_studio_apply_microsoft(
    profile_id: uuid::Uuid,
    data: String,
    variant: MinecraftSkinVariant,
) -> Result<SkinApplyReport> {
    let bytes = base64_decode(&data)?;
    Ok(minecraft_skins::apply_custom_skin_now(profile_id, bytes, variant)
        .await?)
}

#[tauri::command]
pub async fn skin_studio_microsoft_capes(
    profile_id: uuid::Uuid,
) -> Result<AccountCapes> {
    Ok(minecraft_skins::account_capes(profile_id).await?)
}

#[tauri::command]
pub async fn skin_studio_set_microsoft_cape(
    profile_id: uuid::Uuid,
    cape_id: Option<uuid::Uuid>,
) -> Result<SkinApplyReport> {
    Ok(minecraft_skins::set_account_cape(profile_id, cape_id).await?)
}

fn base64_decode(data: &str) -> Result<Bytes> {
    Ok(theseus::skin_studio::decode_base64_payload(data)?.into())
}
