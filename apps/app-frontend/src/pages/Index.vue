<script setup lang="ts">
import {
	DiscordIcon,
	DownloadIcon,
	GlobeIcon,
	HomeIcon,
	MessageIcon,
	PlayIcon,
	RefreshCwIcon,
	ServerIcon,
} from '@modrinth/assets'
import { injectNotificationManager, NewModal } from '@modrinth/ui'
import type { SearchResult } from '@modrinth/utils'
import { openUrl } from '@tauri-apps/plugin-opener'
import dayjs from 'dayjs'
import { computed, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import edenBackground from '@/assets/edenworld-background.png'
import edenLogo from '@/assets/edenworld-logo.jpg'
import asunaBackground from '@/assets/theme-asuna.png'
import errorBackground from '@/assets/theme-error.png'
import RowDisplay from '@/components/RowDisplay.vue'
import PlayerHead from '@/components/ui/PlayerHead.vue'
import TelegramIcon from '@/components/ui/TelegramIcon.vue'
import RecentWorldsList from '@/components/ui/world/RecentWorldsList.vue'
import { get_search_results } from '@/helpers/cache.js'
import {
	downloadAndInstallEdenWorld,
	EDENWORLD_DISCORD_URL,
	EDENWORLD_PROJECT_URL,
	EDENWORLD_TELEGRAM_URL,
	type EdenWorldInstallProgress,
} from '@/helpers/edenworld'
import { instance_listener } from '@/helpers/events'
import { list } from '@/helpers/instance'
import type { GameInstance } from '@/helpers/types'
import { get_server_status, type ServerStatus } from '@/helpers/worlds'
import { useRootBreadcrumb } from '@/providers/breadcrumbs'
import { useTheming } from '@/store/state'

const { handleError } = injectNotificationManager()
const router = useRouter()
const themeStore = useTheming()

const EDENWORLD_SERVER_ADDRESS = 'EdenWorld.gomc.fun'
const EDENWORLD_VOTE_URL = 'https://top-minecrafter.com/server/edenworld/'

useRootBreadcrumb({
	slot: 'root',
	id: 'home',
	label: 'EdenWorld',
	to: '/',
	visual: { type: 'icon', component: HomeIcon },
})

const instances = ref<GameInstance[]>([])
const featuredModpacks = ref<SearchResult[]>([])
const featuredMods = ref<SearchResult[]>([])
const installedModpacksFilter = ref('')
const installing = ref(false)
const installStage = ref<'idle' | 'downloading' | 'installing' | 'ready'>('idle')
const installProgress = ref<EdenWorldInstallProgress>({ downloaded: 0, total: null })
const serverStatus = ref<ServerStatus | null>(null)
const serverStatusLoading = ref(true)
const serverStatusFailed = ref(false)
const playersModal = ref<InstanceType<typeof NewModal> | null>(null)

const recentInstances = computed(() =>
	instances.value
		.filter((instance) => instance.last_played)
		.slice()
		.sort((a, b) => dayjs(b.last_played).diff(dayjs(a.last_played))),
)
const edenWorldInstance = computed(() =>
	instances.value.find((instance) => instance.name.toLocaleLowerCase().includes('edenworld')),
)
const hasFeaturedProjects = computed(
	() => (featuredModpacks.value?.length ?? 0) + (featuredMods.value?.length ?? 0) > 0,
)
const progressPercent = computed(() => {
	if (installStage.value === 'installing') return 100
	if (!installProgress.value.total) return 0
	return Math.min(
		100,
		Math.round((installProgress.value.downloaded / installProgress.value.total) * 100),
	)
})
const installButtonLabel = computed(() => {
	if (edenWorldInstance.value) return 'Открыть сборку'
	if (installStage.value === 'downloading') return `Загрузка · ${progressPercent.value}%`
	if (installStage.value === 'installing') return 'Установка…'
	if (installStage.value === 'ready') return 'Готово'
	return 'Установить EdenWorld'
})
const heroBackground = computed(() => {
	if (themeStore.visualTheme === 'asuna') return asunaBackground
	if (themeStore.visualTheme === 'error') return errorBackground
	if (themeStore.visualTheme === 'custom' && themeStore.customTheme.backgroundDataUrl) {
		return themeStore.customTheme.backgroundDataUrl
	}
	return edenBackground
})
const serverStatusLabel = computed(() => {
	if (serverStatusLoading.value) return 'Проверяем…'
	if (serverStatusFailed.value || !serverStatus.value) return 'Недоступен'
	return `${serverStatus.value.players?.online ?? 0} / ${serverStatus.value.players?.max ?? '—'}`
})
const onlinePlayers = computed(() => serverStatus.value?.players?.sample ?? [])
const hiddenOnlinePlayers = computed(() =>
	Math.max(0, (serverStatus.value?.players?.online ?? 0) - onlinePlayers.value.length),
)

const offline = ref<boolean>(!navigator.onLine)
const handleOffline = () => {
	offline.value = true
}
const handleOnline = () => {
	offline.value = false
}
window.addEventListener('offline', handleOffline)
window.addEventListener('online', handleOnline)

async function fetchServerStatus() {
	serverStatusLoading.value = true
	try {
		serverStatus.value = await get_server_status(EDENWORLD_SERVER_ADDRESS)
		serverStatusFailed.value = false
	} catch (error) {
		console.warn('Не удалось получить статус EdenWorld.', error)
		serverStatus.value = null
		serverStatusFailed.value = true
	} finally {
		serverStatusLoading.value = false
	}
}

async function showOnlinePlayers() {
	playersModal.value?.show()
	await fetchServerStatus()
}

async function openProjectLink(url: string) {
	await openUrl(url).catch(handleError)
}

async function fetchInstances() {
	instances.value = await list().catch(handleError)

	const filters = []
	for (const instance of instances.value) {
		if (instance.link?.project_id) {
			filters.push(`NOT"project_id"="${instance.link.project_id}"`)
		}
	}
	installedModpacksFilter.value = filters.join(' AND ')
}

async function fetchFeaturedModpacks() {
	const response = await get_search_results(
		`?facets=[["project_type:modpack"]]&limit=10&index=follows&filters=${installedModpacksFilter.value}`,
	)
	featuredModpacks.value = response?.result.hits ?? []
}

async function fetchFeaturedMods() {
	const response = await get_search_results('?facets=[["project_type:mod"]]&limit=10&index=follows')
	featuredMods.value = response?.result.hits ?? []
}

async function refreshFeaturedProjects() {
	await Promise.all([fetchFeaturedModpacks(), fetchFeaturedMods()])
}

async function installEdenWorld() {
	if (edenWorldInstance.value) {
		await router.push(`/instance/${encodeURIComponent(edenWorldInstance.value.id)}/`)
		return
	}

	installing.value = true
	installStage.value = 'downloading'
	installProgress.value = { downloaded: 0, total: null }

	try {
		const job = await downloadAndInstallEdenWorld((progress) => {
			installProgress.value = progress
			if (progress.total && progress.downloaded >= progress.total) {
				installStage.value = 'installing'
			}
		})
		installStage.value = 'ready'
		await fetchInstances()
		const instanceId = job.instance_id ?? job.target.instance_id
		if (instanceId) {
			await router.push(`/instance/${encodeURIComponent(instanceId)}/`)
		}
	} catch (error) {
		installStage.value = 'idle'
		handleError(error as Error)
	} finally {
		installing.value = false
	}
}
await fetchInstances()
await refreshFeaturedProjects()
void fetchServerStatus()

const serverStatusTimer = window.setInterval(() => void fetchServerStatus(), 60_000)

const unlistenInstance = await instance_listener(async (event: { event: string }) => {
	await fetchInstances()

	if (event.event === 'added' || event.event === 'created' || event.event === 'removed') {
		await refreshFeaturedProjects()
	}
})

onUnmounted(() => {
	unlistenInstance()
	window.clearInterval(serverStatusTimer)
	window.removeEventListener('offline', handleOffline)
	window.removeEventListener('online', handleOnline)
})
</script>

<template>
	<div
		class="eden-home"
		:class="[
			`eden-home--${themeStore.visualTheme}`,
			{
				'eden-home--custom-light':
					themeStore.visualTheme === 'custom' && themeStore.customTheme.baseTheme === 'light',
			},
		]"
	>
		<section class="eden-hero" :style="{ backgroundImage: `url(${heroBackground})` }">
			<div class="eden-hero__veil"></div>
			<div class="eden-hero__content">
				<div class="eden-kicker">
					<span class="eden-kicker__dot"></span>
					EDENLAUNCHER 2.6 · MINECRAFT 1.21.11
				</div>
				<div class="eden-title-row">
					<img :src="edenLogo" alt="EdenWorld" class="eden-logo" />
					<div>
						<h1>EdenWorld</h1>
						<p>Мы за настоящую ванилу!</p>
					</div>
				</div>
				<p class="eden-lead">
					Один лаунчер для входа в мир EdenWorld: официальная сборка, быстрые ссылки и автоматически
					подготовленное подключение для игроков из России.
				</p>
				<div class="eden-hero__actions">
					<button
						class="eden-button eden-button--primary"
						:disabled="installing || offline"
						@click="installEdenWorld"
					>
						<PlayIcon v-if="edenWorldInstance" />
						<DownloadIcon v-else />
						{{ installButtonLabel }}
					</button>
					<button
						class="eden-button eden-button--glass"
						@click="openProjectLink(EDENWORLD_PROJECT_URL)"
					>
						<GlobeIcon />
						Сайт проекта
					</button>
					<button
						class="eden-button eden-button--glass"
						@click="openProjectLink(EDENWORLD_VOTE_URL)"
					>
						<HomeIcon />
						Проголосовать
					</button>
				</div>
			</div>
		</section>

		<section class="eden-dashboard">
			<article class="eden-panel eden-install-panel">
				<div class="eden-panel__icon"><DownloadIcon /></div>
				<div class="eden-panel__body">
					<div class="eden-panel__eyebrow">БЫСТРЫЙ СТАРТ</div>
					<h2>Сборка проекта</h2>
					<p>Официальный .mrpack · 52,8 МБ · автоматическое создание профиля</p>
					<div
						v-if="installing || installStage === 'ready'"
						class="eden-progress"
						aria-live="polite"
					>
						<div class="eden-progress__track">
							<div class="eden-progress__bar" :style="{ width: `${progressPercent}%` }"></div>
						</div>
						<span>{{ installButtonLabel }}</span>
					</div>
				</div>
				<button
					class="eden-icon-button"
					:disabled="installing || offline"
					aria-label="Установить сборку EdenWorld"
					@click="installEdenWorld"
				>
					<PlayIcon v-if="edenWorldInstance" />
					<DownloadIcon v-else />
				</button>
			</article>

			<article class="eden-panel eden-server-panel">
				<div class="eden-panel__icon eden-panel__icon--server"><ServerIcon /></div>
				<div class="eden-panel__body">
					<div class="eden-panel__eyebrow">СЕРВЕР</div>
					<h2>EdenWorld</h2>
					<p>
						{{ EDENWORLD_SERVER_ADDRESS }} ·
						{{ serverStatus?.version?.name ?? 'Minecraft 1.21.11+' }}
					</p>
					<div
						class="eden-server-status"
						:class="{ 'eden-server-status--offline': serverStatusFailed }"
					>
						<span></span>
						{{ serverStatusLabel }}
						<template v-if="serverStatus?.ping"> · {{ serverStatus.ping }} мс</template>
					</div>
				</div>
				<button
					class="eden-panel-action"
					:disabled="serverStatusLoading"
					aria-label="Посмотреть игроков онлайн"
					@click="showOnlinePlayers"
				>
					<RefreshCwIcon v-if="serverStatusLoading" class="animate-spin" />
					<ServerIcon v-else />
					Игроки
				</button>
			</article>

			<article class="eden-panel eden-social-panel">
				<div class="eden-panel__icon eden-panel__icon--social"><MessageIcon /></div>
				<div class="eden-panel__body">
					<div class="eden-panel__eyebrow">СООБЩЕСТВО</div>
					<h2>Будь на связи</h2>
					<p>Новости, помощь и общение с игроками проекта.</p>
				</div>
				<div class="eden-social-actions">
					<button
						aria-label="Открыть Telegram EdenWorld"
						@click="openProjectLink(EDENWORLD_TELEGRAM_URL)"
					>
						<TelegramIcon /> TG
					</button>
					<button
						aria-label="Открыть Discord EdenWorld"
						@click="openProjectLink(EDENWORLD_DISCORD_URL)"
					>
						<DiscordIcon /> DS
					</button>
				</div>
			</article>
		</section>

		<section v-if="recentInstances.length > 0" class="eden-content-section">
			<div class="eden-section-heading">
				<div>
					<span>ПРОДОЛЖИТЬ</span>
					<h2>Недавние миры</h2>
				</div>
			</div>
			<RecentWorldsList :recent-instances="recentInstances" />
		</section>

		<section v-if="hasFeaturedProjects" class="eden-content-section">
			<div class="eden-section-heading">
				<div>
					<span>КАТАЛОГ</span>
					<h2>Больше контента</h2>
				</div>
			</div>
			<RowDisplay
				:instances="[
					{
						label: 'Популярные сборки',
						route: '/browse/modpack',
						instances: featuredModpacks,
						downloaded: false,
					},
					{
						label: 'Популярные моды',
						route: '/browse/mod',
						instances: featuredMods,
						downloaded: false,
					},
				]"
				:can-paginate="true"
			/>
		</section>

		<NewModal ref="playersModal" header="Игроки EdenWorld" max-width="560px">
			<div class="eden-players-modal">
				<div v-if="serverStatusLoading" class="eden-players-state">
					<RefreshCwIcon class="animate-spin" />
					<span>Обновляем список игроков…</span>
				</div>
				<div v-else-if="serverStatusFailed || !serverStatus" class="eden-players-state">
					<ServerIcon />
					<span>Сервер сейчас не отвечает.</span>
				</div>
				<div v-else-if="(serverStatus.players?.online ?? 0) === 0" class="eden-players-state">
					<ServerIcon />
					<span>Сейчас на сервере никого нет.</span>
				</div>
				<template v-else>
					<div class="eden-players-summary">
						<strong>Онлайн {{ serverStatus.players?.online ?? 0 }} игроков</strong>
						<span>Максимум: {{ serverStatus.players?.max ?? '—' }}</span>
					</div>
					<div v-if="onlinePlayers.length" class="eden-players-list">
						<div v-for="player in onlinePlayers" :key="player.id || player.name">
							<PlayerHead :name="player.name" :uuid="player.id" />
							<strong>{{ player.name }}</strong>
						</div>
					</div>
					<p v-else class="eden-players-hidden">
						Сервер передал количество игроков, но скрыл их ники.
					</p>
					<p v-if="hiddenOnlinePlayers > 0 && onlinePlayers.length" class="eden-players-hidden">
						Ещё {{ hiddenOnlinePlayers }} игроков не отображаются в публичном ответе сервера.
					</p>
				</template>
				<button
					class="eden-panel-action ml-auto"
					:disabled="serverStatusLoading"
					@click="fetchServerStatus"
				>
					<RefreshCwIcon :class="{ 'animate-spin': serverStatusLoading }" />
					Обновить
				</button>
			</div>
		</NewModal>
	</div>
