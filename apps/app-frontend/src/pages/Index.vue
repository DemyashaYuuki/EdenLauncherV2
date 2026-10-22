<script setup lang="ts">
import { HomeIcon } from '@modrinth/assets'
import { injectNotificationManager } from '@modrinth/ui'
import type { SearchResult } from '@modrinth/utils'
import { openUrl } from '@tauri-apps/plugin-opener'
import dayjs from 'dayjs'
import { Dropdown } from 'floating-vue'
import { computed, inject, onUnmounted, type Ref, ref } from 'vue'
import { useRouter } from 'vue-router'

import RowDisplay from '@/components/RowDisplay.vue'
import EdenIcon from '@/components/ui/eden/EdenIcon.vue'
import RecentWorldsList from '@/components/ui/world/RecentWorldsList.vue'
import { formatBytes, useEdenWorldInstall } from '@/composables/eden/edenworld-install'
import { useEdenServerStatus } from '@/composables/eden/server-status'
import { get_search_results } from '@/helpers/cache.js'
import {
	EDENWORLD_DISCORD_URL,
	EDENWORLD_GAME_VERSION,
	EDENWORLD_PROJECT_URL,
	EDENWORLD_TELEGRAM_URL,
	EDENWORLD_VOTE_URL,
} from '@/helpers/edenworld'
import { instance_listener, process_listener } from '@/helpers/events'
import { install_existing_instance } from '@/helpers/install'
import { kill, list, run } from '@/helpers/instance'
import { get_by_instance_id } from '@/helpers/process'
import type { GameInstance } from '@/helpers/types'
import { showInstanceInFolder } from '@/helpers/utils.js'
import { useRootBreadcrumb } from '@/providers/breadcrumbs'
import { handleSevereError } from '@/store/error.js'

const { handleError } = injectNotificationManager()
const router = useRouter()
const server = useEdenServerStatus()
const edenInstall = useEdenWorldInstall()
const showPlayers = inject<() => void>('showEdenPlayers', () => undefined)
const accountsCard = inject<Ref<{ accountName?: string | null } | null> | null>(
	'accountsCard',
	null,
)

useRootBreadcrumb({
	slot: 'root',
	id: 'home',
	label: 'Главная',
	to: '/',
	visual: { type: 'icon', component: HomeIcon },
})

const instances = ref<GameInstance[]>([])
const featuredModpacks = ref<SearchResult[]>([])
const featuredMods = ref<SearchResult[]>([])
const installedModpacksFilter = ref('')
const playing = ref(false)
const launching = ref(false)
const repairing = ref(false)
const offline = ref<boolean>(!navigator.onLine)

const accountName = computed(() => accountsCard?.value?.accountName ?? null)
const recentInstances = computed(() =>
	instances.value
		.filter((instance) => instance.last_played)
		.slice()
		.sort((a, b) => dayjs(b.last_played).diff(dayjs(a.last_played))),
)
const edenWorldInstance = computed(() =>
	instances.value.find((instance) => instance.name.toLocaleLowerCase().includes('edenworld')),
)
const instanceReady = computed(() => edenWorldInstance.value?.install_stage === 'installed')
const instanceInstalling = computed(
	() => edenWorldInstance.value?.install_stage.includes('installing') ?? false,
)
const hasFeaturedProjects = computed(
	() => (featuredModpacks.value?.length ?? 0) + (featuredMods.value?.length ?? 0) > 0,
)
const gameVersion = computed(() => edenWorldInstance.value?.game_version ?? EDENWORLD_GAME_VERSION)
const loaderLabel = computed(() => {
	const loader = edenWorldInstance.value?.loader
	if (!loader) return null
	return loader.charAt(0).toUpperCase() + loader.slice(1)
})

type PrimaryState =
	| 'install'
	| 'downloading'
	| 'installing'
	| 'repair'
	| 'play'
	| 'launching'
	| 'running'
