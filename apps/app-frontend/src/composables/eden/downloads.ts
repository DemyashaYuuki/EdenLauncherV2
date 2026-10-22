import { computed, getCurrentScope, onScopeDispose, readonly, ref } from 'vue'

import { install_job_listener, loading_listener } from '@/helpers/events'
import {
	install_job_cancel,
	install_job_dismiss,
	install_job_list,
	install_job_retry,
	type InstallJobSnapshot,
	type InstallPhaseId,
	isInstallJobFinished,
} from '@/helpers/install'
import { type LoadingBar, progress_bars_list } from '@/helpers/state'

import { useEdenWorldInstall } from './edenworld-install'

/** Visual stages of the downloads screen, mapped from the real install phases. */
export type DownloadStage = 'prepare' | 'download' | 'verify' | 'done'

const PHASE_STAGE: Record<InstallPhaseId, DownloadStage> = {
	preparing_instance: 'prepare',
	resolving_pack: 'prepare',
	reading_pack_manifest: 'prepare',
	resolving_minecraft: 'prepare',
	resolving_loader: 'prepare',
	preparing_java: 'prepare',
	downloading_pack_file: 'download',
	downloading_content: 'download',
	downloading_minecraft: 'download',
	extracting_overrides: 'verify',
	running_loader_processors: 'verify',
	finalizing: 'verify',
	rolling_back: 'verify',
}

export const PHASE_LABELS: Record<InstallPhaseId, string> = {
	preparing_instance: 'Подготавливаем профиль',
	resolving_pack: 'Получаем сведения о сборке',
	reading_pack_manifest: 'Читаем состав сборки',
	resolving_minecraft: 'Подбираем версию Minecraft',
	resolving_loader: 'Подбираем загрузчик',
	preparing_java: 'Подготавливаем Java',
	downloading_pack_file: 'Загружаем архив сборки',
	downloading_content: 'Загружаем моды и ресурсы',
	downloading_minecraft: 'Загружаем игровые файлы',
	extracting_overrides: 'Распаковываем файлы',
	running_loader_processors: 'Настраиваем загрузчик',
	finalizing: 'Проверяем и завершаем установку',
	rolling_back: 'Отменяем изменения',
}

export const JOB_KIND_LABELS: Record<InstallJobSnapshot['kind'], string> = {
	create_instance: 'Создание сборки',
	create_modpack_instance: 'Установка сборки',
	create_shared_instance: 'Установка общей сборки',
	update_shared_instance: 'Обновление общей сборки',
	import_instance: 'Импорт сборки',
	duplicate_instance: 'Копирование сборки',
	install_existing_instance: 'Восстановление сборки',
	install_pack_to_existing_instance: 'Обновление сборки',
}

// Loading bars that install jobs already describe; showing both would duplicate entries.
const BARS_COVERED_BY_JOBS = [
	'java_download',
	'pack_file_download',
	'pack_download',
	'minecraft_download',
	'copy_instance',
	'launcher_update',
]

const jobs = ref<InstallJobSnapshot[]>([])
const bars = ref<LoadingBar[]>([])
const loaded = ref(false)
const loadError = ref<string | null>(null)
let subscribers = 0
let unlisteners: Array<() => void> = []

async function refreshJobs() {
	try {
		const next = await install_job_list(true)
		jobs.value = Array.isArray(next)
			? next.slice().sort((a, b) => b.created.localeCompare(a.created))
			: []
		loadError.value = null
	} catch (error) {
		loadError.value = error instanceof Error ? error.message : String(error)
	} finally {
		loaded.value = true
	}
}

async function refreshBars() {
	try {
		const next = await progress_bars_list()
		bars.value = Object.values(next ?? {}).filter(
			(bar) => !BARS_COVERED_BY_JOBS.includes(bar?.bar_type?.type ?? ''),
		)
	} catch {
		bars.value = []
	}
}

async function start() {
	await Promise.all([refreshJobs(), refreshBars()])
	const stopJobs = await install_job_listener(() => void refreshJobs())
	const stopBars = await loading_listener(() => void refreshBars())
	unlisteners = [stopJobs, stopBars]
}

function stop() {
	unlisteners.forEach((unlisten) => unlisten())
	unlisteners = []
}

export function jobStage(job: InstallJobSnapshot): DownloadStage {
	if (job.status === 'succeeded') return 'done'
	return PHASE_STAGE[job.phase] ?? 'prepare'
}

export function jobPercent(job: InstallJobSnapshot): number | null {
	if (job.status === 'succeeded') return 100
	const progress = job.progress?.secondary ?? job.progress
	if (!progress || progress.total <= 0) return null
	return Math.max(0, Math.min(100, Math.round((progress.current / progress.total) * 100)))
}

export function jobTitle(job: InstallJobSnapshot): string {
	if (job.display?.title) return job.display.title
	switch (job.details.type) {
		case 'instance':
			return job.details.name
		case 'modpack':
			return job.details.title ?? 'Сборка'
		case 'minecraft':
			return `Minecraft ${job.details.game_version}`
		case 'java':
			return `Java ${job.details.major_version}`
		case 'import':
			return job.details.instance_folder
		default:
			return 'Игровая сборка'
	}
}

export function useEdenDownloads() {
	subscribers++
	if (subscribers === 1) void start()
	if (getCurrentScope()) {
		onScopeDispose(() => {
			subscribers--
			if (subscribers === 0) stop()
		})
	}

	const edenInstall = useEdenWorldInstall()

	const activeJobs = computed(() => jobs.value.filter((job) => !isInstallJobFinished(job.status)))
	const finishedJobs = computed(() => jobs.value.filter((job) => isInstallJobFinished(job.status)))
	const activeCount = computed(
		() => activeJobs.value.length + bars.value.length + (edenInstall.active.value ? 1 : 0),
	)

	async function cancel(job: InstallJobSnapshot) {
		await install_job_cancel(job.job_id)
		await refreshJobs()
	}

	async function retry(job: InstallJobSnapshot) {
		await install_job_retry(job.job_id)
		await refreshJobs()
	}

	async function dismiss(job: InstallJobSnapshot) {
		await install_job_dismiss(job.job_id)
		await refreshJobs()
	}

	async function clearFinished() {
		await Promise.all(finishedJobs.value.map((job) => install_job_dismiss(job.job_id)))
		await refreshJobs()
	}

	return {
		jobs: readonly(jobs),
		bars: readonly(bars),
		loaded: readonly(loaded),
		loadError: readonly(loadError),
		activeJobs,
		finishedJobs,
		activeCount,
		cancel,
		retry,
		dismiss,
		clearFinished,
		refresh: () => Promise.all([refreshJobs(), refreshBars()]),
	}
}
