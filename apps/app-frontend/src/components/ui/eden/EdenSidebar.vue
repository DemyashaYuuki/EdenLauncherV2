<script setup lang="ts">
import { openUrl } from '@tauri-apps/plugin-opener'
import { computed } from 'vue'
import { type RouteLocationNormalizedLoaded, useRoute, useRouter } from 'vue-router'

import EdenIcon from '@/components/ui/eden/EdenIcon.vue'
import EdenMark from '@/components/ui/eden/EdenMark.vue'
import { useEdenDownloads } from '@/composables/eden/downloads'
import { useEdenServerStatus } from '@/composables/eden/server-status'
import { EDENWORLD_PROJECT_URL } from '@/helpers/edenworld'

const props = defineProps<{ compact: boolean; offline: boolean }>()
const emit = defineEmits<{
	settings: []
	create: []
	players: []
}>()

const route = useRoute()
const router = useRouter()
const server = useEdenServerStatus()
const downloads = useEdenDownloads()

type NavItem = {
	id: string
	label: string
	icon: 'home' | 'library' | 'compass' | 'shirt' | 'studio' | 'users'
	to: string
	active: (current: RouteLocationNormalizedLoaded) => boolean
}

const navItems: NavItem[] = [
	{ id: 'home', label: 'Главная', icon: 'home', to: '/', active: (r) => r.path === '/' },
	{
		id: 'library',
		label: 'Библиотека',
		icon: 'library',
		to: '/library',
		active: (r) =>
			r.path.startsWith('/library') ||
			r.path.startsWith('/instance') ||
			((r.path.startsWith('/browse') || r.path.startsWith('/project')) && !!r.query.i),
	},
	{
		id: 'catalog',
		label: 'Каталог',
		icon: 'compass',
		to: '/browse/modpack',
		active: (r) => (r.path.startsWith('/browse') || r.path.startsWith('/project')) && !r.query.i,
	},
	{
		id: 'skins',
		label: 'Скины',
		icon: 'shirt',
		to: '/skins',
		active: (r) => r.path === '/skins' || r.path.startsWith('/skins/'),
	},
	{
		id: 'friends',
		label: 'Друзья',
		icon: 'users',
		to: '/friends',
		active: (r) => r.path.startsWith('/friends') || r.path.startsWith('/user'),
	},
]

const downloadsActive = computed(() => route.path.startsWith('/downloads'))
const serverTone = computed(() => {
	if (server.online.value) return 'eden-status--success'
	if (server.failed.value) return 'eden-status--error'
	return 'eden-status--pending'
})
const serverTooltip = computed(() =>
	[server.stateLabel.value, server.playersLabel.value].filter(Boolean).join(' · '),
)

function tooltip(label: string) {
	return props.compact ? { content: label, placement: 'right' } : undefined
}

function navigate(item: NavItem) {
	if (!item.active(route) || route.path !== item.to) void router.push(item.to)
}
</script>