const primaryState = computed<PrimaryState>(() => {
	if (playing.value) return 'running'
	if (launching.value) return 'launching'
	if (edenInstall.stage.value === 'downloading') return 'downloading'
	if (edenInstall.stage.value === 'installing' || instanceInstalling.value || repairing.value)
		return 'installing'
	if (!edenWorldInstance.value) return 'install'
	if (!instanceReady.value) return 'repair'
	return 'play'
})
const primaryLabel = computed(() => {
	switch (primaryState.value) {
		case 'install':
			return 'Установить EdenWorld'
		case 'downloading':
			return edenInstall.percent.value === null
				? 'Загрузка…'
				: `Загрузка · ${edenInstall.percent.value}%`
		case 'installing':
			return 'Установка…'
		case 'repair':
			return 'Завершить установку'
		case 'launching':
			return 'Запуск…'
		case 'running':
			return 'Игра запущена'
		default:
			return 'Играть в EdenWorld'
	}
})
const primaryIcon = computed(() => {
	if (primaryState.value === 'install' || primaryState.value === 'repair') return 'download'
	if (primaryState.value === 'running') return 'check'
	if (primaryState.value === 'downloading' || primaryState.value === 'installing') return 'refresh'
	return 'play'
})
const primaryDisabled = computed(() => {
	if (['downloading', 'installing', 'launching', 'running'].includes(primaryState.value))
		return true
	// Installing needs the network; launching an installed profile does not.
	return (primaryState.value === 'install' || primaryState.value === 'repair') && offline.value
})
const statusLine = computed<{ text: string; tone: 'success' | 'error' | 'pending' | 'muted' }>(
	() => {
		if (edenInstall.stage.value === 'error')
			return {
				text: edenInstall.errorMessage.value ?? 'Не удалось установить сборку',
				tone: 'error',
			}
		if (primaryState.value === 'running') return { text: 'Minecraft открыт', tone: 'success' }
		if (primaryState.value === 'launching') return { text: 'Готовим запуск', tone: 'pending' }
		if (primaryState.value === 'downloading') {
			const { downloaded, total } = edenInstall.progress.value
			return {
				text: total
					? `${formatBytes(downloaded)} из ${formatBytes(total)}`
					: `Загружено ${formatBytes(downloaded)}`,
				tone: 'pending',
			}
		}
		if (primaryState.value === 'installing') return { text: 'Устанавливаем файлы', tone: 'pending' }
		if (primaryState.value === 'install') {
			return offline.value
				? { text: 'Нет подключения к сети', tone: 'error' }
				: { text: 'Сборка ещё не установлена', tone: 'muted' }
		}
		if (primaryState.value === 'repair') return { text: 'Установка не завершена', tone: 'error' }
		return { text: 'Готова к запуску', tone: 'success' }
	},
)
const showProgress = computed(
	() => primaryState.value === 'downloading' || primaryState.value === 'installing',
)
const greeting = computed(() =>
	accountName.value ? `Рады видеть тебя, ${accountName.value}` : 'Рады видеть тебя в EdenWorld',
)

const handleOffline = () => (offline.value = true)
const handleOnline = () => (offline.value = false)
window.addEventListener('offline', handleOffline)
window.addEventListener('online', handleOnline)

async function openProjectLink(url: string) {
	await openUrl(url).catch(handleError)
}

async function fetchInstances() {
	instances.value = (await list().catch(handleError)) ?? []

	const filters = []
	for (const instance of instances.value) {
		if (instance.link?.project_id) {
			filters.push(`NOT"project_id"="${instance.link.project_id}"`)
		}
	}
	installedModpacksFilter.value = filters.join(' AND ')
}

async function refreshPlaying() {
	if (!edenWorldInstance.value) {
		playing.value = false
		return
	}
	const processes = await get_by_instance_id(edenWorldInstance.value.id).catch(() => [])
	playing.value = Array.isArray(processes) && processes.length > 0
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
	await Promise.all([fetchFeaturedModpacks(), fetchFeaturedMods()]).catch((error) =>
		console.warn('Не удалось загрузить рекомендации каталога.', error),
	)
}

async function openInstance() {
	if (!edenWorldInstance.value) return
	await router.push(`/instance/${encodeURIComponent(edenWorldInstance.value.id)}/`)
}

async function primaryAction() {
	if (primaryDisabled.value) return
	if (primaryState.value === 'install') return installEdenWorld()
	if (primaryState.value === 'repair') return repairEdenWorld()
	if (primaryState.value === 'play') return playEdenWorld()
}

