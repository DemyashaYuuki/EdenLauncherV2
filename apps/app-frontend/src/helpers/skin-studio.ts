import { invoke } from '@tauri-apps/api/core'

import { base64ToBytes, bytesToBase64 } from '@/skin-studio/engine/png.ts'

const MAX_FILE_BYTES = 64 * 1024 * 1024

export interface LibraryInfo {
	root: string
	default_root: string
	is_default: boolean
}

export interface LibraryEntry {
	path: string
	kind: 'project' | 'png' | 'folder'
	size: number
	modified_ms: number
}

export interface TrashEntry {
	id: string
	original_path: string
	kind: 'project' | 'png' | 'folder'
	deleted_ms: number
}

export interface RecoveryEntry {
	doc_id: string
	size: number
	modified_ms: number
}

export type SkinApplyStatus =
	| 'applied'
	| 'unauthorized'
	| 'forbidden'
	| 'rate_limited'
	| 'network'
	| 'invalid_texture'
	| 'unsupported_account'
	| 'account_not_found'
	| 'profile_unavailable'
	| 'failed'

export interface SkinApplyReport {
	status: SkinApplyStatus
	message: string | null
	variant: 'CLASSIC' | 'SLIM' | 'UNKNOWN' | null
}

export interface AccountCape {
	id: string
	name: string
	texture: string
	active: boolean
}

export interface AccountCapes {
	status: SkinApplyStatus
	capes: AccountCape[]
	message: string | null
}

const plugin = (command: string) => `plugin:skin-studio|${command}`

export async function libraryInfo(): Promise<LibraryInfo> {
	return invoke(plugin('skin_studio_library_info'))
}

export async function setLibraryRoot(path: string | null): Promise<LibraryInfo> {
	return invoke(plugin('skin_studio_set_library_root'), { path })
}

export async function listLibrary(): Promise<LibraryEntry[]> {
	return invoke(plugin('skin_studio_list'))
}

export async function readLibraryFile(path: string): Promise<Uint8Array> {
	const data: string = await invoke(plugin('skin_studio_read'), { path })
	return base64ToBytes(data, MAX_FILE_BYTES)
}

export async function writeLibraryFile(path: string, bytes: Uint8Array, overwrite: boolean): Promise<LibraryEntry> {
	return invoke(plugin('skin_studio_write'), { path, data: bytesToBase64(bytes), overwrite })
}

export async function createLibraryFolder(path: string): Promise<void> {
	await invoke(plugin('skin_studio_create_folder'), { path })
}

export async function renameLibraryEntry(from: string, to: string): Promise<void> {
	await invoke(plugin('skin_studio_rename'), { from, to })
}

export async function copyLibraryEntry(from: string, to: string): Promise<void> {
	await invoke(plugin('skin_studio_copy'), { from, to })
}

export async function trashLibraryEntry(path: string): Promise<TrashEntry> {
	return invoke(plugin('skin_studio_trash'), { path })
}

export async function listTrash(): Promise<TrashEntry[]> {
	return invoke(plugin('skin_studio_list_trash'))
}

export async function restoreTrash(id: string): Promise<string> {
	return invoke(plugin('skin_studio_restore'), { id })
}

export async function purgeTrash(id: string | null): Promise<number> {
	return invoke(plugin('skin_studio_purge_trash'), { id })
}

/** Reads a file the user dropped onto the window (allowed studio extensions only, size limited). */
export async function readDroppedFile(path: string): Promise<Uint8Array> {
	const data: string = await invoke(plugin('skin_studio_read_dropped'), { path })
	return base64ToBytes(data, MAX_FILE_BYTES)
}

export async function putRecovery(docId: string, bytes: Uint8Array): Promise<void> {
	await invoke(plugin('skin_studio_recovery_put'), { docId, data: bytesToBase64(bytes) })
}

export async function listRecovery(): Promise<RecoveryEntry[]> {
	return invoke(plugin('skin_studio_recovery_list'))
}

export async function getRecovery(docId: string): Promise<Uint8Array> {
	const data: string = await invoke(plugin('skin_studio_recovery_get'), { docId })
	return base64ToBytes(data, MAX_FILE_BYTES)
}