<template>
	<nav
		class="eden-sidebar"
		:class="{ 'eden-sidebar--compact': compact }"
		aria-label="Разделы лаунчера"
	>
		<RouterLink to="/" class="eden-sidebar__brand" aria-label="EdenWorld Launcher — главная">
			<EdenMark :size="compact ? 34 : 40" />
			<span v-if="!compact" class="eden-sidebar__brand-copy">
				<strong>EdenWorld</strong>
				<small>Launcher</small>
			</span>
		</RouterLink>

		<ul class="eden-sidebar__group">
			<li v-for="item in navItems" :key="item.id">
				<a
					v-tooltip="tooltip(item.label)"
					:href="item.to"
					class="eden-nav-item"
					:class="{ active: item.active(route) }"
					:aria-current="item.active(route) ? 'page' : undefined"
					:aria-label="compact ? item.label : undefined"
					@click.prevent="navigate(item)"
				>
					<EdenIcon :name="item.icon" />
					<span v-if="!compact">{{ item.label }}</span>
				</a>
			</li>
		</ul>

		<div class="eden-sidebar__divider" role="presentation"></div>
		<p v-if="!compact" class="eden-sidebar__caption">Твой Eden</p>
		<ul class="eden-sidebar__group">
			<li>
				<button
					v-tooltip="compact ? { content: serverTooltip, placement: 'right' } : serverTooltip"
					type="button"
					class="eden-nav-item eden-nav-item--server"
					:aria-label="`${serverTooltip}. Показать игроков`"
					@click="emit('players')"
				>
					<EdenIcon name="server" />
					<span v-if="!compact">{{
						server.online.value ? 'Сервер онлайн' : server.stateLabel.value
					}}</span>
					<span class="eden-status" :class="serverTone">
						<span class="eden-status-dot"></span>
					</span>
				</button>
			</li>
			<li>
				<button
					v-tooltip="tooltip('Сайт проекта')"
					type="button"
					class="eden-nav-item"
					:aria-label="compact ? 'Сайт проекта (откроется в браузере)' : undefined"
					@click="openUrl(EDENWORLD_PROJECT_URL)"
				>
					<EdenIcon name="globe" />
					<span v-if="!compact">Сайт проекта</span>
					<EdenIcon v-if="!compact" name="external" :size="16" class="eden-nav-item__trail" />
				</button>
			</li>
			<li>
				<button
					v-tooltip="tooltip(offline ? 'Создание сборки недоступно без сети' : 'Новая сборка')"
					type="button"
					class="eden-nav-item"
					:disabled="offline"
					:aria-label="compact ? 'Новая сборка' : undefined"
					@click="emit('create')"
				>
					<EdenIcon name="plus" />
					<span v-if="!compact">Новая сборка</span>
				</button>
			</li>
		</ul>

		<div class="eden-sidebar__spacer"></div>

		<ul class="eden-sidebar__group">
			<li>
				<RouterLink
					v-tooltip="tooltip('Загрузки')"
					to="/downloads"
					class="eden-nav-item"
					:class="{ active: downloadsActive }"
					:aria-current="downloadsActive ? 'page' : undefined"
					:aria-label="
						downloads.activeCount.value
							? `Загрузки, активных: ${downloads.activeCount.value}`
							: 'Загрузки'
					"
				>
					<EdenIcon name="download" />
					<span v-if="!compact">Загрузки</span>
					<span v-if="downloads.activeCount.value" class="eden-nav-item__badge">
						{{ downloads.activeCount.value }}
					</span>
				</RouterLink>
			</li>
			<li>
				<button
					v-tooltip="tooltip('Настройки')"
					type="button"
					class="eden-nav-item"
					:aria-label="compact ? 'Настройки' : undefined"
					@click="emit('settings')"
				>
					<EdenIcon name="settings" />
					<span v-if="!compact">Настройки</span>
				</button>
			</li>
		</ul>

		<div class="eden-sidebar__account">
			<slot name="account" />
		</div>
	</nav>
</template>

<style scoped lang="scss">
.eden-sidebar {
	display: flex;
	width: var(--eden-sidebar-width);
	height: 100%;
	min-height: 0;
	box-sizing: border-box;
	flex-direction: column;
	overflow-x: hidden;
	overflow-y: auto;
	padding: 24px 12px 20px;
	border-right: 1px solid var(--eden-border);
	color: var(--eden-text);
	background: var(--eden-sidebar);
	scrollbar-width: none;

	&::-webkit-scrollbar {
		display: none;
	}
}

.eden-sidebar--compact {
	align-items: center;
	padding: 20px 12px;
}

.eden-sidebar__brand {
	display: flex;
	align-items: center;
	gap: 14px;
	margin: 0 0 30px 10px;
	color: var(--eden-text);
	text-decoration: none;

	.eden-sidebar--compact & {
		margin: 0 0 24px;
	}

	&:focus-visible {
		border-radius: 8px;
		outline: 2px solid var(--eden-focus);
		outline-offset: 4px;
	}
}

.eden-sidebar__brand-copy {
	display: flex;
	flex-direction: column;
	gap: 2px;

	strong {
		font-size: 19px;
		font-weight: 650;
		line-height: 1.1;
	}

	small {
		color: var(--eden-text-secondary);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.22em;
		text-transform: uppercase;
	}
}