async function installEdenWorld() {
	try {
		const job = await edenInstall.install()
		await fetchInstances()
		const instanceId = job.instance_id ?? job.target.instance_id
		if (instanceId) await router.push(`/instance/${encodeURIComponent(instanceId)}/`)
	} catch (error) {
		handleError(error as Error)
	}
}

async function repairEdenWorld() {
	if (!edenWorldInstance.value) return
	repairing.value = true
	try {
		await install_existing_instance(edenWorldInstance.value.id, false)
		await fetchInstances()
	} catch (error) {
		handleError(error as Error)
	} finally {
		repairing.value = false
	}
}

async function playEdenWorld() {
	const instance = edenWorldInstance.value
	if (!instance) return
	launching.value = true
	try {
		await run(instance.id)
		await refreshPlaying()
	} catch (error) {
		handleSevereError(error, { instanceId: instance.id })
	} finally {
		launching.value = false
	}
}

async function stopEdenWorld() {
	if (!edenWorldInstance.value) return
	await kill(edenWorldInstance.value.id).catch(handleError)
	playing.value = false
}

async function openFolder() {
	if (!edenWorldInstance.value) return
	await showInstanceInFolder(edenWorldInstance.value.id).catch(handleError)
}

await fetchInstances()
await refreshPlaying()
void refreshFeaturedProjects()

const unlistenInstance = await instance_listener(async (event: { event: string }) => {
	await fetchInstances()
	if (event.event === 'added' || event.event === 'created' || event.event === 'removed') {
		await refreshFeaturedProjects()
	}
})
const unlistenProcess = await process_listener((event: { instance_id: string; event: string }) => {
	if (event.instance_id !== edenWorldInstance.value?.id) return
	if (event.event === 'launched') playing.value = true
	if (event.event === 'finished') playing.value = false
})

onUnmounted(() => {
	unlistenInstance()
	unlistenProcess()
	window.removeEventListener('offline', handleOffline)
	window.removeEventListener('online', handleOnline)
})
</script>

