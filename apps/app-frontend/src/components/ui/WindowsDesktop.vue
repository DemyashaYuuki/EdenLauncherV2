<script setup lang="ts">
import { convertFileSrc } from '@tauri-apps/api/core'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import EdenIcon from '@/components/ui/eden/EdenIcon.vue'
import EdenMark from '@/components/ui/eden/EdenMark.vue'
import type { GameInstance } from '@/helpers/types'
import { useTheming } from '@/store/state'

type ShortcutKind = 'home' | 'catalog' | 'library' | 'skins' | 'create' | 'settings' | 'instance'
type DesktopShortcut = {
	id: string
	title: string
	kind: ShortcutKind
	path?: string
	iconPath?: string
	details: string
}
type DesktopWindow = {
	id: string
	path: string
	title: string
	iconPath?: string
	x: number
	y: number
	width: number
	height: number
	z: number
	minimized: boolean
	maximized: boolean
}

const props = defineProps<{ instances: GameInstance[]; activePath: string }>()
const emit = defineEmits<{
	navigate: [path: string]
	create: []
	settings: []
}>()

const POSITION_STORAGE_KEY = 'edenlauncher-windows-shortcut-positions'
const SHORTCUT_ORIGIN = 14
const SHORTCUT_COLUMN_STEP = 100
const SHORTCUT_ROW_STEP = 98
const DOUBLE_CLICK_DELAY = 500
const themeStore = useTheming()
const shortcutPositions = ref<Record<string, { x: number; y: number }>>(loadShortcutPositions())
const windows = ref<DesktopWindow[]>([])
const activeWindowId = ref<string | null>(null)
const contextMenu = ref<{ x: number; y: number; shortcut: DesktopShortcut } | null>(null)
const propertiesShortcut = ref<DesktopShortcut | null>(null)
const draggedShortcut = ref<string | null>(null)
let zIndex = 10
let mounted = false
let cleanupPointerListeners: (() => void) | null = null
let lastShortcutClick: { id: string; at: number } | null = null

const shortcuts = computed<DesktopShortcut[]>(() => [
	{
		id: 'home',
		title: 'EdenWorld',
		kind: 'home',
		path: '/',
		details: 'Главный экран EdenLauncher',
	},
	{
		id: 'catalog',
		title: 'Каталог',
		kind: 'catalog',
		path: '/browse/modpack',
		details: 'Сборки и контент Modrinth',
	},
	{
		id: 'library',
		title: 'Библиотека',
		kind: 'library',
		path: '/library',
		details: 'Все установленные сборки',
	},
	{
		id: 'skins',
		title: 'Скины',
		kind: 'skins',
		path: '/skins',
		details: 'Редактор, библиотека скинов и плащи',
	},
	{
		id: 'create',
		title: 'Создать сборку',
		kind: 'create',
		details: 'Мастер новой игровой сборки',
	},
	{
		id: 'settings',
		title: 'Параметры',
		kind: 'settings',
		details: 'Настройки EdenLauncher',
	},
	...props.instances.slice(0, 24).map((instance) => ({
		id: `instance-${instance.id}`,
		title: instance.name,
		kind: 'instance' as const,
		path: `/instance/${encodeURIComponent(instance.id)}`,
		iconPath: instance.icon_path ? instanceIcon(instance.icon_path) : undefined,
		details: `Игровая сборка · ${instance.game_version ?? 'Minecraft'}`,
	})),
])

function loadShortcutPositions() {
	try {
		return JSON.parse(localStorage.getItem(POSITION_STORAGE_KEY) ?? '{}')
	} catch {
		return {}
	}
}

function saveShortcutPositions() {
	localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(shortcutPositions.value))
}

function instanceIcon(path: string) {
	return path.startsWith('http') || path.startsWith('data:') ? path : convertFileSrc(path)
}

function defaultShortcutPosition(index: number) {
	const rows = Math.max(4, Math.floor((window.innerHeight - 150) / 98))
	return {
		x: SHORTCUT_ORIGIN + Math.floor(index / rows) * SHORTCUT_COLUMN_STEP,
		y: SHORTCUT_ORIGIN + (index % rows) * SHORTCUT_ROW_STEP,
	}
}

function clampShortcutPosition(position: { x: number; y: number }) {
	return {
		x: Math.max(0, Math.min(window.innerWidth - 100, position.x)),
		y: Math.max(0, Math.min(window.innerHeight - 170, position.y)),
	}
}

