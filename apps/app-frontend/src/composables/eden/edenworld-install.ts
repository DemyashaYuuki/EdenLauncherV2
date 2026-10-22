import { computed, readonly, ref } from 'vue'

import {
	downloadAndInstallEdenWorld,
	EDENWORLD_INSTANCE_NAME,
	type EdenWorldInstallProgress,
} from '@/helpers/edenworld'
import type { InstallJobSnapshot } from '@/helpers/install'

export type EdenWorldInstallStage = 'idle' | 'downloading' | 'installing' | 'ready' | 'error'

// Shared between the home page, first-run setup and the downloads page,
// so the official pack download shows the same progress everywhere.
const stage = ref<EdenWorldInstallStage>('idle')
const progress = ref<EdenWorldInstallProgress>({ downloaded: 0, total: null })
const bytesPerSecond = ref<number | null>(null)
const startedAt = ref<number | null>(null)
const finishedAt = ref<number | null>(null)
const errorMessage = ref<string | null>(null)
let running: Promise<InstallJobSnapshot> | null = null
let lastSample: { at: number; downloaded: number } | null = null

const percent = computed<number | null>(() => {
	if (stage.value === 'installing' || stage.value === 'ready') return 100
	if (!progress.value.total) return null
	return Math.min(100, Math.round((progress.value.downloaded / progress.value.total) * 100))
})

/** Seconds left, only when both the size and a measured speed are known. */
const secondsLeft = computed<number | null>(() => {
	if (stage.value !== 'downloading' || !progress.value.total || !bytesPerSecond.value) return null
	return Math.max(0, (progress.value.total - progress.value.downloaded) / bytesPerSecond.value)
})

const active = computed(() => stage.value === 'downloading' || stage.value === 'installing')

function onProgress(next: EdenWorldInstallProgress) {
	progress.value = next
	const now = performance.now()
	if (!lastSample) {
		lastSample = { at: now, downloaded: next.downloaded }
	} else if (now - lastSample.at >= 750) {
		const speed = ((next.downloaded - lastSample.downloaded) * 1000) / (now - lastSample.at)
		// Smooth the measured speed so the remaining time does not jump around.
		bytesPerSecond.value =
			bytesPerSecond.value === null ? speed : bytesPerSecond.value * 0.6 + speed * 0.4
		lastSample = { at: now, downloaded: next.downloaded }
	}
	if (next.total && next.downloaded >= next.total) stage.value = 'installing'
}

export function useEdenWorldInstall() {
	async function install(): Promise<InstallJobSnapshot> {
		if (running) return running
		stage.value = 'downloading'
		progress.value = { downloaded: 0, total: null }
		bytesPerSecond.value = null
		startedAt.value = Date.now()
		finishedAt.value = null
		errorMessage.value = null
		lastSample = null

		running = (async () => {
			try {
				const job = await downloadAndInstallEdenWorld(onProgress)
				stage.value = 'ready'
				return job
			} catch (error) {
				stage.value = 'error'
				errorMessage.value =
					error instanceof Error
						? error.message
						: typeof error === 'object' && error && 'message' in error
							? String((error as { message: unknown }).message)
							: String(error)
				throw error
			} finally {
				finishedAt.value = Date.now()
				running = null
			}
		})()
		return running
	}

	function reset() {
		if (active.value) return
		stage.value = 'idle'
		errorMessage.value = null
	}

	return {
		stage: readonly(stage),
		progress: readonly(progress),
		percent,
		bytesPerSecond: readonly(bytesPerSecond),
		secondsLeft,
		startedAt: readonly(startedAt),
		finishedAt: readonly(finishedAt),
		errorMessage: readonly(errorMessage),
		active,
		install,
		reset,
		instanceName: EDENWORLD_INSTANCE_NAME,
	}
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} Б`
	if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} КБ`
	if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1).replace('.', ',')} МБ`
	return `${(bytes / 1024 ** 3).toFixed(2).replace('.', ',')} ГБ`
}

export function formatDuration(seconds: number): string {
	if (seconds < 60) return `${Math.max(1, Math.round(seconds))} с`
	const minutes = Math.floor(seconds / 60)
	if (minutes < 60) return `${minutes} мин ${Math.round(seconds % 60)} с`
	return `${Math.floor(minutes / 60)} ч ${minutes % 60} мин`
}
