import { appDataDir, join } from '@tauri-apps/api/path'
import { BaseDirectory, exists, mkdir, remove, writeFile } from '@tauri-apps/plugin-fs'
import { fetch } from '@tauri-apps/plugin-http'

import {
	install_create_modpack_instance,
	install_get_modpack_preview,
	wait_for_install_job,
} from '@/helpers/install'

const EDENWORLD_PACK_NAME = 'EdenWorld-2.0-1.0.0.mrpack'
const EDENWORLD_DOWNLOAD_DIRECTORY = 'profiles/.edenworld'
const EDENWORLD_RELATIVE_PATH = `${EDENWORLD_DOWNLOAD_DIRECTORY}/${EDENWORLD_PACK_NAME}`

// Git LFS serves the archive bytes here; raw.githubusercontent.com serves its pointer.
const EDENWORLD_DOWNLOAD_URL = `https://media.githubusercontent.com/media/DemyashaYuuki/EdenLauncherV2/main/modpacks/${EDENWORLD_PACK_NAME}`

export const EDENWORLD_PROJECT_URL = 'https://edenworld.fun/'
export const EDENWORLD_TELEGRAM_URL = 'https://t.me/EdenWorldMC'
export const EDENWORLD_DISCORD_URL = 'https://discord.gg/WBTUMKuBTa'
export const EDENWORLD_VOTE_URL = 'https://top-minecrafter.com/server/edenworld/'
export const EDENWORLD_SERVER_ADDRESS = 'EdenWorld.gomc.fun'
/** Name of the profile that downloadAndInstallEdenWorld creates. */
export const EDENWORLD_INSTANCE_NAME = 'EdenWorld 2.0'
export const EDENWORLD_GAME_VERSION = '26.3'

export type EdenWorldInstallProgress = {
	downloaded: number
	total: number | null
}

async function removeDownloadedPack() {
	if (await exists(EDENWORLD_RELATIVE_PATH, { baseDir: BaseDirectory.AppData })) {
		await remove(EDENWORLD_RELATIVE_PATH, { baseDir: BaseDirectory.AppData })
	}
}

async function downloadPack(onProgress: (progress: EdenWorldInstallProgress) => void) {
	await mkdir(EDENWORLD_DOWNLOAD_DIRECTORY, {
		baseDir: BaseDirectory.AppData,
		recursive: true,
	})
	await removeDownloadedPack()

	const response = await fetch(EDENWORLD_DOWNLOAD_URL, {
		method: 'GET',
		headers: {
			Accept: 'application/octet-stream',
		},
	})

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
	onProgress: (progress: EdenWorldInstallProgress) => void,
) {
	const packPath = await downloadPack(onProgress)
	const location = { type: 'fromFile' as const, path: packPath }

	try {
		const preview = await install_get_modpack_preview(location)
		if (!preview.name.toLocaleLowerCase().includes('edenworld')) {
			throw new Error('Загруженный архив не является официальной сборкой EdenWorld.')
		}

		const job = await install_create_modpack_instance(location, {
			name: EDENWORLD_INSTANCE_NAME,
		})
		return await wait_for_install_job(job.job_id)
	} finally {
		await removeDownloadedPack().catch(() => undefined)
	}
}
