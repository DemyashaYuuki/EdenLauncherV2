<script setup lang="ts">
import { defineMessages, Toggle, useVIntl } from '@modrinth/ui'
import { computed, ref, watch } from 'vue'

import EdenIcon from '@/components/ui/eden/EdenIcon.vue'
import EdenMark from '@/components/ui/eden/EdenMark.vue'
import { get, set } from '@/helpers/settings.ts'
import { getOS } from '@/helpers/utils'
import { useTheming } from '@/store/state'
import {
	ACCENT_SWATCHES,
	type ColorTheme,
	type CustomLauncherTheme,
	DEFAULT_ACCENT_COLOR,
	DEFAULT_CUSTOM_THEME,
	EDEN_BACKGROUNDS,
	EDEN_PALETTES,
	type LauncherButtonEffect,
	type LauncherTheme,
	type LauncherVisualTheme,
	normalizeAccentColor,
	resolveAccentForPalette,
	textOnAccent,
} from '@/store/theme.ts'

const RECENT_COLORS_STORAGE_KEY = 'edenlauncher-recent-colors'
const MAX_RECENT_COLORS = 6

const themeStore = useTheming()
const { formatMessage } = useVIntl()

const messages = defineMessages({
	advancedRenderingTitle: {
		id: 'app.appearance-settings.advanced-rendering.title',
		defaultMessage: 'Эффекты интерфейса',
	},
	advancedRenderingDescription: {
		id: 'app.appearance-settings.advanced-rendering.description',
		defaultMessage: 'Мягкое свечение и размытие панелей.',
	},
	nativeDecorationsTitle: {
		id: 'app.appearance-settings.native-decorations.title',
		defaultMessage: 'Системная рамка окна',
	},
	nativeDecorationsDescription: {
		id: 'app.appearance-settings.native-decorations.description',
		defaultMessage:
			'Использовать заголовок и кнопки окна операционной системы. Требует перезапуска.',
	},
})

const atmospheres: {
	id: Exclude<LauncherVisualTheme, 'windows10' | 'custom'>
	title: string
	description: string
	image: string
	icon: 'moon' | 'sun' | 'monitor'
}[] = [
	{
		id: 'standard',
		title: 'Eden / Portal',
		description: 'Сумерки и фиолетовый свет',
		image: EDEN_BACKGROUNDS.portal,
		icon: 'moon',
	},
	{
		id: 'asuna',
		title: 'Асуна / Bloom',
		description: 'Светлый цветочный мир',
		image: EDEN_BACKGROUNDS.bloom,
		icon: 'sun',
	},
	{
		id: 'error',
		title: 'Error / Signal',
		description: 'Графит и аналоговый сигнал',
		image: EDEN_BACKGROUNDS.signal,
		icon: 'monitor',
	},
]

const colorModes: { id: ColorTheme; label: string; icon: 'moon' | 'sun' | 'monitor' }[] = [
	{ id: 'dark', label: 'Тёмный', icon: 'moon' },
	{ id: 'light', label: 'Светлый', icon: 'sun' },
	{ id: 'system', label: 'Как в системе', icon: 'monitor' },
]

const buttonEffects: { value: LauncherButtonEffect; label: string; description: string }[] = [
	{
		value: 'none',
		label: 'Без эффекта',
		description: 'Кнопки нажимаются без дополнительной анимации.',
	},
	{ value: 'pulse', label: 'Мягкий импульс', description: 'Короткое свечение вокруг кнопки.' },
	{ value: 'wave', label: 'Волна', description: 'Акцентная волна расходится от кнопки.' },
	{
		value: 'interference',
		label: 'Помеха',
		description: 'Короткий контрастный шум без смещения области нажатия.',
	},
]

const os = ref(await getOS())
const settings = ref(await get())
const view = ref<'main' | 'editor'>('main')

// ---------- Accent ----------

const accentColorInput = ref(themeStore.accentColor)
const isAccentColorValid = computed(() => normalizeAccentColor(accentColorInput.value) !== null)
const recentColors = ref<string[]>(readRecentColors())

const initialTheme: ColorTheme =
	settings.value.theme === 'light' || settings.value.theme === 'system'
		? settings.value.theme
		: 'dark'
settings.value.theme = initialTheme
if (themeStore.visualTheme === 'standard') themeStore.setThemeState(initialTheme)

watch(
	settings,
	async () => {
		await set(settings.value)
	},
	{ deep: true },
)

watch(
	() => themeStore.accentColor,
	(color) => {
		if (normalizeAccentColor(accentColorInput.value) !== color) accentColorInput.value = color
	},
)

watch(accentColorInput, (color) => {
	const normalized = normalizeAccentColor(color)
	if (normalized && normalized !== themeStore.accentColor) themeStore.setAccentColor(normalized)
})

function readRecentColors(): string[] {
	try {
		const stored = JSON.parse(localStorage.getItem(RECENT_COLORS_STORAGE_KEY) ?? '[]')
		if (!Array.isArray(stored)) return []
		return stored
			.map((color) => (typeof color === 'string' ? normalizeAccentColor(color) : null))
			.filter((color): color is string => color !== null)
			.slice(0, MAX_RECENT_COLORS)
	} catch {
		return []
	}
}