function snapShortcutPosition(position: { x: number; y: number }) {
	return clampShortcutPosition({
		x:
			SHORTCUT_ORIGIN +
			Math.max(0, Math.round((position.x - SHORTCUT_ORIGIN) / SHORTCUT_COLUMN_STEP)) *
				SHORTCUT_COLUMN_STEP,
		y:
			SHORTCUT_ORIGIN +
			Math.max(0, Math.round((position.y - SHORTCUT_ORIGIN) / SHORTCUT_ROW_STEP)) *
				SHORTCUT_ROW_STEP,
	})
}

function snapAllShortcutsToGrid() {
	const positions = { ...shortcutPositions.value }
	shortcuts.value.forEach((shortcut, index) => {
		positions[shortcut.id] = snapShortcutPosition(
			positions[shortcut.id] ?? defaultShortcutPosition(index),
		)
	})
	shortcutPositions.value = positions
	saveShortcutPositions()
}

function shortcutStyle(shortcut: DesktopShortcut, index: number) {
	const position = shortcutPositions.value[shortcut.id] ?? defaultShortcutPosition(index)
	return { left: `${position.x}px`, top: `${position.y}px` }
}

function registerShortcutClick(shortcut: DesktopShortcut) {
	const now = Date.now()
	if (lastShortcutClick?.id === shortcut.id && now - lastShortcutClick.at <= DOUBLE_CLICK_DELAY) {
		lastShortcutClick = null
		openShortcut(shortcut)
		return
	}
	lastShortcutClick = { id: shortcut.id, at: now }
}

function beginShortcutDrag(event: PointerEvent, shortcut: DesktopShortcut, index: number) {
	if (event.button !== 0) return
	contextMenu.value = null
	const origin = shortcutPositions.value[shortcut.id] ?? defaultShortcutPosition(index)
	const startX = event.clientX
	const startY = event.clientY
	let moved = false
	draggedShortcut.value = shortcut.id

	const move = (moveEvent: PointerEvent) => {
		const dx = moveEvent.clientX - startX
		const dy = moveEvent.clientY - startY
		if (!moved && Math.abs(dx) + Math.abs(dy) <= 6) return
		moved = true
		shortcutPositions.value = {
			...shortcutPositions.value,
			[shortcut.id]: clampShortcutPosition({ x: origin.x + dx, y: origin.y + dy }),
		}
	}
	const stop = (commit: boolean) => {
		window.removeEventListener('pointermove', move)
		window.removeEventListener('pointerup', finish)
		window.removeEventListener('pointercancel', cancel)
		cleanupPointerListeners = null
		draggedShortcut.value = null
		if (!commit) return
		if (moved) {
			lastShortcutClick = null
			if (themeStore.windowsShortcutGrid) {
				shortcutPositions.value = {
					...shortcutPositions.value,
					[shortcut.id]: snapShortcutPosition(shortcutPositions.value[shortcut.id] ?? origin),
				}
			}
			saveShortcutPositions()
		} else {
			registerShortcutClick(shortcut)
		}
	}
	const finish = () => stop(true)
	const cancel = () => stop(false)
	window.addEventListener('pointermove', move)
	window.addEventListener('pointerup', finish, { once: true })
	window.addEventListener('pointercancel', cancel, { once: true })
	cleanupPointerListeners = cancel
}

function showContextMenu(event: MouseEvent, shortcut: DesktopShortcut) {
	event.preventDefault()
	lastShortcutClick = null
	contextMenu.value = {
		x: Math.min(event.clientX, window.innerWidth - 230),
		y: Math.min(event.clientY, window.innerHeight - 150),
		shortcut,
	}
}

function routeTitle(path: string) {
	if (path === '/') return 'EdenWorld'
	if (path.startsWith('/browse')) return 'Каталог Modrinth'
	if (path.startsWith('/library')) return 'Библиотека'
	if (path.startsWith('/skins')) return 'Скины'
	if (path.startsWith('/skin-studio')) return 'Скины'
	if (path.startsWith('/friends')) return 'Друзья'
	if (path.startsWith('/downloads')) return 'Загрузки'
	if (path.startsWith('/user/')) return 'Профиль Modrinth'
	if (path.startsWith('/project')) return 'Страница проекта'
	if (path.startsWith('/instance/')) {
		const id = decodeURIComponent(path.split('/')[2] ?? '')
		return props.instances.find((instance) => instance.id === id)?.name ?? 'Игровая сборка'
	}
	return 'EdenLauncher'
}

