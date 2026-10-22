import { computed, getCurrentScope, onScopeDispose, readonly, ref } from 'vue'

import { EDENWORLD_SERVER_ADDRESS } from '@/helpers/edenworld'
import { get_server_status, type ServerStatus } from '@/helpers/worlds'

const REFRESH_INTERVAL_MS = 60_000

// One shared poller for the sidebar, the home page and the players dialog.
const status = ref<ServerStatus | null>(null)
const loading = ref(false)
const failed = ref(false)
const checkedAt = ref<number | null>(null)
let subscribers = 0
let timer: number | null = null
let pending: Promise<void> | null = null

async function refresh() {
	if (pending) return pending
	loading.value = true
	pending = (async () => {
		try {
			status.value = await get_server_status(EDENWORLD_SERVER_ADDRESS)
			failed.value = false
		} catch (error) {
			console.warn('Не удалось получить статус EdenWorld.', error)
			status.value = null
			failed.value = true
		} finally {
			checkedAt.value = Date.now()
			loading.value = false
			pending = null
		}
	})()
	return pending
}

const online = computed(() => !failed.value && status.value !== null)
const playersOnline = computed(() => status.value?.players?.online ?? null)
const playersMax = computed(() => status.value?.players?.max ?? null)
const ping = computed(() => status.value?.ping ?? null)
/** Text such as "7 / 100 игроков"; null while nothing is known. */
const playersLabel = computed(() => {
	if (!online.value || playersOnline.value === null) return null
	return playersMax.value
		? `${playersOnline.value} / ${playersMax.value} игроков`
		: `${playersOnline.value} игроков онлайн`
})
const stateLabel = computed(() => {
	if (online.value) return 'Сервер онлайн'
	if (failed.value) return 'Сервер недоступен'
	return 'Проверяем сервер…'
})

export function useEdenServerStatus() {
	subscribers++
	if (subscribers === 1) {
		if (!checkedAt.value || Date.now() - checkedAt.value > REFRESH_INTERVAL_MS) void refresh()
		timer = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS)
	}
	if (getCurrentScope()) {
		onScopeDispose(() => {
			subscribers--
			if (subscribers === 0 && timer !== null) {
				window.clearInterval(timer)
				timer = null
			}
		})
	}

	return {
		status: readonly(status),
		loading: readonly(loading),
		failed: readonly(failed),
		online,
		playersOnline,
		playersMax,
		ping,
		playersLabel,
		stateLabel,
		refresh,
		address: EDENWORLD_SERVER_ADDRESS,
	}
}