function rememberColor(color: string) {
	const normalized = normalizeAccentColor(color)
	if (!normalized || (ACCENT_SWATCHES as readonly string[]).includes(normalized)) return
	recentColors.value = [
		normalized,
		...recentColors.value.filter((recentColor) => recentColor !== normalized),
	].slice(0, MAX_RECENT_COLORS)
	try {
		localStorage.setItem(RECENT_COLORS_STORAGE_KEY, JSON.stringify(recentColors.value))
	} catch {
		/* the list is a convenience only */
	}
}

function chooseAccentColor(color: string, remember = true) {
	const normalized = normalizeAccentColor(color)
	if (!normalized) return
	accentColorInput.value = normalized
	themeStore.setAccentColor(normalized)
	if (remember) rememberColor(normalized)
}

function normalizeColorInput() {
	const normalized = normalizeAccentColor(accentColorInput.value)
	if (normalized) rememberColor(normalized)
	else accentColorInput.value = themeStore.accentColor
}

// ---------- Modes ----------

function isAtmosphereActive(id: LauncherVisualTheme) {
	return themeStore.visualTheme === id
}

function chooseAtmosphere(id: Exclude<LauncherVisualTheme, 'windows10' | 'custom'>) {
	if (id === 'standard') {
		// Coming back from another mode returns to the dark Portal; inside Eden the colour mode is kept.
		const mode: ColorTheme =
			themeStore.visualTheme === 'standard' ? themeStore.selectedTheme : 'dark'
		themeStore.setVisualTheme('standard')
		themeStore.setThemeState(mode)
		settings.value.theme = mode
	} else {
		themeStore.setVisualTheme(id)
		settings.value.theme = id === 'asuna' ? 'light' : 'dark'
	}
	accentColorInput.value = themeStore.accentColor
}

function chooseWindows() {
	themeStore.setVisualTheme('windows10')
	settings.value.theme = 'dark'
	accentColorInput.value = themeStore.accentColor
}

function chooseColorMode(theme: ColorTheme) {
	settings.value.theme = theme
	if (themeStore.visualTheme !== 'standard') themeStore.setVisualTheme('standard')
	themeStore.setThemeState(theme)
	accentColorInput.value = themeStore.accentColor
}

// ---------- Windows desktop ----------

const windowsBackgroundInput = ref<HTMLInputElement | null>(null)
const windowsBackground = ref(readStorage('edenlauncher-windows-desktop-background') ?? '')
const windowsBackgroundError = ref('')

function readStorage(key: string) {
	try {
		return localStorage.getItem(key)
	} catch {
		return null
	}
}

async function onWindowsBackgroundSelected(event: Event) {
	const input = event.target as HTMLInputElement
	const file = input.files?.[0]
	if (!file) return
	windowsBackgroundError.value = ''
	try {
		windowsBackground.value = await prepareCustomBackground(file)
		localStorage.setItem('edenlauncher-windows-desktop-background', windowsBackground.value)
		document.documentElement.style.setProperty(
			'--windows-desktop-background-image',
			`url(${JSON.stringify(windowsBackground.value)})`,
		)
	} catch (error) {
		windowsBackgroundError.value =
			error instanceof Error ? error.message : 'Не удалось сохранить фон рабочего стола.'
	} finally {
		input.value = ''
	}
}

function resetWindowsBackground() {
	windowsBackground.value = ''
	try {
		localStorage.removeItem('edenlauncher-windows-desktop-background')
	} catch {
		/* nothing to clean up */
	}
	document.documentElement.style.removeProperty('--windows-desktop-background-image')
}

// ---------- Custom theme editor ----------

const customThemeName = ref(themeStore.customTheme.name)
const customBaseTheme = ref<LauncherTheme>(themeStore.customTheme.baseTheme)
const customAccentColor = ref(themeStore.customTheme.accentColor)
const customBackground = ref(themeStore.customTheme.backgroundDataUrl)
const customButtonEffect = ref<LauncherButtonEffect>(themeStore.customTheme.buttonEffect)
const customBackgroundInput = ref<HTMLInputElement | null>(null)
const customThemeError = ref('')
const customThemeSaved = ref(false)
const isCustomAccentValid = computed(() => normalizeAccentColor(customAccentColor.value) !== null)
const hasSavedCustomTheme = computed(
	() => !!themeStore.customTheme.backgroundDataUrl || themeStore.visualTheme === 'custom',
)

/** Same tokens the real interface uses, computed for the theme being edited. */
const previewStyle = computed(() => {
	const paletteName = customBaseTheme.value === 'light' ? 'light' : 'portal'
	const palette = EDEN_PALETTES[paletteName]
	const accent = resolveAccentForPalette(
		normalizeAccentColor(customAccentColor.value) ?? DEFAULT_ACCENT_COLOR,
		paletteName,
	)
	// Same rule as the real banner: a light hero only when a light theme brings its own image.
	const light = paletteName === 'light' && !!customBackground.value
	return {
		'--preview-canvas': palette.canvas,
		'--preview-sidebar': palette.sidebar,
		'--preview-surface': palette.surfaceRaised,
		'--preview-text': palette.text,
		'--preview-text-secondary': palette.textSecondary,
		'--preview-accent': accent,
		'--preview-on-accent': textOnAccent(accent, paletteName),
		'--preview-image': `url(${JSON.stringify(customBackground.value || EDEN_BACKGROUNDS.portal)})`,
		'--preview-scrim': light
			? 'linear-gradient(90deg, rgba(255,251,246,.94) 0%, rgba(255,251,246,.7) 38%, rgba(255,251,246,0) 75%)'
			: 'linear-gradient(90deg, rgba(12,11,21,.92) 0%, rgba(12,11,21,.6) 38%, rgba(12,11,21,0) 75%)',
		'--preview-hero-text': light ? '#262231' : '#F5F3FA',
	}
})