function routeIcon(path: string) {
	if (path.startsWith('/instance/')) {
		const id = decodeURIComponent(path.split('/')[2] ?? '')
		const instance = props.instances.find((item) => item.id === id)
		return instance?.icon_path ? instanceIcon(instance.icon_path) : undefined
	}
	return undefined
}

function openShortcut(shortcut: DesktopShortcut) {
	if (draggedShortcut.value === shortcut.id) return
	contextMenu.value = null
	if (shortcut.kind === 'create') return emit('create')
	if (shortcut.kind === 'settings') return emit('settings')
	if (shortcut.path) openWindow(shortcut.path, shortcut.title, true)
}

function openWindow(path: string, title = routeTitle(path), navigate = false) {
	let target = windows.value.find((item) => item.path === path)
	if (!target) {
		const offset = windows.value.length % 7
		target = {
			id: `window-${Date.now()}-${windows.value.length}`,
			path,
			title,
			iconPath: routeIcon(path),
			x: 105 + offset * 28,
			y: 38 + offset * 24,
			width: Math.min(1040, Math.max(680, window.innerWidth - 250)),
			height: Math.min(720, Math.max(440, window.innerHeight - 180)),
			z: ++zIndex,
			minimized: false,
			maximized: false,
		}
		windows.value.push(target)
	}
	target.title = title
	target.iconPath = routeIcon(path)
	target.minimized = false
	target.z = ++zIndex
	activeWindowId.value = target.id
	if (navigate) emit('navigate', path)
}

function focusWindow(target: DesktopWindow) {
	target.z = ++zIndex
	target.minimized = false
	activeWindowId.value = target.id
	if (props.activePath !== target.path) emit('navigate', target.path)
}

function toggleTaskbarWindow(target: DesktopWindow) {
	if (activeWindowId.value === target.id && !target.minimized) {
		minimizeWindow(target)
	} else {
		focusWindow(target)
	}
}

function beginWindowDrag(event: PointerEvent, target: DesktopWindow) {
	if (event.button !== 0 || target.maximized) return
	focusWindow(target)
	const startX = event.clientX
	const startY = event.clientY
	const originX = target.x
	const originY = target.y
	const move = (moveEvent: PointerEvent) => {
		target.x = Math.max(0, Math.min(window.innerWidth - 260, originX + moveEvent.clientX - startX))
		target.y = Math.max(0, Math.min(window.innerHeight - 120, originY + moveEvent.clientY - startY))
	}
	const stop = () => {
		window.removeEventListener('pointermove', move)
		window.removeEventListener('pointerup', stop)
		cleanupPointerListeners = null
	}
	window.addEventListener('pointermove', move)
	window.addEventListener('pointerup', stop, { once: true })
	cleanupPointerListeners = stop
}

function closeWindow(target: DesktopWindow) {
	const index = windows.value.findIndex((item) => item.id === target.id)
	if (index >= 0) windows.value.splice(index, 1)
	if (activeWindowId.value !== target.id) return
	const next = windows.value.filter((item) => !item.minimized).sort((a, b) => b.z - a.z)[0]
	activeWindowId.value = next?.id ?? null
	if (next && props.activePath !== next.path) emit('navigate', next.path)
}

function minimizeWindow(target: DesktopWindow) {
	target.minimized = true
	if (activeWindowId.value !== target.id) return
	const next = windows.value.filter((item) => !item.minimized).sort((a, b) => b.z - a.z)[0]
	activeWindowId.value = next?.id ?? null
	if (next && props.activePath !== next.path) emit('navigate', next.path)
}

function toggleMaximize(target: DesktopWindow) {
	focusWindow(target)
	target.maximized = !target.maximized
}

function showProperties(shortcut: DesktopShortcut) {
	contextMenu.value = null
	propertiesShortcut.value = shortcut
}

function closeMenus() {
	contextMenu.value = null
}

defineExpose({
	openPath: (path: string) => openWindow(path, routeTitle(path), true),
})

watch(
	() => props.activePath,
	(path, previousPath) => {
		if (!mounted || path === previousPath) return
		openWindow(path, routeTitle(path), false)
	},
)

watch(
	() => themeStore.windowsShortcutGrid,
	(enabled) => {
		if (enabled) snapAllShortcutsToGrid()
	},
)