export async function deleteRecovery(docId: string): Promise<void> {
	await invoke(plugin('skin_studio_recovery_delete'), { docId })
}

/** Uploads to the given Microsoft account now and verifies the active skin afterwards. */
export async function applyMicrosoftSkin(
	profileId: string,
	png: Uint8Array,
	variant: 'CLASSIC' | 'SLIM',
): Promise<SkinApplyReport> {
	return invoke(plugin('skin_studio_apply_microsoft'), { profileId, data: bytesToBase64(png), variant })
}

export async function microsoftCapes(profileId: string): Promise<AccountCapes> {
	return invoke(plugin('skin_studio_microsoft_capes'), { profileId })
}

export async function setMicrosoftCape(profileId: string, capeId: string | null): Promise<SkinApplyReport> {
	return invoke(plugin('skin_studio_set_microsoft_cape'), { profileId, capeId })
}

export interface BridgeLink {
	player_uuid: string
	player_name: string
	linked_ms: number
}

export interface BridgeStatus {
	endpoint: string | null
	link: BridgeLink | null
	pairing: boolean
}

export interface BridgeHealth {
	reachable: boolean
	service: string | null
	version: string | null
	auth_adapter: string | null
	auth_ready: boolean
	skins_ready: boolean
	generator_ready: boolean
	looks: number
	message: string | null
}

export type PairPhase = 'pending' | 'awaiting_launcher' | 'confirmed' | 'expired' | 'rejected' | 'cancelled'

export interface PairStart {
	code: string
	expires_in_secs: number
	command: string
}

export interface PairState {
	status: PairPhase
	player_uuid: string | null
	player_name: string | null
	expires_in_secs: number
}

export type BridgeJobStatus =
	| 'queued'
	| 'generating'
	| 'applying'
	| 'applied'
	| 'saved_offline'
	| 'failed'
	| 'cancelled'

export interface BridgeJob {
	job_id: string
	status: BridgeJobStatus
	message: string | null
	error_code: string | null
}

export interface BridgeLook {
	id: string
	label: string
	has_cape: boolean
}

const bridge = (command: string) => `plugin:skin-studio|${command}`

export async function bridgeStatus(): Promise<BridgeStatus> {
	return invoke(bridge('skin_bridge_status'))
}

export async function bridgeSetEndpoint(url: string | null): Promise<BridgeStatus> {
	return invoke(bridge('skin_bridge_set_endpoint'), { url })
}

export async function bridgeHealth(): Promise<BridgeHealth> {
	return invoke(bridge('skin_bridge_health'))
}

export async function bridgePairStart(): Promise<PairStart> {
	return invoke(bridge('skin_bridge_pair_start'))
}

export async function bridgePairPoll(): Promise<PairState> {
	return invoke(bridge('skin_bridge_pair_poll'))
}

export async function bridgePairFinalize(): Promise<BridgeStatus> {
	return invoke(bridge('skin_bridge_pair_finalize'))
}

export async function bridgePairCancel(): Promise<void> {
	await invoke(bridge('skin_bridge_pair_cancel'))
}

export async function bridgeUnlink(): Promise<BridgeStatus> {
	return invoke(bridge('skin_bridge_unlink'))
}

export async function bridgeApplySkin(
	png: Uint8Array,
	variant: 'classic' | 'slim',
	idempotencyKey: string,
): Promise<BridgeJob> {
	return invoke(bridge('skin_bridge_apply_skin'), { data: bytesToBase64(png), variant, idempotencyKey })
}

export async function bridgeJob(jobId: string): Promise<BridgeJob> {
	return invoke(bridge('skin_bridge_job'), { jobId })
}

export async function bridgeCancelJob(jobId: string): Promise<BridgeJob> {
	return invoke(bridge('skin_bridge_cancel_job'), { jobId })
}

export async function bridgeLooks(): Promise<BridgeLook[]> {
	return invoke(bridge('skin_bridge_looks'))
}

export async function bridgeApplyLook(lookId: string, idempotencyKey: string): Promise<BridgeJob> {
	return invoke(bridge('skin_bridge_apply_look'), { lookId, idempotencyKey })
}