function openEditor() {
	customThemeName.value = themeStore.customTheme.name
	customBaseTheme.value = themeStore.customTheme.baseTheme
	customAccentColor.value = themeStore.customTheme.accentColor
	customBackground.value = themeStore.customTheme.backgroundDataUrl
	customButtonEffect.value = themeStore.customTheme.buttonEffect
	customThemeError.value = ''
	customThemeSaved.value = false
	view.value = 'editor'
}

function applySavedCustomTheme() {
	themeStore.setVisualTheme('custom')
	settings.value.theme = themeStore.customTheme.baseTheme
	accentColorInput.value = themeStore.accentColor
}

function resetEditor() {
	customThemeName.value = DEFAULT_CUSTOM_THEME.name
	customBaseTheme.value = DEFAULT_CUSTOM_THEME.baseTheme
	customAccentColor.value = DEFAULT_CUSTOM_THEME.accentColor
	customBackground.value = DEFAULT_CUSTOM_THEME.backgroundDataUrl
	customButtonEffect.value = DEFAULT_CUSTOM_THEME.buttonEffect
	customThemeError.value = ''
	customThemeSaved.value = false
}

function readFileAsDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => resolve(String(reader.result))
		reader.onerror = () => reject(reader.error ?? new Error('Не удалось прочитать изображение.'))
		reader.readAsDataURL(file)
	})
}

function loadImage(source: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image()
		image.onload = () => resolve(image)
		image.onerror = () => reject(new Error('Выбранный файл не является изображением.'))
		image.src = source
	})
}

async function prepareCustomBackground(file: File): Promise<string> {
	const source = await readFileAsDataUrl(file)
	const image = await loadImage(source)
	const scale = Math.min(1, 1920 / image.naturalWidth, 1080 / image.naturalHeight)
	const canvas = document.createElement('canvas')
	canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
	canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
	const context = canvas.getContext('2d')
	if (!context) throw new Error('Не удалось подготовить фон темы.')

	context.drawImage(image, 0, 0, canvas.width, canvas.height)
	return canvas.toDataURL('image/jpeg', 0.84)
}

async function onCustomBackgroundSelected(event: Event) {
	const input = event.target as HTMLInputElement
	const file = input.files?.[0]
	if (!file) return

	customThemeError.value = ''
	customThemeSaved.value = false
	try {
		customBackground.value = await prepareCustomBackground(file)
	} catch (error) {
		customThemeError.value = error instanceof Error ? error.message : 'Не удалось загрузить фон.'
	} finally {
		input.value = ''
	}
}

function saveCustomTheme() {
	const accentColor = normalizeAccentColor(customAccentColor.value)
	if (!accentColor) {
		customThemeError.value = 'Укажите цвет в формате #RRGGBB, например #BC9BFF.'
		return
	}

	const customTheme: CustomLauncherTheme = {
		name: customThemeName.value.trim() || 'Моя тема',
		backgroundDataUrl: customBackground.value,
		accentColor,
		baseTheme: customBaseTheme.value,
		buttonEffect: customButtonEffect.value,
	}

	if (!themeStore.saveCustomTheme(customTheme)) {
		customThemeError.value =
			'Не удалось сохранить тему. Попробуйте выбрать изображение меньшего размера.'
		return
	}

	settings.value.theme = customBaseTheme.value
	accentColorInput.value = accentColor
	rememberColor(accentColor)
	customThemeError.value = ''
	customThemeSaved.value = true
}

function resetTheme() {
	themeStore.resetToDefaults()
	resetWindowsBackground()
	settings.value.theme = 'dark'
	accentColorInput.value = DEFAULT_ACCENT_COLOR
	recentColors.value = []
	try {
		localStorage.removeItem(RECENT_COLORS_STORAGE_KEY)
	} catch {
		/* nothing stored */
	}
	resetEditor()
}
</script>

