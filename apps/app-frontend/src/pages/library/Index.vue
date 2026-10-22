<script setup lang="ts">
import { LibraryIcon } from '@modrinth/assets'
import { injectNotificationManager, useRelativeTime } from '@modrinth/ui'
import dayjs from 'dayjs'
import { computed, inject, onUnmounted, provide, ref, shallowRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import EdenIcon from '@/components/ui/eden/EdenIcon.vue'
import { useEdenWorldInstall } from '@/composables/eden/edenworld-install'
import { instance_listener } from '@/helpers/events.js'
import { list } from '@/helpers/instance'
import type { GameInstance } from '@/helpers/types'
import { useRootBreadcrumb } from '@/providers/breadcrumbs'

const { handleError } = injectNotificationManager()
const showCreationModal = inject<(() => void) | undefined>('showCreationModal', undefined)
const showImportModal = inject<(() => void) | undefined>('showImportModal', undefined)
const route = useRoute()
const router = useRouter()
const formatRelativeTime = useRelativeTime()
const edenInstall = useEdenWorldInstall()

useRootBreadcrumb({
	slot: 'root',
	id: 'library',
	label: 'Библиотека',
	to: '/library',
	visual: { type: 'icon', component: LibraryIcon },
})

const instances = shallowRef<GameInstance[]>((await list().catch(handleError)) ?? [])
const search = ref('')
// GridDisplay in the child routes reads this instead of drawing its own search field.
provide('librarySearch', search)

const offline = ref(!navigator.onLine)
const handleOffline = () => (offline.value = true)
const handleOnline = () => (offline.value = false)
window.addEventListener('offline', handleOffline)
window.addEventListener('online', handleOnline)

const tabs = [
	{ label: 'Все сборки', href: '/library' },
	{ label: 'Сборки Modrinth', href: '/library/modpacks' },
	{ label: 'Серверы', href: '/library/servers' },
	{ label: 'Свои', href: '/library/custom' },
]

const lastPlayed = computed(
	() =>
		instances.value
			.filter((instance) => instance.last_played)
			.slice()
			.sort((a, b) => dayjs(b.last_played).diff(dayjs(a.last_played)))[0] ?? null,
)

function formatPlayTime(seconds: number) {
	if (!seconds) return null
	const hours = Math.floor(seconds / 3600)
	const minutes = Math.floor((seconds % 3600) / 60)
	if (hours === 0) return `${Math.max(1, minutes)} мин в игре`
	return `${hours} ч ${String(minutes).padStart(2, '0')} мин в игре`
}

const lastPlayedMeta = computed(() => {
	const instance = lastPlayed.value
	if (!instance?.last_played) return ''
	const played = formatPlayTime(
		(instance.submitted_time_played ?? 0) + (instance.recent_time_played ?? 0),
	)
	const when = `Последний запуск ${formatRelativeTime(dayjs(instance.last_played).toISOString())}`
	return played ? `${when} · ${played}` : when
})

async function installEdenWorld() {
	try {
		await edenInstall.install()
	} catch (error) {
		handleError(error as Error)
	}
}

const unlistenInstance = await instance_listener(async () => {
	instances.value = (await list().catch(handleError)) ?? []
})
onUnmounted(() => {
	unlistenInstance()
	window.removeEventListener('offline', handleOffline)
	window.removeEventListener('online', handleOnline)
})
</script>

<template>
	<div class="eden-page eden-library">
		<header class="eden-page-header">
			<div>
				<h1>Библиотека</h1>
				<p>Твои сборки и игровые профили</p>
			</div>
		</header>

		<div class="eden-library__toolbar">
			<label class="eden-input eden-library__search">
				<EdenIcon name="search" :size="18" />
				<input
					v-model="search"
					type="search"
					placeholder="Поиск по сборкам"
					aria-label="Поиск по сборкам"
					@keyup.esc="search = ''"
				/>
			</label>
			<button
				type="button"
				class="eden-btn eden-btn--secondary"
				:disabled="!showImportModal"
				@click="showImportModal?.()"
			>
				<EdenIcon name="download" :size="18" />
				Импортировать
			</button>
			<button
				v-tooltip="offline ? 'Создание сборки недоступно без сети' : undefined"
				type="button"
				class="eden-btn eden-btn--primary"
				:disabled="offline"
				@click="showCreationModal?.()"
			>
				<EdenIcon name="plus" :size="18" />
				Создать
			</button>
		</div>

		<template v-if="instances.length > 0">
			<nav class="eden-tabs" aria-label="Фильтр сборок">
				<RouterLink
					v-for="tab in tabs"
					:key="tab.href"
					:to="tab.href"
					class="eden-tab"
					:class="{ active: route.path === tab.href }"
				>
					{{ tab.label }}
					<span v-if="tab.href === '/library'">{{ instances.length }}</span>
				</RouterLink>
			</nav>

			<RouterView v-if="route.path.startsWith('/library')" :instances="instances" />

			<section v-if="lastPlayed && route.path === '/library'" class="eden-library__continue">
				<p class="eden-eyebrow">Продолжить с последнего места</p>
				<article class="eden-card eden-library__continue-card">
					<span class="eden-icon-tile eden-library__continue-icon"
						><EdenIcon name="clock" :size="22"
					/></span>
					<div class="eden-library__continue-copy">
						<strong>{{ lastPlayed.name }}</strong>
						<span>{{ lastPlayedMeta }}</span>
					</div>
					<button
						type="button"
						class="eden-btn eden-btn--secondary"
						@click="router.push(`/instance/${encodeURIComponent(lastPlayed.id)}`)"
					>
						<EdenIcon name="arrow" :size="18" />
						Открыть сборку
					</button>
				</article>
			</section>
		</template>

		<div v-else class="eden-state eden-library__empty">
			<span class="eden-state__icon"><EdenIcon name="folder" /></span>
			<h3>Библиотека пока пуста</h3>
			<p>
				Создай первую сборку, импортируй её из другого лаунчера или установи официальный профиль
				EdenWorld.
			</p>
			<div class="eden-library__empty-actions">
				<button
					type="button"
					class="eden-btn eden-btn--primary"
					:disabled="offline || edenInstall.active.value"
					@click="installEdenWorld"
				>
					<EdenIcon name="download" :size="18" />
					{{ edenInstall.active.value ? 'Устанавливаем EdenWorld…' : 'Установить EdenWorld' }}
				</button>
				<button
					type="button"
					class="eden-btn eden-btn--secondary"
					:disabled="offline"
					@click="showCreationModal?.()"
				>
					<EdenIcon name="plus" :size="18" />
					Создать сборку
				</button>
				<button type="button" class="eden-btn eden-btn--secondary" @click="showImportModal?.()">
					Импортировать
				</button>
			</div>
		</div>
	</div>
</template>

<style lang="scss" scoped>
.eden-library__toolbar {
	display: flex;
	flex-wrap: wrap;
	gap: 16px;

	.eden-btn {
		min-width: 164px;
	}
}

.eden-library__search {
	min-width: 240px;
	flex: 1;
}

.eden-library__continue {
	display: flex;
	flex-direction: column;
	gap: 16px;
	margin-top: 12px;
}

.eden-library__continue-card {
	display: flex;
	align-items: center;
	gap: 22px;
	padding: 22px;
}

.eden-library__continue-icon {
	width: 56px;
	height: 56px;
	border-radius: 12px;
}

.eden-library__continue-copy {
	display: flex;
	min-width: 0;
	flex: 1;
	flex-direction: column;
	gap: 8px;

	strong {
		overflow: hidden;
		color: var(--eden-text);
		font-size: 19px;
		font-weight: 650;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	span {
		color: var(--eden-text-secondary);
		font-size: 13px;
	}
}

.eden-library__empty-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 12px;
	margin-top: 12px;
}

@media (max-width: 1099px) {
	.eden-library__toolbar .eden-btn {
		min-width: 0;
	}
}
</style>