<template>
	<div class="eden-page eden-home">
		<header class="eden-page-header">
			<div>
				<h1>Главная</h1>
				<p>{{ greeting }}</p>
			</div>
		</header>

		<section class="eden-hero" aria-labelledby="eden-hero-title">
			<div class="eden-hero__art" aria-hidden="true"></div>
			<div class="eden-hero__scrim" aria-hidden="true"></div>
			<div class="eden-hero__content">
				<p class="eden-eyebrow eden-hero__eyebrow">Твой мир начинается здесь</p>
				<h2 id="eden-hero-title" class="eden-hero__title">EdenWorld</h2>
				<p class="eden-hero__lead">
					Настоящая ваниль. Свои люди.<br />
					Всё готово для нового приключения.
				</p>
				<div class="eden-hero__chips">
					<span class="eden-hero__chip">{{ gameVersion }}</span>
					<span class="eden-hero__chip">Официальная сборка</span>
				</div>
				<div class="eden-hero__actions">
					<button
						type="button"
						class="eden-btn eden-btn--primary eden-hero__play"
						:class="{ 'eden-hero__play--running': primaryState === 'running' }"
						:disabled="primaryDisabled"
						:aria-busy="showProgress || primaryState === 'launching'"
						@click="primaryAction"
					>
						<EdenIcon
							:name="primaryIcon"
							:size="18"
							:class="{
								'eden-spin': primaryState === 'installing' || primaryState === 'downloading',
							}"
						/>
						{{ primaryLabel }}
					</button>
					<Dropdown placement="bottom-start" :triggers="['click']" :hide-triggers="['click']">
						<button
							type="button"
							class="eden-btn eden-btn--icon eden-hero__more"
							aria-label="Другие действия со сборкой EdenWorld"
						>
							<EdenIcon name="more" />
						</button>
						<template #popper="{ hide }">
							<div class="eden-menu" role="menu">
								<button
									v-if="edenWorldInstance"
									type="button"
									role="menuitem"
									@click="(hide(), openInstance())"
								>
									<EdenIcon name="library" :size="18" /> Открыть сборку
								</button>
								<button
									v-if="edenWorldInstance"
									type="button"
									role="menuitem"
									@click="(hide(), openFolder())"
								>
									<EdenIcon name="folder" :size="18" /> Папка сборки
								</button>
								<button
									v-if="playing"
									type="button"
									role="menuitem"
									class="eden-menu__danger"
									@click="(hide(), stopEdenWorld())"
								>
									<EdenIcon name="close" :size="18" /> Остановить игру
								</button>
								<button
									type="button"
									role="menuitem"
									@click="(hide(), openProjectLink(EDENWORLD_PROJECT_URL))"
								>
									<EdenIcon name="globe" :size="18" /> Сайт проекта
								</button>
								<button
									type="button"
									role="menuitem"
									@click="(hide(), openProjectLink(EDENWORLD_VOTE_URL))"
								>
									<EdenIcon name="heart" :size="18" /> Проголосовать за сервер
								</button>
							</div>
						</template>
					</Dropdown>
					<span
						class="eden-status eden-hero__status"
						:class="{
							'eden-status--success': statusLine.tone === 'success',
							'eden-status--error': statusLine.tone === 'error',
							'eden-status--pending': statusLine.tone === 'pending',
						}"
						role="status"
					>
						<EdenIcon v-if="statusLine.tone === 'error'" name="warning" :size="16" />
						<span v-else class="eden-status-dot"></span>
						{{ statusLine.text }}
					</span>
				</div>
				<div v-if="showProgress" class="eden-hero__progress">
					<div
						class="eden-progress"
						:class="{
							'eden-progress--indeterminate':
								edenInstall.percent.value === null || primaryState === 'installing',
						}"
						role="progressbar"
						:aria-valuenow="
							primaryState === 'downloading' ? (edenInstall.percent.value ?? undefined) : undefined
						"
						aria-valuemin="0"
						aria-valuemax="100"
						aria-label="Установка EdenWorld"
					>
						<div
							class="eden-progress__bar"
							:style="
								primaryState === 'downloading' && edenInstall.percent.value !== null
									? { width: `${edenInstall.percent.value}%` }
									: undefined
							"
						></div>
					</div>
					<RouterLink to="/downloads" class="eden-btn eden-btn--link">Подробнее</RouterLink>
				</div>
			</div>
		</section>

		<section class="eden-home__cards" aria-label="Сводка EdenWorld">
			<button
				type="button"
				class="eden-card eden-card--interactive eden-info-card"
				@click="showPlayers"
			>
				<span class="eden-info-card__head">
					<span class="eden-icon-tile"><EdenIcon name="server" /></span>
					<span class="eden-info-card__copy">
						<small>Сервер EdenWorld</small>
						<strong>{{ server.playersLabel.value ?? server.stateLabel.value }}</strong>
					</span>
					<span
						class="eden-status"
						:class="{
							'eden-status--success': server.online.value,
							'eden-status--error': server.failed.value,
							'eden-status--pending': !server.online.value && !server.failed.value,
						}"
						:aria-label="server.stateLabel.value"
					>
						<span class="eden-status-dot"></span>
					</span>
				</span>
				<span class="eden-info-card__meta">
					<template v-if="server.online.value">
						<template v-if="server.ping.value !== null">{{ server.ping.value }} мс · </template>
						{{ server.address }}
					</template>
					<template v-else-if="server.failed.value">Нет ответа · {{ server.address }}</template>
					<template v-else>Подключаемся к {{ server.address }}</template>
				</span>
			</button>

			<component
				:is="edenWorldInstance ? 'button' : 'article'"
				:type="edenWorldInstance ? 'button' : undefined"
				class="eden-card eden-info-card"
				:class="{ 'eden-card--interactive': edenWorldInstance }"
				@click="openInstance"
			>
				<span class="eden-info-card__head">
					<span class="eden-icon-tile"><EdenIcon name="library" /></span>
					<span class="eden-info-card__copy">
						<small>Твоя сборка</small>
						<strong>{{ edenWorldInstance?.name ?? 'Сборка не установлена' }}</strong>
					</span>
				</span>
				<span class="eden-info-card__meta">
					<template v-if="edenWorldInstance">
						{{ edenWorldInstance.game_version
						}}<template v-if="loaderLabel"> · {{ loaderLabel }}</template> ·
						{{ instanceReady ? 'Готова к запуску' : 'Требует установки' }}
					</template>
					<template v-else>Официальный профиль появится после установки</template>
				</span>
			</component>

			<article class="eden-card eden-info-card">
				<span class="eden-info-card__head">
					<span class="eden-icon-tile"><EdenIcon name="users" /></span>
					<span class="eden-info-card__copy">
						<small>Сообщество</small>
						<strong>Встретимся в игре</strong>
					</span>
				</span>
				<span class="eden-info-card__links">
					<button type="button" @click="openProjectLink(EDENWORLD_TELEGRAM_URL)">Telegram</button>
					<span aria-hidden="true">·</span>
					<button type="button" @click="openProjectLink(EDENWORLD_DISCORD_URL)">Discord</button>
					<span aria-hidden="true">·</span>
					<button type="button" @click="openProjectLink(EDENWORLD_VOTE_URL)">Голосовать</button>
				</span>
			</article>
		</section>

		<section class="eden-home__section" aria-labelledby="eden-life-title">
			<div class="eden-home__section-head">
				<h2 id="eden-life-title" class="eden-section-title">Жизнь EdenWorld</h2>
				<button
					type="button"
					class="eden-btn eden-btn--ghost"
					@click="openProjectLink(EDENWORLD_PROJECT_URL)"
				>
					Сайт проекта <EdenIcon name="external" :size="16" />
				</button>
			</div>
			<div class="eden-home__life">
				<button
					type="button"
					class="eden-card eden-card--interactive eden-life-card eden-life-card--media"
					@click="openProjectLink(EDENWORLD_PROJECT_URL)"
				>
					<span class="eden-life-card__media" aria-hidden="true"></span>
					<span class="eden-life-card__body">
						<span class="eden-eyebrow">Новости проекта</span>
						<strong>Новый день. Новые истории.</strong>
						<span>Новости, правила и события сервера публикуются на сайте EdenWorld.</span>
						<span class="eden-life-card__cta"
							>Открыть сайт <EdenIcon name="arrow" :size="18"
						/></span>
					</span>
				</button>
				<button
					type="button"
					class="eden-card eden-card--interactive eden-life-card"
					@click="openProjectLink(EDENWORLD_VOTE_URL)"
				>
					<span class="eden-life-card__body">
						<span class="eden-life-card__title-row">
							<span class="eden-icon-tile"><EdenIcon name="heart" /></span>
							<span>
								<span class="eden-eyebrow">Поддержать проект</span>
								<strong>Твой голос — часть мира</strong>
							</span>
						</span>
						<span>Помоги новым игрокам найти EdenWorld. Голосование займёт всего минуту.</span>
						<span class="eden-life-card__cta eden-life-card__cta--end">
							<EdenIcon name="arrow" :size="18" />
						</span>
					</span>
				</button>
			</div>
		</section>

		<section v-if="recentInstances.length > 0" class="eden-home__section">
			<div class="eden-home__section-head">
				<h2 class="eden-section-title">Продолжить</h2>
			</div>
			<RecentWorldsList :recent-instances="recentInstances" />
		</section>

		<section v-if="hasFeaturedProjects" class="eden-home__section">
			<div class="eden-home__section-head">
				<h2 class="eden-section-title">Больше контента</h2>
				<RouterLink to="/browse/modpack" class="eden-btn eden-btn--ghost">
					Каталог <EdenIcon name="chevron" :size="16" />
				</RouterLink>
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
	gap: 24px;
}