<template>
	<div v-if="view === 'main'" class="eden-appearance">
		<section aria-labelledby="eden-atmosphere-title">
			<p class="eden-eyebrow">Режим оформления</p>
			<h2 id="eden-atmosphere-title" class="eden-appearance__title">
				Выбери атмосферу своего Eden
			</h2>
			<div
				class="eden-appearance__atmospheres"
				role="radiogroup"
				aria-labelledby="eden-atmosphere-title"
			>
				<button
					v-for="item in atmospheres"
					:key="item.id"
					type="button"
					role="radio"
					class="eden-choice-card"
					:class="{ active: isAtmosphereActive(item.id) }"
					:aria-checked="isAtmosphereActive(item.id)"
					@click="chooseAtmosphere(item.id)"
				>
					<span class="eden-choice-card__image" :style="{ backgroundImage: `url(${item.image})` }">
						<span class="eden-choice-card__badge"><EdenIcon :name="item.icon" :size="16" /></span>
					</span>
					<span class="eden-choice-card__body">
						<span>
							<strong>{{ item.title }}</strong>
							<small>{{ item.description }}</small>
						</span>
						<span v-if="isAtmosphereActive(item.id)" class="eden-choice-card__check">
							<EdenIcon name="check" :size="14" />
						</span>
					</span>
				</button>
			</div>

			<div class="eden-appearance__wide">
				<button
					type="button"
					class="eden-wide-card"
					:class="{ active: themeStore.visualTheme === 'windows10' }"
					:aria-pressed="themeStore.visualTheme === 'windows10'"
					@click="chooseWindows"
				>
					<span class="eden-icon-tile"><EdenIcon name="monitor" /></span>
					<span class="eden-wide-card__copy">
						<strong>Windows 10</strong>
						<small>Рабочий стол, ярлыки и окна</small>
					</span>
					<EdenIcon
						:name="themeStore.visualTheme === 'windows10' ? 'check' : 'chevron'"
						:size="18"
						class="eden-wide-card__trail"
					/>
				</button>
				<button
					type="button"
					class="eden-wide-card"
					:class="{ active: themeStore.visualTheme === 'custom' }"
					@click="openEditor"
				>
					<span class="eden-icon-tile"><EdenIcon name="image" /></span>
					<span class="eden-wide-card__copy">
						<strong>{{
							themeStore.visualTheme === 'custom' ? themeStore.customTheme.name : 'Своя тема'
						}}</strong>
						<small>Фон, цвет и характер кнопок</small>
					</span>
					<EdenIcon name="chevron" :size="18" class="eden-wide-card__trail" />
				</button>
			</div>

			<div v-if="themeStore.visualTheme === 'windows10'" class="eden-appearance__panel">
				<div class="eden-appearance__row">
					<span class="eden-appearance__row-copy">
						<strong>Фон рабочего стола</strong>
						<small>Настраивается отдельно от остальных тем.</small>
					</span>
					<input
						ref="windowsBackgroundInput"
						type="file"
						accept="image/*"
						class="sr-only"
						@change="onWindowsBackgroundSelected"
					/>
					<button
						type="button"
						class="eden-btn eden-btn--secondary eden-btn--compact"
						@click="windowsBackgroundInput?.click()"
					>
						<EdenIcon name="image" :size="16" /> Выбрать фон
					</button>
					<button
						v-if="windowsBackground"
						type="button"
						class="eden-btn eden-btn--ghost eden-btn--compact"
						@click="resetWindowsBackground"
					>
						Вернуть стандартный
					</button>
				</div>
				<p v-if="windowsBackgroundError" class="eden-field-error" role="alert">
					<EdenIcon name="warning" :size="14" /> {{ windowsBackgroundError }}
				</p>
				<div class="eden-appearance__row">
					<span class="eden-appearance__row-copy">
						<strong>Выравнивать ярлыки по сетке</strong>
						<small>При перемещении ярлыки фиксируются в ближайшей ячейке рабочего стола.</small>
					</span>
					<Toggle
						id="windows-shortcut-grid"
						:model-value="themeStore.windowsShortcutGrid"
						@update:model-value="(enabled) => themeStore.setWindowsShortcutGrid(!!enabled)"
					/>
				</div>
			</div>
		</section>

		<section aria-labelledby="eden-color-mode-title">
			<p id="eden-color-mode-title" class="eden-eyebrow">Цветовой режим</p>
			<div class="eden-appearance__modes" role="radiogroup" aria-labelledby="eden-color-mode-title">
				<button
					v-for="mode in colorModes"
					:key="mode.id"
					type="button"
					role="radio"
					class="eden-btn eden-btn--secondary eden-mode-button"
					:class="{
						active: themeStore.visualTheme === 'standard' && themeStore.selectedTheme === mode.id,
					}"
					:aria-checked="
						themeStore.visualTheme === 'standard' && themeStore.selectedTheme === mode.id
					"
					@click="chooseColorMode(mode.id)"
				>
					<EdenIcon :name="mode.icon" :size="18" />
					{{ mode.label }}
				</button>
			</div>
			<p v-if="themeStore.visualTheme !== 'standard'" class="eden-appearance__note">
				Режим «{{
					themeStore.visualTheme === 'asuna'
						? 'Асуна'
						: themeStore.visualTheme === 'error'
							? 'Error'
							: themeStore.visualTheme === 'windows10'
								? 'Windows 10'
								: themeStore.customTheme.name
				}}» использует собственную палитру. Выбор цветового режима вернёт Eden / Portal.
			</p>
		</section>

		<section aria-labelledby="eden-accent-title">
			<p id="eden-accent-title" class="eden-eyebrow">Акцентный цвет</p>
			<div class="eden-appearance__accent">
				<div
					class="eden-appearance__swatches"
					role="radiogroup"
					aria-labelledby="eden-accent-title"
				>
					<button
						v-for="color in ACCENT_SWATCHES"
						:key="color"
						type="button"
						role="radio"
						class="eden-swatch"
						:class="{ active: themeStore.accentColor === color }"
						:style="{ backgroundColor: color }"
						:aria-checked="themeStore.accentColor === color"
						:aria-label="`Акцент ${color}`"
						@click="chooseAccentColor(color, false)"
					>
						<EdenIcon v-if="themeStore.accentColor === color" name="check" :size="16" />
					</button>
					<label class="eden-swatch eden-swatch--picker" title="Выбрать свой цвет">
						<input
							type="color"
							:value="themeStore.accentColor"
							aria-label="Выбрать свой акцентный цвет"
							@input="(event) => chooseAccentColor((event.target as HTMLInputElement).value, false)"
							@change="(event) => chooseAccentColor((event.target as HTMLInputElement).value)"
						/>
						<EdenIcon name="plus" :size="16" />
					</label>
				</div>
				<div class="eden-appearance__hex">
					<label class="eden-input" :class="{ 'eden-input--invalid': !isAccentColorValid }">
						<input
							v-model="accentColorInput"
							type="text"
							maxlength="7"
							spellcheck="false"
							aria-label="HEX-код акцентного цвета"
							:aria-invalid="!isAccentColorValid"
							aria-describedby="eden-accent-error"
							@blur="normalizeColorInput"
						/>
					</label>
					<p v-if="!isAccentColorValid" id="eden-accent-error" class="eden-field-error">
						<EdenIcon name="warning" :size="14" /> Цвет в формате #RRGGBB, например #BC9BFF
					</p>
				</div>
			</div>
			<div v-if="recentColors.length" class="eden-appearance__recent">
				<span>Недавние</span>
				<button
					v-for="color in recentColors"
					:key="color"
					type="button"
					class="eden-swatch eden-swatch--small"
					:class="{ active: themeStore.accentColor === color }"
					:style="{ backgroundColor: color }"
					:aria-label="`Недавний цвет ${color}`"
					@click="chooseAccentColor(color)"
				></button>
			</div>
		</section>

		<section class="eden-appearance__toggles">
			<div class="eden-appearance__row">
				<span class="eden-appearance__row-copy">
					<strong>{{ formatMessage(messages.advancedRenderingTitle) }}</strong>
					<small>{{ formatMessage(messages.advancedRenderingDescription) }}</small>
				</span>
				<Toggle
					id="advanced-rendering"
					:model-value="themeStore.advancedRendering"
					@update:model-value="
						(e) => {
							themeStore.advancedRendering = !!e
							settings.advanced_rendering = themeStore.advancedRendering
						}
					"
				/>
			</div>
			<div v-if="os !== 'MacOS'" class="eden-appearance__row">
				<span class="eden-appearance__row-copy">
					<strong>{{ formatMessage(messages.nativeDecorationsTitle) }}</strong>
					<small>{{ formatMessage(messages.nativeDecorationsDescription) }}</small>
				</span>
				<Toggle id="native-decorations" v-model="settings.native_decorations" />
			</div>
			<div class="eden-appearance__row">
				<span class="eden-appearance__row-copy">
					<strong>Сбросить оформление</strong>
					<small>Вернуть Eden / Portal, стандартный акцент и удалить свою тему.</small>
				</span>
				<button
					type="button"
					class="eden-btn eden-btn--secondary eden-btn--compact"
					@click="resetTheme"
				>
					<EdenIcon name="refresh" :size="16" /> Сбросить
				</button>
			</div>
		</section>
	</div>

	<div v-else class="eden-theme-editor">
		<nav class="eden-theme-editor__crumbs" aria-label="Навигация">
			<button type="button" class="eden-btn eden-btn--ghost" @click="view = 'main'">
				<EdenIcon name="chevron" :size="16" class="eden-flip" /> Оформление
			</button>
			<span>/ Редактор темы</span>
		</nav>

		<div class="eden-theme-editor__grid">
			<div class="eden-theme-editor__preview-card">
				<div
					class="eden-theme-preview"
					:style="previewStyle"
					aria-label="Предпросмотр темы"
					role="img"
				>
					<div class="eden-theme-preview__sidebar">
						<span class="eden-theme-preview__brand"><EdenMark :size="18" /> Eden</span>
						<span class="eden-theme-preview__nav active">Главная</span>
						<span class="eden-theme-preview__nav">Библиотека</span>
						<span class="eden-theme-preview__nav">Каталог</span>
					</div>
					<div class="eden-theme-preview__main">
						<strong class="eden-theme-preview__page">Главная</strong>
						<div class="eden-theme-preview__hero">
							<span class="eden-theme-preview__title">EdenWorld</span>
							<span class="eden-theme-preview__lead">Настоящая ваниль. Свои люди.</span>
							<span class="eden-theme-preview__button"
								><EdenIcon name="play" :size="12" /> Играть</span
							>
						</div>
						<span class="eden-theme-preview__card">
							<span></span>
							<span></span>
						</span>
					</div>
				</div>
				<p class="eden-theme-editor__hint">
					Фон остаётся частью атмосферы, а элементы управления сохраняют читаемость на любом
					изображении.
				</p>
			</div>

			<div class="eden-theme-editor__form">
				<label class="eden-theme-editor__label" for="eden-theme-name">Название темы</label>
				<div class="eden-input">
					<input
						id="eden-theme-name"
						v-model="customThemeName"
						type="text"
						maxlength="40"
						placeholder="Например, Ночной лес"
					/>
				</div>

				<span class="eden-theme-editor__label">Фоновое изображение</span>
				<div
					class="eden-theme-editor__thumb"
					:style="customBackground ? { backgroundImage: `url(${customBackground})` } : undefined"
				>
					<span v-if="!customBackground">Без изображения — используется фон Eden</span>
				</div>
				<input
					ref="customBackgroundInput"
					type="file"
					accept="image/*"
					class="sr-only"
					@change="onCustomBackgroundSelected"
				/>
				<div class="eden-theme-editor__inline">
					<button
						type="button"
						class="eden-btn eden-btn--secondary eden-btn--compact"
						@click="customBackgroundInput?.click()"
					>
						<EdenIcon name="image" :size="16" />
						{{ customBackground ? 'Заменить изображение' : 'Выбрать изображение' }}
					</button>
					<button
						v-if="customBackground"
						type="button"
						class="eden-btn eden-btn--ghost eden-btn--compact"
						@click="customBackground = ''"
					>
						Убрать
					</button>
				</div>

				<span id="eden-theme-base" class="eden-theme-editor__label">Основа</span>
				<div
					class="eden-theme-editor__segmented"
					role="radiogroup"
					aria-labelledby="eden-theme-base"
				>
					<button
						type="button"
						role="radio"
						class="eden-btn eden-btn--secondary eden-mode-button"
						:class="{ active: customBaseTheme === 'dark' }"
						:aria-checked="customBaseTheme === 'dark'"
						@click="customBaseTheme = 'dark'"
					>
						<EdenIcon name="moon" :size="16" /> Тёмная
					</button>
					<button
						type="button"
						role="radio"
						class="eden-btn eden-btn--secondary eden-mode-button"
						:class="{ active: customBaseTheme === 'light' }"
						:aria-checked="customBaseTheme === 'light'"
						@click="customBaseTheme = 'light'"
					>
						<EdenIcon name="sun" :size="16" /> Светлая
					</button>
				</div>

				<label class="eden-theme-editor__label" for="eden-theme-effect">Эффект кнопок</label>
				<div class="eden-input">
					<select id="eden-theme-effect" v-model="customButtonEffect">
						<option v-for="effect in buttonEffects" :key="effect.value" :value="effect.value">
							{{ effect.label }}
						</option>
					</select>
					<EdenIcon name="chevrondown" :size="16" />
				</div>
				<small class="eden-theme-editor__help">
					{{ buttonEffects.find((effect) => effect.value === customButtonEffect)?.description }}
				</small>

				<label class="eden-theme-editor__label" for="eden-theme-color">Цвет</label>
				<div class="eden-theme-editor__color">
					<label
						class="eden-swatch eden-swatch--picker"
						:style="{ backgroundColor: isCustomAccentValid ? customAccentColor : undefined }"
					>
						<input
							v-model="customAccentColor"
							type="color"
							aria-label="Выбрать акцентный цвет темы"
						/>
					</label>
					<div class="eden-input" :class="{ 'eden-input--invalid': !isCustomAccentValid }">
						<input
							id="eden-theme-color"
							v-model="customAccentColor"
							type="text"
							maxlength="7"
							spellcheck="false"
							:aria-invalid="!isCustomAccentValid"
						/>
					</div>
				</div>
				<p v-if="!isCustomAccentValid" class="eden-field-error">
					<EdenIcon name="warning" :size="14" /> Цвет в формате #RRGGBB, например #BC9BFF
				</p>
			</div>
		</div>

		<p v-if="customThemeError" class="eden-field-error" role="alert">
			<EdenIcon name="warning" :size="14" /> {{ customThemeError }}
		</p>
		<p v-else-if="customThemeSaved" class="eden-theme-editor__saved" role="status">
			<EdenIcon name="check" :size="16" /> Тема сохранена и применена.
		</p>

		<footer class="eden-theme-editor__actions">
			<button type="button" class="eden-btn eden-btn--secondary" @click="resetEditor">
				<EdenIcon name="refresh" :size="18" /> Сбросить
			</button>
			<button
				v-if="hasSavedCustomTheme && themeStore.visualTheme !== 'custom'"
				type="button"
				class="eden-btn eden-btn--ghost"
				@click="applySavedCustomTheme"
			>
				Применить сохранённую
			</button>
			<button
				type="button"
				class="eden-btn eden-btn--primary"
				:disabled="!isCustomAccentValid"
				@click="saveCustomTheme"
			>
				<EdenIcon name="check" :size="18" /> Сохранить тему
			</button>
		</footer>
	</div>
