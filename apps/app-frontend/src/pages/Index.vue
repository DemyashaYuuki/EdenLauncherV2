<script setup lang="ts">
import {
	DiscordIcon,
	DownloadIcon,
	GlobeIcon,
	HomeIcon,
	MessageIcon,
	PlayIcon,
	ShieldCheckIcon,
} from '@modrinth/assets'
import { injectNotificationManager } from '@modrinth/ui'
import type { SearchResult } from '@modrinth/utils'
import { openUrl } from '@tauri-apps/plugin-opener'
import dayjs from 'dayjs'
import { computed, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import edenBackground from '@/assets/edenworld-background.png'
import edenLogo from '@/assets/edenworld-logo.jpg'
import RowDisplay from '@/components/RowDisplay.vue'
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
import { useRootBreadcrumb } from '@/providers/breadcrumbs'

const { handleError } = injectNotificationManager()
const router = useRouter()

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
const rfMode = ref(localStorage.getItem('edenlauncher-rf-mode') !== 'false')

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

const offline = ref<boolean>(!navigator.onLine)
const handleOffline = () => {
	offline.value = true
}
const handleOnline = () => {
	offline.value = false
}
window.addEventListener('offline', handleOffline)
window.addEventListener('online', handleOnline)

function updateRfMode() {
	localStorage.setItem('edenlauncher-rf-mode', String(rfMode.value))
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
		const job = await downloadAndInstallEdenWorld(rfMode.value, (progress) => {
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

const unlistenInstance = await instance_listener(async (event: { event: string }) => {
	await fetchInstances()

	if (event.event === 'added' || event.event === 'created' || event.event === 'removed') {
		await refreshFeaturedProjects()
	}
})

onUnmounted(() => {
	unlistenInstance()
	window.removeEventListener('offline', handleOffline)
	window.removeEventListener('online', handleOnline)
})
</script>

<template>
	<div class="eden-home">
		<section class="eden-hero" :style="{ backgroundImage: `url(${edenBackground})` }">
			<div class="eden-hero__veil"></div>
			<div class="eden-hero__content">
				<div class="eden-kicker">
					<span class="eden-kicker__dot"></span>
					EDENLAUNCHER 2.0 · MINECRAFT 1.21.11
				</div>
				<div class="eden-title-row">
					<img :src="edenLogo" alt="EdenWorld" class="eden-logo" />
					<div>
						<h1>EdenWorld</h1>
						<p>Мы за настоящую ванилу!</p>
					</div>
				</div>
				<p class="eden-lead">
					Один лаунчер для входа в мир EdenWorld: официальная сборка, быстрые ссылки и
					подготовленный сетевой режим для игроков из России.
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

			<article class="eden-panel eden-network-panel">
				<div class="eden-panel__icon eden-panel__icon--network"><ShieldCheckIcon /></div>
				<div class="eden-panel__body">
					<div class="eden-panel__eyebrow">СЕТЬ</div>
					<h2>RF‑режим</h2>
					<p>
						Прямые API/CDN‑маршруты и системный прокси; авторизация не проходит через сторонние
						реле.
					</p>
				</div>
				<label class="eden-switch">
					<input v-model="rfMode" type="checkbox" @change="updateRfMode" />
					<span aria-hidden="true"></span>
				</label>
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
						<MessageIcon /> TG
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
.eden-social-actions svg,
.eden-panel__icon svg {
	width: 1.15rem;
	height: 1.15rem;
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

.eden-panel__icon--network {
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

.eden-switch {
	position: relative;
	display: inline-flex;
	flex: 0 0 auto;
	cursor: pointer;
}

.eden-switch input {
	position: absolute;
	opacity: 0;
}

.eden-switch span {
	position: relative;
	width: 2.65rem;
	height: 1.5rem;
	border-radius: 1rem;
	background: var(--surface-5);
	transition: 160ms ease;
}

.eden-switch span::after {
	content: '';
	position: absolute;
	top: 0.22rem;
	left: 0.22rem;
	width: 1.06rem;
	height: 1.06rem;
	border-radius: 50%;
	background: #fff;
	transition: 160ms ease;
}

.eden-switch input:checked + span {
	background: var(--color-brand);
	box-shadow: 0 0 1rem var(--color-brand-highlight);
}

.eden-switch input:checked + span::after {
	transform: translateX(1.14rem);
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

@media (max-width: 1240px) {
	.eden-dashboard {
		grid-template-columns: 1fr 1fr;
	}

	.eden-install-panel {
		grid-column: 1 / -1;
	}
}
</style>