.eden-hero__play {
	min-width: 196px;
}

.eden-hero__play--running:disabled {
	color: var(--eden-success);
	background: var(--eden-surface-raised);
	border-color: var(--eden-border);
}

.eden-hero__more {
	border-color: var(--eden-border);
	color: var(--eden-text);
	background: var(--eden-surface-raised);

	&:hover {
		border-color: var(--eden-border-strong);
	}
}

.eden-hero__status {
	margin-left: 6px;
	color: var(--hero-text);

	&.eden-status--error {
		color: var(--hero-text);

		:deep(.eden-icon) {
			color: var(--eden-error);
		}
	}
}

.eden-hero__progress {
	display: flex;
	max-width: 420px;
	align-items: center;
	gap: 12px;
	margin-top: 16px;
}

.eden-spin {
	animation: eden-spin 1.2s linear infinite;
}

@keyframes eden-spin {
	to {
		transform: rotate(360deg);
	}
}

// ---------- Menu ----------

.eden-menu {
	display: flex;
	min-width: 220px;
	flex-direction: column;
	padding: 6px;

	button {
		display: flex;
		min-height: 38px;
		align-items: center;
		gap: 10px;
		padding: 0 12px;
		border: 0;
		border-radius: 8px;
		color: var(--eden-text);
		background: transparent;
		font: inherit;
		font-size: 13px;
		text-align: left;
		cursor: pointer;

		&:hover,
		&:focus-visible {
			outline: none;
			background: var(--eden-surface-raised);
		}
	}
}