</template>

<style lang="scss" scoped>
.eden-appearance {
	display: flex;
	flex-direction: column;
	gap: 28px;
	color: var(--eden-text);
}

.eden-appearance__title {
	margin: 8px 0 16px;
	color: var(--eden-text);
	font-size: 21px;
	font-weight: 650;
}

.eden-appearance__atmospheres {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(176px, 1fr));
	gap: 14px;
}

.eden-choice-card {
	display: flex;
	min-width: 0;
	flex-direction: column;
	overflow: hidden;
	padding: 0;
	border: 1px solid var(--eden-border);
	border-radius: var(--eden-radius-card);
	color: var(--eden-text);
	background: var(--eden-surface);
	font: inherit;
	text-align: left;
	cursor: pointer;
	transition: border-color var(--eden-motion-hover) ease;

	&:hover {
		border-color: var(--eden-border-strong);
	}

	&.active {
		border: 2px solid var(--eden-accent);
	}

	&:focus-visible {
		outline: 2px solid var(--eden-focus);
		outline-offset: 3px;
	}
}

.eden-choice-card__image {
	position: relative;
	display: block;
	height: 96px;
	background-position: 70% 45%;
	background-size: cover;
}

.eden-choice-card__badge {
	position: absolute;
	top: 10px;
	left: 10px;
	display: grid;
	width: 28px;
	height: 28px;
	place-items: center;
	border-radius: 7px;
	color: #f5f3fa;
	background: rgba(20, 19, 29, 0.78);
}

