import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

export type ServerCore = 'vanilla' | 'fabric' | 'paper' | 'purpur' | 'forge' | 'neoforge'

export type LocalServerProfile = {
	id: string
	name: string
	directory: string
	core: ServerCore
	game_version: string
	loader_version: string | null
	memory_mb: number
	port: number
	offline_mode: boolean
	icon_path: string | null
	core_jar: string | null
	source_instance_id: string | null
	prepared: boolean
	created_at: string
}

export type LocalServerStatus = {
	profile: LocalServerProfile | null
	prepared: boolean
	running: boolean
	pid: number | null
	directory: string | null
	java_major: number | null
	port: number
	connect_address: string
	copied_mods: number
	excluded_mods: number
}

export type LocalServerProfileInput = {
	name: string
	directory?: string | null
	core: ServerCore
	gameVersion: string
	loaderVersion?: string | null
	memoryMb: number
	port: number
	offlineMode: boolean
	iconPath?: string | null
	coreJar?: string | null
	sourceInstanceId?: string | null
}

export type ServerPackResult = {
	destination: string
	copied_mods: number
	excluded_mods: number
}

export type LocalServerProgress = {
	stage: 'java' | 'files' | 'core' | 'ready'
	message: string
	progress: number
}

export type LocalServerConsoleEvent = {
	stream: 'stdout' | 'stderr'
	line: string
}

export type LocalServerStateEvent = {
	running: boolean
	pid: number | null
	exit_code: number | null
	profile_id: string | null
}

export async function listLocalServers(): Promise<LocalServerProfile[]> {
	return await invoke('plugin:local-server|local_server_list')
}

export async function createLocalServer(
	input: LocalServerProfileInput,
): Promise<LocalServerProfile> {
	return await invoke('plugin:local-server|local_server_create', input)
}

export async function removeLocalServer(profileId: string): Promise<void> {
	await invoke('plugin:local-server|local_server_remove', { profileId })
}

export async function getLocalServerStatus(profileId?: string | null): Promise<LocalServerStatus> {
	return await invoke('plugin:local-server|local_server_status', { profileId: profileId ?? null })
}

export async function prepareLocalServer(profileId: string): Promise<LocalServerStatus> {
	return await invoke('plugin:local-server|local_server_prepare', { profileId })
}

export async function startLocalServer(profileId: string): Promise<LocalServerStatus> {
	return await invoke('plugin:local-server|local_server_start', { profileId })
}

export async function addServerContent(profileId: string, paths: string[]): Promise<number> {
	return await invoke('plugin:local-server|local_server_add_content', { profileId, paths })
}

export async function convertInstanceToServer(input: {
	instanceId: string
	profileId?: string | null
	exportPath?: string | null
}): Promise<ServerPackResult> {
	return await invoke('plugin:local-server|local_server_convert_instance', input)
}

export async function sendLocalServerCommand(command: string): Promise<void> {
	await invoke('plugin:local-server|local_server_send_command', { command })
}

export async function stopLocalServer(): Promise<void> {
	await invoke('plugin:local-server|local_server_stop')
}

export async function forceStopLocalServer(): Promise<void> {
	await invoke('plugin:local-server|local_server_force_stop')
}

export async function onLocalServerProgress(
	callback: (progress: LocalServerProgress) => void,
): Promise<UnlistenFn> {
	return await listen<LocalServerProgress>('local-server-progress', (event) =>
		callback(event.payload),
	)
}

export async function onLocalServerConsole(
	callback: (event: LocalServerConsoleEvent) => void,
): Promise<UnlistenFn> {
	return await listen<LocalServerConsoleEvent>('local-server-console', (event) =>
		callback(event.payload),
	)
}

export async function onLocalServerState(
	callback: (event: LocalServerStateEvent) => void,
): Promise<UnlistenFn> {
	return await listen<LocalServerStateEvent>('local-server-state', (event) =>
		callback(event.payload),
	)
}