</template>

<style scoped lang="scss">
.eden-home {
	min-height: 100%;
	padding: 1.35rem;
	color: var(--color-text-primary);
	background:
		radial-gradient(circle at 18% 0%, var(--color-brand-highlight), transparent 28rem),
		var(--color-bg);
}

.eden-home--asuna,
.eden-home--error,
.eden-home--custom {
	background: transparent;
}

.eden-hero {
	position: relative;
	min-height: 25rem;
	overflow: hidden;
	border: 1px solid var(--brand-gradient-border);
	border-radius: 1.75rem;
	background-position: center 42%;
	background-size: cover;
	box-shadow: 0 2rem 5rem rgba(0, 0, 0, 0.35);
}

.eden-hero__veil {
	position: absolute;
	inset: 0;
	background:
		linear-gradient(
			90deg,
			rgba(8, 7, 12, 0.98) 0%,
			rgba(8, 7, 12, 0.78) 42%,
			rgba(8, 7, 12, 0.12) 78%
		),
		linear-gradient(0deg, rgba(8, 7, 12, 0.62), transparent 55%);
}

.eden-home--asuna .eden-hero__veil {
	background:
		linear-gradient(
			90deg,
			rgba(255, 252, 254, 0.97) 0%,
			rgba(255, 246, 251, 0.82) 43%,
			rgba(255, 246, 251, 0.08) 79%
		),
		linear-gradient(0deg, rgba(255, 244, 250, 0.5), transparent 58%);
}