.eden-choice-card__body {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	padding: 14px 14px 16px;

	> span:first-child {
		display: flex;
		min-width: 0;
		flex-direction: column;
		gap: 6px;
	}

	strong {
		font-size: 15px;
		font-weight: 650;
	}

	small {
		color: var(--eden-text-secondary);
		font-size: 12px;
	}
}

.eden-choice-card__check {
	display: grid;
	width: 22px;
	height: 22px;
	flex: 0 0 auto;
	place-items: center;
	border-radius: 50%;
	color: var(--eden-on-accent);
	background: var(--eden-accent);
}

.eden-appearance__wide {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
	gap: 14px;
	margin-top: 14px;
}

.eden-wide-card {
	display: flex;
	align-items: center;
	gap: 14px;
	padding: 16px;
	border: 1px solid var(--eden-border);
	border-radius: var(--eden-radius-card);
	color: var(--eden-text);
	background: var(--eden-surface);
	font: inherit;
	text-align: left;
	cursor: pointer;
	transition: border-color var(--eden-motion-hover) ease;

	&:hover {
		border-color: var(--eden-border-strong);
	}

	&.active {
		border: 2px solid var(--eden-accent);
	}

	&:focus-visible {
		outline: 2px solid var(--eden-focus);
		outline-offset: 3px;
	}
}

