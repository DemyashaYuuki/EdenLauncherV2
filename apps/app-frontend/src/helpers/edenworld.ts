import { appDataDir, join } from '@tauri-apps/api/path'
import { BaseDirectory, exists, mkdir, remove, writeFile } from '@tauri-apps/plugin-fs'
import { fetch } from '@tauri-apps/plugin-http'

import {
	install_create_modpack_instance,
	install_get_modpack_preview,
	install_pack_to_existing_instance,
	wait_for_install_job,
} from '@/helpers/install'

const EDENWORLD_FILE_ID = '1Z8wujB1a7XYrf46gjtmrsQb4GitMVqMC'
const EDENWORLD_PACK_NAME = 'EdenWorld-1.21.11.mrpack'
const EDENWORLD_DOWNLOAD_DIRECTORY = 'profiles/.edenworld'
const EDENWORLD_RELATIVE_PATH = `${EDENWORLD_DOWNLOAD_DIRECTORY}/${EDENWORLD_PACK_NAME}`

const EDENWORLD_STANDARD_DOWNLOAD_URL = `https://drive.google.com/uc?export=download&confirm=t&id=${EDENWORLD_FILE_ID}`
const EDENWORLD_RF_DOWNLOAD_URL = `https://drive.usercontent.google.com/download?id=${EDENWORLD_FILE_ID}&export=download&confirm=t`

export const EDENWORLD_PROJECT_URL = 'https://edenworld.fun/'
export const EDENWORLD_TELEGRAM_URL = 'https://t.me/EdenWorldMC'
export const EDENWORLD_DISCORD_URL = 'https://discord.gg/WBTUMKuBTa'

export type EdenWorldInstallProgress = {
	downloaded: number
	total: number | null
}

async function removeDownloadedPack() {
	if (await exists(EDENWORLD_RELATIVE_PATH, { baseDir: BaseDirectory.AppData })) {
		await remove(EDENWORLD_RELATIVE_PATH, { baseDir: BaseDirectory.AppData })
	}
}

async function downloadPack(
	rfMode: boolean,
	onProgress: (progress: EdenWorldInstallProgress) => void,
) {
	await mkdir(EDENWORLD_DOWNLOAD_DIRECTORY, {
		baseDir: BaseDirectory.AppData,
		recursive: true,
	})
	await removeDownloadedPack()

	const response = await fetch(
		rfMode ? EDENWORLD_RF_DOWNLOAD_URL : EDENWORLD_STANDARD_DOWNLOAD_URL,
		{
			method: 'GET',
			headers: {
				Accept: 'application/octet-stream',
			},
		},
	)

	if (!response.ok || !response.body) {
		throw new Error(`Не удалось загрузить сборку EdenWorld: HTTP ${response.status}`)
	}

	const totalHeader = response.headers.get('content-length')
	const total = totalHeader ? Number.parseInt(totalHeader, 10) : null
	let downloaded = 0
	const progressStream = response.body.pipeThrough(
		new TransformStream<Uint8Array, Uint8Array>({
			transform(chunk, controller) {
				downloaded += chunk.byteLength
				onProgress({ downloaded, total: Number.isFinite(total) ? total : null })
				controller.enqueue(chunk)
			},
		}),
	)

	try {
		await writeFile(EDENWORLD_RELATIVE_PATH, progressStream, {
			baseDir: BaseDirectory.AppData,
		})
	} catch (error) {
		await removeDownloadedPack().catch(() => undefined)
		throw error
	}

	return await join(await appDataDir(), EDENWORLD_RELATIVE_PATH)
}

export async function downloadAndInstallEdenWorld(
	rfMode: boolean,
	onProgress: (progress: EdenWorldInstallProgress) => void,
) {
	const packPath = await downloadPack(rfMode, onProgress)
	const location = { type: 'fromFile' as const, path: packPath }

	try {
		const preview = await install_get_modpack_preview(location)
		if (!preview.name.toLocaleLowerCase().includes('edenworld')) {
			throw new Error('Загруженный архив не является официальной сборкой EdenWorld.')
		}

		const job = await install_create_modpack_instance(location, {
			name: 'EdenWorld 1.21.11',
		})
		return await wait_for_install_job(job.job_id)
	} finally {
		await removeDownloadedPack().catch(() => undefined)
	}
}

export async function repairEdenWorld(
	instanceId: string,
	rfMode: boolean,
	onProgress: (progress: EdenWorldInstallProgress) => void,
) {
	const packPath = await downloadPack(rfMode, onProgress)
	const location = { type: 'fromFile' as const, path: packPath }

	try {
		const preview = await install_get_modpack_preview(location)
		if (!preview.name.toLocaleLowerCase().includes('edenworld')) {
			throw new Error('Загруженный архив не является официальной сборкой EdenWorld.')
		}

		const job = await install_pack_to_existing_instance(instanceId, location)
		return await wait_for_install_job(job.job_id)
	} finally {
		await removeDownloadedPack().catch(() => undefined)
	}
}