.eden-sidebar__group {
	display: flex;
	flex-direction: column;
	gap: 8px;
	margin: 0;
	padding: 0;
	list-style: none;

	.eden-sidebar--compact & {
		align-items: center;
	}
}

.eden-nav-item {
	position: relative;
	display: flex;
	width: 100%;
	min-height: 44px;
	box-sizing: border-box;
	align-items: center;
	gap: 12px;
	padding: 0 10px 0 14px;
	border: 0;
	border-radius: var(--eden-radius-control);
	color: var(--eden-text-secondary);
	background: transparent;
	font: inherit;
	font-size: 14px;
	font-weight: 500;
	text-align: left;
	text-decoration: none;
	cursor: pointer;
	transition:
		color var(--eden-motion-hover) ease,
		background-color var(--eden-motion-hover) ease;

	> span:not(.eden-status):not(.eden-nav-item__badge) {
		min-width: 0;
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	&:hover:not(:disabled) {
		color: var(--eden-text);
		background: var(--eden-surface);
	}

	&:active:not(:disabled) {
		transition-duration: var(--eden-motion-press);
		background: var(--eden-surface-raised);
	}

	&:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	&.active {
		color: var(--eden-text);
		background: var(--eden-surface-raised);
		font-weight: 650;

		&::before {
			content: '';
			position: absolute;
			top: 10px;
			bottom: 10px;
			left: -12px;
			width: 3px;
			border-radius: 0 3px 3px 0;
			background: var(--eden-accent);
		}

		:deep(.eden-icon) {
			color: var(--eden-accent-text);
		}
	}

	.eden-sidebar--compact & {
		width: 48px;
		height: 48px;
		justify-content: center;
		padding: 0;

		&.active::before {
			left: -12px;
		}
	}
}

.eden-nav-item--server .eden-status {
	margin-left: auto;

	.eden-sidebar--compact & {
		position: absolute;
		top: 9px;
		right: 9px;
	}
}

.eden-nav-item__trail {
	color: var(--eden-text-secondary);
}

.eden-nav-item__badge {
	display: grid;
	min-width: 24px;
	height: 24px;
	box-sizing: border-box;
	place-items: center;
	padding: 0 6px;
	border-radius: 6px;
	color: var(--eden-text);
	background: var(--eden-surface-raised);
	font-size: 12px;
	font-weight: 650;

	.eden-sidebar--compact & {
		position: absolute;
		top: 2px;
		right: 0;
		min-width: 18px;
		height: 18px;
		color: var(--eden-on-accent);
		background: var(--eden-accent);
		font-size: 10px;
	}
}

.eden-sidebar__divider {
	width: calc(100% - 20px);
	height: 1px;
	margin: 22px auto 18px;
	background: var(--eden-border);
}

.eden-sidebar__caption {
	margin: 0 0 10px 16px;
	color: var(--eden-text-secondary);
	font-size: 11px;
	font-weight: 700;
	letter-spacing: 0.16em;
	text-transform: uppercase;
}

.eden-sidebar__spacer {
	min-height: 24px;
	flex: 1;
}

.eden-sidebar__account {
	width: 100%;
	margin-top: 22px;

	.eden-sidebar--compact & {
		display: flex;
		justify-content: center;
	}
}

// Short windows: keep every section reachable without scrolling where possible.
@media (max-height: 820px) {
	.eden-sidebar {
		padding-top: 16px;
		padding-bottom: 14px;
	}

	.eden-sidebar__brand {
		margin-bottom: 18px;
	}

	.eden-sidebar__group {
		gap: 4px;
	}

	.eden-nav-item {
		min-height: 38px;
	}

	.eden-sidebar__divider {
		margin: 12px auto 10px;
	}

	.eden-sidebar__account {
		margin-top: 12px;
	}
}

@media (max-height: 680px) {
	.eden-sidebar--compact .eden-nav-item {
		height: 40px;
	}

	.eden-sidebar__caption {
		display: none;
	}
}
</style>