.eden-wide-card__copy {
	display: flex;
	min-width: 0;
	flex: 1;
	flex-direction: column;
	gap: 6px;

	strong {
		overflow: hidden;
		font-size: 15px;
		font-weight: 650;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	small {
		color: var(--eden-text-secondary);
		font-size: 12px;
	}
}

.eden-wide-card__trail {
	color: var(--eden-text-secondary);
}

.eden-appearance__panel {
	display: flex;
	flex-direction: column;
	gap: 12px;
	margin-top: 14px;
	padding: 16px;
	border: 1px solid var(--eden-border);
	border-radius: var(--eden-radius-card);
	background: var(--eden-surface);
}

.eden-appearance__row {
	display: flex;
	align-items: center;
	gap: 14px;
}

.eden-appearance__row-copy {
	display: flex;
	min-width: 0;
	flex: 1;
	flex-direction: column;
	gap: 4px;

	strong {
		color: var(--eden-text);
		font-size: 14px;
		font-weight: 650;
	}

	small {
		color: var(--eden-text-secondary);
		font-size: 12px;
		line-height: 1.5;
	}
}

.eden-appearance__modes {
	display: flex;
	flex-wrap: wrap;
	gap: 12px;
	margin-top: 14px;
}

.eden-mode-button {
	min-width: 150px;
	justify-content: flex-start;
	min-height: 42px;

	&.active {
		border-color: transparent;
		color: var(--eden-on-accent);
		background: var(--eden-accent);

		&:hover {
			background: var(--eden-accent-hover);
		}
	}
}

.eden-appearance__note {
	margin: 10px 0 0;
	color: var(--eden-text-secondary);
	font-size: 12px;
}

.eden-appearance__accent {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 16px 24px;
	margin-top: 14px;
}

.eden-appearance__swatches {
	display: flex;
	flex-wrap: wrap;
	gap: 14px;
}

.eden-swatch {
	position: relative;
	display: grid;
	width: 38px;
	height: 38px;
	place-items: center;
	padding: 0;
	border: 0;
	border-radius: 50%;
	color: #121315;
	cursor: pointer;
	box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);

	&.active {
		box-shadow:
			0 0 0 3px var(--eden-canvas),
			0 0 0 5px var(--eden-text);
	}
}

.eden-swatch--picker {
	overflow: hidden;
	color: var(--eden-text-secondary);
	background: var(--eden-surface-raised);
	box-shadow: inset 0 0 0 1px var(--eden-border);

	input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		opacity: 0;
		cursor: pointer;
	}

	&:focus-within {
		outline: 2px solid var(--eden-focus);
		outline-offset: 3px;
	}
}

.eden-swatch--small {
	width: 24px;
	height: 24px;
}

.eden-appearance__hex {
	width: 170px;

	.eden-input {
		min-height: 42px;
		font-family: ui-monospace, Consolas, monospace;
		text-transform: uppercase;
	}
}

.eden-appearance__recent {
	display: flex;
	align-items: center;
	gap: 10px;
	margin-top: 14px;

	span {
		margin-right: 4px;
		color: var(--eden-text-secondary);
		font-size: 12px;
	}
}