onMounted(() => {
	mounted = true
	if (themeStore.windowsShortcutGrid) snapAllShortcutsToGrid()
	window.addEventListener('pointerdown', closeMenus)
})

onBeforeUnmount(() => {
	window.removeEventListener('pointerdown', closeMenus)
	cleanupPointerListeners?.()
})
</script>

<template>
	<div class="windows-desktop" @contextmenu.prevent>
		<div class="desktop-shortcuts">
			<button
				v-for="(shortcut, index) in shortcuts"
				:key="shortcut.id"
				:style="shortcutStyle(shortcut, index)"
				@pointerdown.stop="beginShortcutDrag($event, shortcut, index)"
				@contextmenu.stop="showContextMenu($event, shortcut)"
			>
				<span class="desktop-shortcut__tile">
					<img v-if="shortcut.iconPath" :src="shortcut.iconPath" alt="" />
					<EdenIcon v-else-if="shortcut.kind === 'home'" name="home" :size="24" />
					<EdenIcon v-else-if="shortcut.kind === 'catalog'" name="compass" :size="24" />
					<EdenIcon
						v-else-if="shortcut.kind === 'library' || shortcut.kind === 'instance'"
						name="library"
						:size="24"
					/>
					<EdenIcon v-else-if="shortcut.kind === 'skins'" name="shirt" :size="24" />
					<EdenIcon v-else-if="shortcut.kind === 'create'" name="plus" :size="24" />
					<EdenIcon v-else name="settings" :size="24" />
				</span>
				<span class="desktop-shortcut__label">{{ shortcut.title }}</span>
			</button>
		</div>

		<section
			v-for="appWindow in windows"
			v-show="!appWindow.minimized"
			:key="appWindow.id"
			class="windows-app-window"
			:class="{ maximized: appWindow.maximized, active: activeWindowId === appWindow.id }"
			:style="{
				left: `${appWindow.x}px`,
				top: `${appWindow.y}px`,
				width: `${appWindow.width}px`,
				height: `${appWindow.height}px`,
				zIndex: appWindow.z,
			}"
			@pointerdown="focusWindow(appWindow)"
		>
			<header
				@pointerdown.stop="beginWindowDrag($event, appWindow)"
				@dblclick="toggleMaximize(appWindow)"
			>
				<img v-if="appWindow.iconPath" :src="appWindow.iconPath" alt="" />
				<EdenMark v-else :size="18" />
				<strong>{{ appWindow.title }}</strong>
				<div class="windows-app-window__controls">
					<button aria-label="Свернуть" @pointerdown.stop @click.stop="minimizeWindow(appWindow)">
						<EdenIcon name="minimize" :size="16" />
					</button>
					<button
						:aria-label="appWindow.maximized ? 'Восстановить размер' : 'Развернуть'"
						@pointerdown.stop
						@click.stop="toggleMaximize(appWindow)"
					>
						<EdenIcon name="maximize" :size="14" />
					</button>
					<button
						class="close"
						aria-label="Закрыть"
						@pointerdown.stop
						@click.stop="closeWindow(appWindow)"
					>
						<EdenIcon name="close" :size="16" />
					</button>
				</div>
			</header>
			<div class="windows-app-window__body">
				<slot v-if="activeWindowId === appWindow.id" />
				<div v-else class="windows-app-window__inactive" @dblclick="focusWindow(appWindow)">
					<EdenMark :size="56" />
					<strong>{{ appWindow.title }}</strong>
					<span>Окно открыто в фоне. Дважды нажмите, чтобы продолжить.</span>
				</div>
			</div>
		</section>

		<Teleport to=".app-grid-navbar">
			<div v-if="windows.length" class="windows-open-apps">
				<button
					v-for="appWindow in windows"
					:key="appWindow.id"
					:title="appWindow.title"
					:class="{ active: activeWindowId === appWindow.id && !appWindow.minimized }"
					@click="toggleTaskbarWindow(appWindow)"
				>
					<img v-if="appWindow.iconPath" :src="appWindow.iconPath" alt="" />
					<EdenMark v-else :size="20" />
					<span>{{ appWindow.title }}</span>
				</button>
			</div>
		</Teleport>

		<div
			v-if="contextMenu"
			class="desktop-context-menu"
			:style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
			@pointerdown.stop
		>
			<button @click="openShortcut(contextMenu.shortcut)">Открыть</button>
			<button @click="showProperties(contextMenu.shortcut)">Свойства</button>
		</div>

		<section v-if="propertiesShortcut" class="shortcut-properties">
			<header>
				<strong>Свойства: {{ propertiesShortcut.title }}</strong>
				<button @click="propertiesShortcut = null">×</button>
			</header>
			<div>
				<img v-if="propertiesShortcut.iconPath" :src="propertiesShortcut.iconPath" alt="" />
				<EdenMark v-else :size="56" />
				<dl>
					<dt>Тип</dt>
					<dd>
						{{ propertiesShortcut.kind === 'instance' ? 'Игровая сборка' : 'Раздел лаунчера' }}
					</dd>
					<dt>Описание</dt>
					<dd>{{ propertiesShortcut.details }}</dd>
					<dt>Адрес</dt>
					<dd>{{ propertiesShortcut.path ?? 'Встроенное действие' }}</dd>
				</dl>
			</div>
			<footer><button @click="propertiesShortcut = null">OK</button></footer>
		</section>
	</div>