.eden-menu__danger {
	color: var(--eden-error) !important;
}

// ---------- Info cards ----------

.eden-home__cards {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 22px;
}

.eden-info-card {
	display: flex;
	min-height: 116px;
	flex-direction: column;
	justify-content: space-between;
	gap: 18px;
	padding: 18px 18px 20px;
	font: inherit;
	text-align: left;
}

button.eden-info-card {
	cursor: pointer;
}

.eden-info-card__head {
	display: flex;
	align-items: flex-start;
	gap: 12px;

	.eden-status {
		margin: 8px 4px 0 auto;
	}
}

.eden-info-card__copy {
	display: flex;
	min-width: 0;
	flex-direction: column;
	gap: 6px;

	small {
		color: var(--eden-text-secondary);
		font-size: 12px;
	}

	strong {
		overflow: hidden;
		color: var(--eden-text);
		font-size: 17px;
		font-weight: 650;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
}

.eden-info-card__meta,
.eden-info-card__links {
	color: var(--eden-text-secondary);
	font-size: 12px;
}

.eden-info-card__links {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;

	button {
		padding: 2px 0;
		border: 0;
		color: var(--eden-text-secondary);
		background: transparent;
		font: inherit;
		cursor: pointer;

		&:hover {
			color: var(--eden-accent-text);
			text-decoration: underline;
			text-underline-offset: 3px;
		}

		&:focus-visible {
			border-radius: 4px;
			outline: 2px solid var(--eden-focus);
			outline-offset: 2px;
		}
	}
}

// ---------- Sections ----------

.eden-home__section {
	display: flex;
	flex-direction: column;
	gap: 14px;
	margin-top: 6px;
}

.eden-home__section-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
}

.eden-home__life {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 16px;
}

.eden-life-card {
	display: flex;
	min-height: 162px;
	overflow: hidden;
	padding: 0;
	font: inherit;
	text-align: left;
}

.eden-life-card__media {
	width: 176px;
	flex: 0 0 auto;
	background: var(--eden-hero-image) 60% 50% / cover no-repeat;
}

.eden-life-card__body {
	display: flex;
	min-width: 0;
	flex: 1;
	flex-direction: column;
	gap: 10px;
	padding: 22px 22px 20px;
	color: var(--eden-text-secondary);
	font-size: 13px;
	line-height: 1.6;

	strong {
		color: var(--eden-text);
		font-size: 20px;
		font-weight: 650;
		line-height: 1.3;
	}
}

.eden-life-card__title-row {
	display: flex;
	align-items: center;
	gap: 16px;

	> span:last-child {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
}

.eden-life-card__cta {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-top: auto;
	color: var(--eden-accent-text);
	font-size: 12px;
	font-weight: 650;
}

.eden-life-card__cta--end {
	justify-content: flex-end;
}

// ---------- Responsive ----------

@media (max-width: 1279px) {
	.eden-home__cards {
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 16px;
	}

	.eden-home__life {
		grid-template-columns: 1fr;
	}
}

@media (max-width: 1099px) {
	.eden-hero,
	.eden-hero__content {
		min-height: 290px;
	}

	.eden-hero__content {
		padding: 26px 24px;
	}

	.eden-hero__lead {
		font-size: 14px;
	}

	.eden-life-card__media {
		width: 132px;
	}
}

@media (prefers-reduced-motion: reduce) {
	.eden-spin {
		animation: none;
	}
}
</style>