.eden-appearance__toggles {
	display: flex;
	flex-direction: column;
	gap: 18px;
	padding-top: 20px;
	border-top: 1px solid var(--eden-border);
}

// ---------- Editor ----------

.eden-theme-editor {
	display: flex;
	flex-direction: column;
	gap: 18px;
	color: var(--eden-text);
}

.eden-theme-editor__crumbs {
	display: flex;
	align-items: center;
	gap: 4px;
	color: var(--eden-text-secondary);
	font-size: 13px;
}

.eden-flip {
	transform: rotate(180deg);
}

.eden-theme-editor__grid {
	display: grid;
	grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
	gap: 18px;
	align-items: start;
}

.eden-theme-editor__preview-card {
	padding: 14px;
	border: 1px solid var(--eden-border);
	border-radius: var(--eden-radius-card);
	background: var(--eden-surface);
}

.eden-theme-editor__hint {
	margin: 14px 4px 2px;
	color: var(--eden-text-secondary);
	font-size: 12px;
	line-height: 1.6;
}

.eden-theme-preview {
	display: grid;
	grid-template-columns: 76px 1fr;
	gap: 10px;
	aspect-ratio: 16 / 10;
	overflow: hidden;
	padding: 10px;
	border-radius: 12px;
	color: var(--preview-text);
	background: var(--preview-canvas);
}

.eden-theme-preview__sidebar {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 8px 6px;
	border-radius: 8px;
	background: var(--preview-sidebar);
	font-size: 9px;
}

.eden-theme-preview__brand {
	display: flex;
	align-items: center;
	gap: 5px;
	margin-bottom: 6px;
	font-weight: 700;
	letter-spacing: 0.1em;
	text-transform: uppercase;

	:deep(.eden-mark) {
		color: var(--preview-accent);
	}
}

.eden-theme-preview__nav {
	padding: 5px 6px;
	border-radius: 5px;
	color: var(--preview-text-secondary);

	&.active {
		color: var(--preview-text);
		background: var(--preview-surface);
	}
}

.eden-theme-preview__main {
	display: flex;
	min-width: 0;
	flex-direction: column;
	gap: 8px;
}

.eden-theme-preview__page {
	font-size: 12px;
}

.eden-theme-preview__hero {
	display: flex;
	flex: 1;
	flex-direction: column;
	justify-content: center;
	gap: 6px;
	padding: 12px;
	border-radius: 8px;
	color: var(--preview-hero-text);
	background:
		var(--preview-scrim),
		var(--preview-image) 70% 45% / cover no-repeat;
}

.eden-theme-preview__title {
	font-size: 20px;
	font-weight: 700;
}

.eden-theme-preview__lead {
	font-size: 9px;
	opacity: 0.85;
}

.eden-theme-preview__button {
	display: inline-flex;
	width: max-content;
	align-items: center;
	gap: 4px;
	margin-top: 4px;
	padding: 5px 12px;
	border-radius: 5px;
	color: var(--preview-on-accent);
	background: var(--preview-accent);
	font-size: 9px;
	font-weight: 700;
}

.eden-theme-preview__card {
	display: flex;
	gap: 6px;
	height: 22px;

	span {
		flex: 1;
		border-radius: 5px;
		background: var(--preview-surface);
	}
}

.eden-theme-editor__form {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 16px;
	border: 1px solid var(--eden-border);
	border-radius: var(--eden-radius-card);
	background: var(--eden-surface);

	.eden-input {
		min-height: 42px;

		select {
			appearance: none;
			cursor: pointer;
		}

		select option {
			color: var(--eden-text);
			background: var(--eden-surface);
		}
	}
}

.eden-theme-editor__label {
	margin-top: 10px;
	color: var(--eden-text-secondary);
	font-size: 11px;
	font-weight: 700;
	letter-spacing: 0.14em;
	text-transform: uppercase;

	&:first-child {
		margin-top: 0;
	}
}

.eden-theme-editor__thumb {
	display: grid;
	height: 86px;
	place-items: center;
	padding: 8px;
	border: 1px dashed var(--eden-border);
	border-radius: 10px;
	color: var(--eden-text-secondary);
	background: var(--eden-surface-raised) center / cover no-repeat;
	font-size: 12px;
	text-align: center;
}

.eden-theme-editor__inline,
.eden-theme-editor__segmented {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.eden-theme-editor__segmented .eden-mode-button {
	min-width: 0;
	flex: 1 1 0;
	padding: 0 12px;
}

.eden-theme-editor__help {
	color: var(--eden-text-secondary);
	font-size: 12px;
}

.eden-theme-editor__color {
	display: flex;
	align-items: center;
	gap: 10px;

	.eden-input {
		flex: 1;
		font-family: ui-monospace, Consolas, monospace;
		text-transform: uppercase;
	}
}

.eden-theme-editor__saved {
	display: flex;
	align-items: center;
	gap: 8px;
	margin: 0;
	color: var(--eden-success);
	font-size: 13px;
}

.eden-theme-editor__actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 12px;

	.eden-btn--primary {
		margin-left: auto;
	}
}

@media (max-width: 1199px) {
	.eden-theme-editor__grid {
		grid-template-columns: 1fr;
	}
}
</style>