.eden-home--custom-light .eden-hero__veil {
	background:
		linear-gradient(
			90deg,
			rgba(250, 248, 252, 0.96) 0%,
			rgba(250, 248, 252, 0.78) 44%,
			rgba(250, 248, 252, 0.08) 80%
		),
		linear-gradient(0deg, rgba(250, 248, 252, 0.48), transparent 58%);
}

.eden-home--custom-light :is(.eden-title-row p, .eden-lead) {
	color: rgba(30, 24, 34, 0.76);
}

.eden-home--asuna .eden-title-row h1 {
	background: linear-gradient(110deg, #4c2537 8%, #c14f84 58%, #e994b9 100%);
	-webkit-background-clip: text;
	background-clip: text;
}

.eden-home--asuna :is(.eden-title-row p, .eden-lead) {
	color: rgba(60, 31, 45, 0.76);
}

.eden-home--error .eden-hero {
	box-shadow:
		0 2rem 5rem rgba(0, 0, 0, 0.58),
		0 0 2.5rem rgba(225, 29, 72, 0.16);
}

.eden-home--error .eden-title-row h1 {
	text-shadow:
		3px 0 rgba(255, 0, 55, 0.28),
		-3px 0 rgba(129, 60, 255, 0.2);
}

.eden-hero__content {
	position: relative;
	z-index: 1;
	display: flex;
	max-width: 44rem;
	min-height: 25rem;
	box-sizing: border-box;
	flex-direction: column;
	justify-content: center;
	padding: 3rem;
}

.eden-kicker,
.eden-panel__eyebrow,
.eden-section-heading span {
	display: flex;
	align-items: center;
	gap: 0.55rem;
	color: var(--color-link);
	font-size: 0.7rem;
	font-weight: 800;
	letter-spacing: 0.16em;
}

.eden-kicker__dot {
	width: 0.45rem;
	height: 0.45rem;
	border-radius: 50%;
	background: var(--color-brand);
	box-shadow: 0 0 1rem var(--color-brand-shadow);
}

.eden-title-row {
	display: flex;
	align-items: center;
	gap: 1.2rem;
	margin-top: 1.35rem;
}

.eden-logo {
	width: 5.25rem;
	height: 5.25rem;
	border: 1px solid rgba(255, 255, 255, 0.2);
	border-radius: 1.4rem;
	box-shadow: 0 0 2.5rem var(--color-brand-shadow);
	object-fit: cover;
}

.eden-title-row h1 {
	margin: 0;
	font-size: clamp(3rem, 5vw, 4.9rem);
	font-weight: 900;
	letter-spacing: -0.055em;
	line-height: 0.95;
	background: linear-gradient(110deg, #fff 12%, var(--color-purple-200) 72%, var(--color-brand));
	-webkit-background-clip: text;
	background-clip: text;
	color: transparent;
}

.eden-title-row p {
	margin: 0.55rem 0 0;
	color: rgba(255, 255, 255, 0.82);
	font-size: 1.08rem;
}

.eden-lead {
	max-width: 38rem;
	margin: 1.5rem 0 0;
	color: rgba(255, 255, 255, 0.68);
	font-size: 0.98rem;
	line-height: 1.65;
}

.eden-hero__actions {
	display: flex;
	flex-wrap: wrap;
	gap: 0.8rem;
	margin-top: 1.7rem;
}

.eden-button {
	display: inline-flex;
	height: 3rem;
	align-items: center;
	justify-content: center;
	gap: 0.6rem;
	padding: 0 1.15rem;
	border: 1px solid transparent;
	border-radius: 0.9rem;
	color: #fff;
	font: inherit;
	font-weight: 750;
	cursor: pointer;
	transition: 160ms ease;
}

.eden-button svg,
.eden-icon-button svg,
.eden-panel-action svg,
.eden-social-actions svg,
.eden-panel__icon svg {
	width: 1.15rem;
	height: 1.15rem;
}

.eden-icon-button--secondary {
	color: var(--color-link);
	background: var(--color-brand-highlight);
}

.eden-button--primary {
	color: var(--color-accent-contrast);
	background: linear-gradient(135deg, var(--color-brand), var(--color-purple-700));
	box-shadow: 0 0.75rem 2rem var(--color-brand-highlight);
}

.eden-button--primary:hover:not(:disabled) {
	transform: translateY(-2px);
	box-shadow: 0 1rem 2.5rem var(--color-brand-shadow);
}

.eden-button--glass {
	border-color: rgba(255, 255, 255, 0.16);
	background: rgba(255, 255, 255, 0.07);
	backdrop-filter: blur(12px);
}

.eden-button--glass:hover {
	background: rgba(255, 255, 255, 0.13);
}

.eden-button:disabled,
.eden-icon-button:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.eden-dashboard {
	display: grid;
	grid-template-columns: 1.25fr 1fr 1fr;
	gap: 0.9rem;
	margin-top: 0.9rem;
}

.eden-panel {
	display: flex;
	min-width: 0;
	align-items: center;
	gap: 0.9rem;
	padding: 1.15rem;
	border: 1px solid var(--color-button-border);
	border-radius: 1.25rem;
	background: linear-gradient(145deg, var(--surface-3), var(--surface-2));
	box-shadow: 0 0.8rem 2.5rem rgba(0, 0, 0, 0.17);
}

.eden-panel__icon {
	display: grid;
	width: 2.8rem;
	height: 2.8rem;
	flex: 0 0 2.8rem;
	place-items: center;
	border-radius: 0.85rem;
	color: var(--color-link);
	background: var(--color-brand-highlight);
}

.eden-panel__icon--social {
	color: var(--color-link);
	background: var(--color-brand-highlight);
}

.eden-panel__body {
	min-width: 0;
	flex: 1;
}

.eden-panel h2 {
	margin: 0.25rem 0 0;
	font-size: 1.05rem;
	font-weight: 800;
}

.eden-panel p {
	margin: 0.28rem 0 0;
	color: var(--color-text-tertiary);
	font-size: 0.76rem;
	line-height: 1.4;
}

.eden-icon-button {
	display: grid;
	width: 2.65rem;
	height: 2.65rem;
	flex: 0 0 2.65rem;
	place-items: center;
	border: 0;
	border-radius: 0.85rem;
	color: var(--color-accent-contrast);
	background: var(--color-brand);
	cursor: pointer;
}

.eden-progress {
	display: flex;
	align-items: center;
	gap: 0.55rem;
	margin-top: 0.55rem;
	color: var(--color-text-tertiary);
	font-size: 0.7rem;
}

.eden-progress__track {
	width: 5.5rem;
	height: 0.28rem;
	overflow: hidden;
	border-radius: 1rem;
	background: var(--color-divider);
}

.eden-progress__bar {
	height: 100%;
	border-radius: inherit;
	background: linear-gradient(90deg, var(--color-brand), var(--color-purple-300));
	transition: width 180ms ease;
}

.eden-server-status {
	display: inline-flex;
	align-items: center;
	gap: 0.35rem;
	margin-top: 0.45rem;
	color: var(--color-link);
	font-size: 0.72rem;
	font-weight: 750;
}

.eden-server-status > span {
	width: 0.48rem;
	height: 0.48rem;
	border-radius: 50%;
	background: #38d996;
	box-shadow: 0 0 0.65rem rgba(56, 217, 150, 0.72);
}

.eden-server-status--offline {
	color: var(--color-red);
}

.eden-server-status--offline > span {
	background: var(--color-red);
	box-shadow: 0 0 0.65rem var(--color-red-highlight);
}

.eden-panel-action {
	display: inline-flex;
	min-height: 2.45rem;
	flex: 0 0 auto;
	align-items: center;
	justify-content: center;
	gap: 0.4rem;
	padding: 0 0.75rem;
	border: 1px solid var(--color-button-border);
	border-radius: 0.78rem;
	color: var(--color-text-primary);
	background: var(--color-button-bg);
	font: inherit;
	font-size: 0.72rem;
	font-weight: 800;
	cursor: pointer;
	transition: 150ms ease;
}

.eden-panel-action:hover:not(:disabled) {
	border-color: var(--color-brand);
	background: var(--color-brand-highlight);
	transform: translateY(-1px);
}

.eden-panel-action:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.eden-social-actions {
	display: flex;
	gap: 0.45rem;
}

.eden-social-actions button {
	display: inline-flex;
	height: 2.35rem;
	align-items: center;
	gap: 0.35rem;
	padding: 0 0.65rem;
	border: 1px solid var(--color-button-border);
	border-radius: 0.7rem;
	color: var(--color-text-default);
	background: var(--color-button-bg);
	font: inherit;
	font-size: 0.72rem;
	font-weight: 800;
	cursor: pointer;
}

.eden-social-actions button:hover {
	border-color: var(--color-brand);
	background: var(--color-brand-highlight);
}

.eden-content-section {
	margin-top: 2rem;
}

.eden-section-heading {
	display: flex;
	align-items: flex-end;
	justify-content: space-between;
	margin: 0 0 0.9rem;
}

.eden-section-heading h2 {
	margin: 0.25rem 0 0;
	font-size: 1.45rem;
}

.eden-players-modal {
	display: flex;
	min-height: 12rem;
	flex-direction: column;
	gap: 1rem;
	padding: 1.25rem;
}

.eden-players-state,
.eden-players-summary {
	display: flex;
	align-items: center;
	gap: 0.8rem;
}

.eden-players-state {
	min-height: 8rem;
	justify-content: center;
	color: var(--color-text-tertiary);
}

.eden-players-state > svg {
	width: 1.35rem;
	height: 1.35rem;
	flex: 0 0 1.35rem;
}

.eden-players-summary {
	justify-content: space-between;
	padding: 0.9rem 1rem;
	border: 1px solid var(--color-button-border);
	border-radius: 0.9rem;
	background: var(--color-brand-highlight);
}

.eden-players-summary span,
.eden-players-hidden {
	color: var(--color-text-tertiary);
	font-size: 0.76rem;
	line-height: 1.4;
}

.eden-players-list {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 0.55rem;
}

.eden-players-list > div {
	display: flex;
	align-items: center;
	gap: 0.65rem;
	padding: 0.65rem;
	border: 1px solid var(--color-divider);
	border-radius: 0.8rem;
	background: var(--surface-2);
}

.eden-players-list > div > :deep(.player-head) {
	width: 2rem;
	height: 2rem;
	border-radius: 0.6rem;
}

.eden-players-hidden {
	margin: 0;
	padding: 0.75rem;
	border-radius: 0.8rem;
	background: var(--surface-2);
}

@media (max-width: 1240px) {
	.eden-dashboard {
		grid-template-columns: 1fr 1fr;
	}

	.eden-install-panel {
		grid-column: 1 / -1;
	}
}
</style>
