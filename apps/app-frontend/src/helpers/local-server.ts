import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

export type LocalServerStatus = {
	prepared: boolean
	running: boolean
	pid: number | null
	directory: string | null
	java_major: number | null
	game_version: string | null
	loader_version: string | null
	port: number
	connect_address: string
	copied_mods: number
	excluded_mods: number
}

export type LocalServerProgress = {
	stage: 'java' | 'files' | 'fabric' | 'ready'
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
}

export async function getLocalServerStatus(): Promise<LocalServerStatus> {
	return await invoke('plugin:local-server|local_server_status')
}

export async function prepareLocalServer(input: {
	instanceId: string
	gameVersion: string
	loader: string
	loaderVersion: string
}): Promise<LocalServerStatus> {
	return await invoke('plugin:local-server|local_server_prepare', input)
}

export async function startLocalServer(memoryMb: number, port: number): Promise<LocalServerStatus> {
	return await invoke('plugin:local-server|local_server_start', { memoryMb, port })
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