</template>

<style scoped lang="scss">
.windows-desktop {
	position: absolute;
	inset: 0;
	overflow: hidden;
	color: #f5f3fa;
	font-family: var(--font-standard);
	user-select: none;
}

.desktop-shortcuts > button {
	position: absolute;
	display: flex;
	width: 5.8rem;
	height: 6rem;
	flex-direction: column;
	align-items: center;
	gap: 0.4rem;
	padding: 0.35rem;
	border: 1px solid transparent;
	border-radius: 6px;
	color: #f5f3fa;
	background: transparent;
	font: 12px var(--font-standard);
	text-shadow: 0 1px 3px rgba(0, 0, 0, 0.85);
	cursor: default;
	touch-action: none;
}

.desktop-shortcuts > button:hover {
	border-color: rgba(188, 155, 255, 0.35);
	background: rgba(188, 155, 255, 0.14);
}

.desktop-shortcuts > button:focus-visible {
	outline: 2px solid var(--eden-focus);
	outline-offset: 2px;
}

.desktop-shortcut__tile {
	display: grid;
	width: 48px;
	height: 48px;
	flex: 0 0 auto;
	overflow: hidden;
	place-items: center;
	border: 1px solid rgba(245, 243, 250, 0.16);
	border-radius: 10px;
	color: #f5f3fa;
	background: rgba(17, 17, 25, 0.82);
	box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);

	img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
}

.desktop-shortcut__label {
	display: -webkit-box;
	overflow: hidden;
	text-align: center;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
}

.windows-app-window {
	position: absolute;
	display: grid;
	min-width: 34rem;
	min-height: 22rem;
	grid-template-rows: 38px 1fr;
	overflow: hidden;
	resize: both;
	border: 1px solid #32313f;
	border-radius: 4px;
	color: #f5f3fa;
	background: #0d0d14;
	box-shadow: 0 18px 48px rgba(0, 0, 0, 0.55);
	text-shadow: none;
}

.windows-app-window.active {
	border-color: rgba(188, 155, 255, 0.6);
}

.windows-app-window.maximized {
	inset: 0 !important;
	width: 100% !important;
	height: 100% !important;
	border-radius: 0;
	resize: none;
}

.windows-app-window > header,
.shortcut-properties > header {
	display: flex;
	align-items: center;
	height: 38px;
	padding-left: 12px;
	background: #111119;
	cursor: default;
	touch-action: none;
}

.windows-app-window.active > header {
	background: #171720;
	box-shadow: inset 0 -1px 0 #32313f;
}

.windows-app-window > header > img {
	width: 18px;
	height: 18px;
	border-radius: 4px;
	object-fit: cover;
}

.windows-app-window > header > :is(img, svg) {
	margin-right: 10px;
}

.windows-app-window > header > strong {
	min-width: 0;
	flex: 1;
	overflow: hidden;
	font-size: 13px;
	font-weight: 500;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.windows-app-window:not(.active) > header > strong {
	color: #aaa8bc;
}

.windows-app-window__controls {
	display: flex;
	height: 100%;
}

.windows-app-window__controls button,
.shortcut-properties header button {
	display: grid;
	width: 46px;
	place-items: center;
	padding: 0;
	border: 0;
	border-radius: 0;
	color: #f5f3fa;
	background: transparent;
	cursor: default;
}

.windows-app-window__controls button:hover {
	background: rgba(255, 255, 255, 0.1);
}

.windows-app-window__controls .close:hover,
.shortcut-properties header button:hover {
	background: #c42b1c;
}

.windows-app-window__controls button:focus-visible,
.shortcut-properties button:focus-visible {
	outline: 2px solid var(--eden-focus);
	outline-offset: -2px;
}

.windows-app-window__body {
	position: relative;
	min-height: 0;
	overflow: auto;
	background: var(--eden-canvas);
}

.windows-app-window__body :deep(.eden-home),
.windows-app-window__body :deep(.app-viewport) {
	min-height: 100%;
}

.windows-app-window__inactive {
	display: grid;
	height: 100%;
	place-content: center;
	justify-items: center;
	gap: 6px;
	color: #d8d6e3;
}

.windows-app-window__inactive span {
	color: #aaa8bc;
	font-size: 0.78rem;
}

.windows-open-apps {
	display: flex;
	min-width: 0;
	height: 100%;
	flex: 1 1 auto;
	gap: 2px;
	order: 2;
	overflow-x: auto;
	overflow-y: hidden;
	text-shadow: none;
	scrollbar-width: none;
}

.windows-open-apps::-webkit-scrollbar {
	display: none;
}

.windows-open-apps button {
	display: flex;
	min-width: 3rem;
	max-width: 12rem;
	height: 100%;
	align-items: center;
	gap: 0.55rem;
	padding: 0 0.9rem;
	border: 0;
	border-bottom: 2px solid transparent;
	border-radius: 0;
	color: #f5f3fa;
	background: transparent;
	font: 0.78rem var(--font-standard);
}

.windows-open-apps button:hover {
	background: rgba(255, 255, 255, 0.08);
}

.windows-open-apps button.active {
	border-bottom-color: var(--eden-accent);
	background: rgba(188, 155, 255, 0.14);
}

.windows-open-apps button:focus-visible {
	outline: 2px solid var(--eden-focus);
	outline-offset: -2px;
}

.windows-open-apps img {
	width: 1.25rem;
	height: 1.25rem;
	border-radius: 4px;
}

.windows-open-apps span {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.desktop-context-menu {
	position: fixed;
	z-index: 500;
	display: flex;
	width: 13rem;
	flex-direction: column;
	padding: 6px;
	border: 1px solid #32313f;
	border-radius: 6px;
	background: #171720;
	box-shadow: 4px 10px 26px rgba(0, 0, 0, 0.55);
	text-shadow: none;
}

.desktop-context-menu button {
	padding: 0.55rem 1rem;
	border: 0;
	border-radius: 4px;
	color: #f5f3fa;
	background: transparent;
	font: 0.82rem var(--font-standard);
	text-align: left;
}

.desktop-context-menu button:hover,
.desktop-context-menu button:focus-visible {
	outline: none;
	background: rgba(188, 155, 255, 0.16);
}

.shortcut-properties {
	position: fixed;
	top: 50%;
	left: 50%;
	z-index: 600;
	width: 28rem;
	overflow: hidden;
	transform: translate(-50%, -50%);
	border: 1px solid #32313f;
	border-radius: 6px;
	color: #f5f3fa;
	background: #111119;
	box-shadow: 0 18px 46px rgba(0, 0, 0, 0.65);
	text-shadow: none;
}

.shortcut-properties > header strong {
	flex: 1;
	font-size: 0.82rem;
	font-weight: 500;
}

.shortcut-properties > div {
	display: grid;
	grid-template-columns: 4.5rem 1fr;
	gap: 1rem;
	padding: 1.2rem;
}

.shortcut-properties > div > img {
	width: 4rem;
	height: 4rem;
	border-radius: 10px;
	object-fit: cover;
}

.shortcut-properties dl {
	display: grid;
	grid-template-columns: 5rem 1fr;
	gap: 0.5rem;
	margin: 0;
	font-size: 0.8rem;
}

.shortcut-properties dt {
	color: #aaa8bc;
}

.shortcut-properties dd {
	min-width: 0;
	margin: 0;
	overflow-wrap: anywhere;
}

.shortcut-properties footer {
	display: flex;
	justify-content: flex-end;
	padding: 0.8rem;
	border-top: 1px solid #32313f;
}

.shortcut-properties footer button {
	min-width: 6rem;
	padding: 0.45rem 1rem;
	border: 0;
	border-radius: 6px;
	color: var(--eden-on-accent);
	background: var(--eden-accent);
	font: inherit;
	font-weight: 600;
}
</style>
