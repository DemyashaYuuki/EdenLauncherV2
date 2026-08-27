<script setup lang="ts">
import { MonitorIcon, MoonIcon, PaletteIcon, SunIcon } from '@modrinth/assets'
import { ButtonStyled, defineMessages, Toggle, useVIntl } from '@modrinth/ui'
import { computed, ref, watch } from 'vue'

import asunaBackground from '@/assets/theme-asuna.png'
import errorBackground from '@/assets/theme-error.png'
import { get, set } from '@/helpers/settings.ts'
import { getOS } from '@/helpers/utils'
import { useTheming } from '@/store/state'
import {
	type ColorTheme,
	type CustomLauncherTheme,
	DEFAULT_ACCENT_COLOR,
	DEFAULT_CUSTOM_THEME,
	type LauncherButtonEffect,
	type LauncherTheme,
	type LauncherVisualTheme,
	normalizeAccentColor,
} from '@/store/theme.ts'

const RECENT_COLORS_STORAGE_KEY = 'edenlauncher-recent-colors'
const MAX_RECENT_COLORS = 6

const themeStore = useTheming()
const { formatMessage } = useVIntl()

const messages = defineMessages({
	themeModeTitle: {
		id: 'edenlauncher.appearance-settings.theme-mode.title',
		defaultMessage: 'Режим оформления',
	},
	themeModeDescription: {
		id: 'edenlauncher.appearance-settings.theme-mode.description',
		defaultMessage: 'Выберите готовое оформление или создайте собственную тему.',
	},
	asunaTheme: {
		id: 'edenlauncher.appearance-settings.theme-mode.asuna',
		defaultMessage: 'Асуна',
	},
	asunaThemeDescription: {
		id: 'edenlauncher.appearance-settings.theme-mode.asuna-description',
		defaultMessage: 'Светлый цветочный мир',
	},
	errorTheme: {
		id: 'edenlauncher.appearance-settings.theme-mode.error',
		defaultMessage: 'Error',
	},
	errorThemeDescription: {
		id: 'edenlauncher.appearance-settings.theme-mode.error-description',
		defaultMessage: 'Мрак и аналоговые помехи',
	},
	launcherColorTitle: {
		id: 'edenlauncher.appearance-settings.launcher-color.title',
		defaultMessage: 'Цвет лаунчера',
	},
	launcherColorDescription: {
		id: 'edenlauncher.appearance-settings.launcher-color.description',
		defaultMessage: 'Выберите новый цвет или вернитесь к одному из недавно использованных.',
	},
	customColorLabel: {
		id: 'edenlauncher.appearance-settings.launcher-color.custom',
		defaultMessage: 'Выбрать цвет',
	},
	colorCodeLabel: {
		id: 'edenlauncher.appearance-settings.launcher-color.code',
		defaultMessage: 'HEX-код цвета',
	},
	invalidColor: {
		id: 'edenlauncher.appearance-settings.launcher-color.invalid',
		defaultMessage: 'Введите цвет в формате #RRGGBB',
	},
	resetColor: {
		id: 'edenlauncher.appearance-settings.launcher-color.reset',
		defaultMessage: 'Сбросить все настройки тем',
	},
	advancedRenderingTitle: {
		id: 'app.appearance-settings.advanced-rendering.title',
		defaultMessage: 'Расширенные эффекты',
	},
	advancedRenderingDescription: {
		id: 'app.appearance-settings.advanced-rendering.description',
		defaultMessage: 'Размытие фона и дополнительные визуальные эффекты интерфейса.',
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

const buttonEffects: { value: LauncherButtonEffect; label: string; description: string }[] = [
	{
		value: 'none',
		label: 'Без эффекта',
		description: 'Кнопки нажимаются без дополнительной анимации.',
	},
	{ value: 'pulse', label: 'Импульс', description: 'Короткое мягкое уменьшение и свечение.' },
	{ value: 'wave', label: 'Волна', description: 'Акцентная волна расходится от кнопки.' },
	{
		value: 'interference',
		label: 'Помеха',
		description: 'Короткий контрастный шум без смещения области клика.',
	},
]

const os = ref(await getOS())
const settings = ref(await get())
const accentColorInput = ref(themeStore.accentColor)
const customEditorOpen = ref(false)
const customThemeName = ref(themeStore.customTheme.name)
const customBaseTheme = ref<LauncherTheme>(themeStore.customTheme.baseTheme)
const customAccentColor = ref(themeStore.customTheme.accentColor)
const customBackground = ref(themeStore.customTheme.backgroundDataUrl)
const customButtonEffect = ref<LauncherButtonEffect>(themeStore.customTheme.buttonEffect)
const customBackgroundInput = ref<HTMLInputElement | null>(null)
const windowsBackgroundInput = ref<HTMLInputElement | null>(null)
const windowsBackground = ref(localStorage.getItem('edenlauncher-windows-desktop-background') ?? '')
const customThemeError = ref('')
const customThemeSaved = ref(false)
const isAccentColorValid = computed(() => normalizeAccentColor(accentColorInput.value) !== null)
const isCustomAccentValid = computed(() => normalizeAccentColor(customAccentColor.value) !== null)
const customThemePreviewStyle = computed(() => ({
	backgroundColor: customBaseTheme.value === 'light' ? '#F7F5FA' : '#09060D',
	backgroundImage: customBackground.value ? `url(${customBackground.value})` : undefined,
}))
const recentColors = ref<string[]>(readRecentColors())

const initialTheme: ColorTheme =
	settings.value.theme === 'light' || settings.value.theme === 'system'
		? settings.value.theme
		: 'dark'
settings.value.theme = initialTheme
themeStore.setThemeState(initialTheme)

watch(
	settings,
	async () => {
		await set(settings.value)
	},
	{ deep: true },
)

watch(accentColorInput, (color) => {
	const normalized = normalizeAccentColor(color)
	if (normalized) themeStore.setAccentColor(normalized)
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
	if (!normalized) return

	recentColors.value = [
		normalized,
		...recentColors.value.filter((recentColor) => recentColor !== normalized),
	].slice(0, MAX_RECENT_COLORS)
	localStorage.setItem(RECENT_COLORS_STORAGE_KEY, JSON.stringify(recentColors.value))
}

function chooseAccentColor(color: string, remember = true) {
	const normalized = normalizeAccentColor(color)
	if (!normalized) return

	accentColorInput.value = normalized
	themeStore.setAccentColor(normalized)
	if (remember) rememberColor(normalized)
}

function chooseLauncherTheme(theme: ColorTheme) {
	settings.value.theme = theme
	themeStore.setThemeState(theme)
	themeStore.setVisualTheme('standard')
}

function chooseVisualTheme(theme: Exclude<LauncherVisualTheme, 'standard' | 'custom'>) {
	themeStore.setVisualTheme(theme)
	settings.value.theme = theme === 'asuna' ? 'light' : 'dark'
	accentColorInput.value = themeStore.accentColor
	rememberColor(themeStore.accentColor)
}

async function onWindowsBackgroundSelected(event: Event) {
	const input = event.target as HTMLInputElement
	const file = input.files?.[0]
	if (!file) return
	try {
		windowsBackground.value = await prepareCustomBackground(file)
		localStorage.setItem('edenlauncher-windows-desktop-background', windowsBackground.value)
		document.documentElement.style.setProperty(
			'--windows-desktop-background-image',
			`url(${JSON.stringify(windowsBackground.value)})`,
		)
	} finally {
		input.value = ''
	}
}

function resetWindowsBackground() {
	windowsBackground.value = ''
	localStorage.removeItem('edenlauncher-windows-desktop-background')
	document.documentElement.style.removeProperty('--windows-desktop-background-image')
}

function chooseCustomTheme() {
	if (!themeStore.customTheme.backgroundDataUrl) {
		customEditorOpen.value = true
		return
	}

	themeStore.setVisualTheme('custom')
	settings.value.theme = themeStore.customTheme.baseTheme
	accentColorInput.value = themeStore.accentColor
}

function onNativeColorInput(event: Event) {
	chooseAccentColor((event.target as HTMLInputElement).value, false)
}

function onNativeColorChange(event: Event) {
	chooseAccentColor((event.target as HTMLInputElement).value)
}

function normalizeColorInput() {
	const normalized = normalizeAccentColor(accentColorInput.value)
	if (normalized) rememberColor(normalized)
	accentColorInput.value = themeStore.accentColor
}

function resetTheme() {
	themeStore.resetToDefaults()
	resetWindowsBackground()
	settings.value.theme = 'dark'
	accentColorInput.value = DEFAULT_ACCENT_COLOR
	recentColors.value = []
	localStorage.removeItem(RECENT_COLORS_STORAGE_KEY)
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
		customThemeError.value = 'Введите корректный акцентный цвет.'
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
</script>

<template>
	<h2 class="m-0 text-lg font-semibold text-contrast">
		{{ formatMessage(messages.themeModeTitle) }}
	</h2>
	<p class="m-0 mt-1">{{ formatMessage(messages.themeModeDescription) }}</p>

	<div class="theme-mode-grid mt-4">
		<button
			type="button"
			class="theme-mode-option"
			:class="{
				active: themeStore.visualTheme === 'standard' && themeStore.selectedTheme === 'dark',
			}"
			@click="chooseLauncherTheme('dark')"
		>
			<span class="theme-mode-option__preview theme-mode-option__preview--dark"><MoonIcon /></span>
			<span>Тёмная тема</span>
		</button>
		<button
			type="button"
			class="theme-mode-option"
			:class="{
				active: themeStore.visualTheme === 'standard' && themeStore.selectedTheme === 'light',
			}"
			@click="chooseLauncherTheme('light')"
		>
			<span class="theme-mode-option__preview theme-mode-option__preview--light"><SunIcon /></span>
			<span>Светлая тема</span>
		</button>
		<button
			type="button"
			class="theme-mode-option"
			:class="{
				active: themeStore.visualTheme === 'standard' && themeStore.selectedTheme === 'system',
			}"
			@click="chooseLauncherTheme('system')"
		>
			<span class="theme-mode-option__preview theme-mode-option__preview--system"
				><MonitorIcon
			/></span>
			<span class="theme-mode-option__copy">
				<strong>Как в системе</strong>
				<small>Следует за светлым или тёмным режимом ОС</small>
			</span>
		</button>
		<button
			type="button"
			class="theme-mode-option"
			:class="{ active: themeStore.visualTheme === 'windows10' }"
			@click="chooseVisualTheme('windows10')"
		>
			<span class="theme-mode-option__preview theme-mode-option__preview--windows"
				><MonitorIcon
			/></span>
			<span class="theme-mode-option__copy">
				<strong>Windows 10</strong>
				<small>Рабочий стол, панель задач и меню «Пуск»</small>
			</span>
		</button>
		<button
			type="button"
			class="theme-mode-option"
			:class="{ active: themeStore.visualTheme === 'asuna' }"
			@click="chooseVisualTheme('asuna')"
		>
			<span
				class="theme-mode-option__preview theme-mode-option__preview--image"
				:style="{ backgroundImage: `url(${asunaBackground})` }"
			></span>
			<span class="theme-mode-option__copy">
				<strong>{{ formatMessage(messages.asunaTheme) }}</strong>
				<small>{{ formatMessage(messages.asunaThemeDescription) }}</small>
			</span>
		</button>
		<button
			type="button"
			class="theme-mode-option theme-mode-option--error"
			:class="{ active: themeStore.visualTheme === 'error' }"
			@click="chooseVisualTheme('error')"
		>
			<span
				class="theme-mode-option__preview theme-mode-option__preview--image"
				:style="{ backgroundImage: `url(${errorBackground})` }"
			></span>
			<span class="theme-mode-option__copy">
				<strong>{{ formatMessage(messages.errorTheme) }}</strong>
				<small>{{ formatMessage(messages.errorThemeDescription) }}</small>
			</span>
		</button>
		<button
			type="button"
			class="theme-mode-option"
			:class="{ active: themeStore.visualTheme === 'custom' }"
			@click="chooseCustomTheme"
		>
			<span
				class="theme-mode-option__preview theme-mode-option__preview--image theme-mode-option__preview--custom"
				:style="{
					backgroundImage: themeStore.customTheme.backgroundDataUrl
						? `url(${themeStore.customTheme.backgroundDataUrl})`
						: undefined,
				}"
			>
				<PaletteIcon v-if="!themeStore.customTheme.backgroundDataUrl" />
			</span>
			<span class="theme-mode-option__copy">
				<strong>{{ themeStore.customTheme.name || 'Своя тема' }}</strong>
				<small>Ваш фон, цвет и эффект кнопок</small>
			</span>
		</button>
	</div>

	<div v-if="themeStore.visualTheme === 'windows10'" class="windows-background-settings">
		<div>
			<strong>Фон рабочего стола</strong>
			<small>Настраивается отдельно от остальных тем.</small>
		</div>
		<input
			ref="windowsBackgroundInput"
			type="file"
			accept="image/*"
			class="sr-only"
			@change="onWindowsBackgroundSelected"
		/>
		<ButtonStyled type="outlined">
			<button type="button" @click="windowsBackgroundInput?.click()">Выбрать фон</button>
		</ButtonStyled>
		<ButtonStyled v-if="windowsBackground" type="outlined">
			<button type="button" @click="resetWindowsBackground">Вернуть стандартный</button>
		</ButtonStyled>
	</div>

	<div class="custom-theme-heading">
		<div>
			<h2 class="m-0 text-lg font-semibold text-contrast">Своя тема</h2>
			<p class="m-0 mt-1">Создайте оформление и сохраните его между запусками.</p>
		</div>
		<ButtonStyled type="outlined">
			<button type="button" @click="customEditorOpen = !customEditorOpen">
				{{ customEditorOpen ? 'Скрыть редактор' : 'Настроить' }}
			</button>
		</ButtonStyled>
	</div>

	<div v-if="customEditorOpen" class="custom-theme-editor mt-4">
		<div class="custom-theme-preview" :style="customThemePreviewStyle">
			<span>{{ customThemeName || 'Моя тема' }}</span>
		</div>
		<div class="custom-theme-fields">
			<label>
				<span>Название темы</span>
				<input
					v-model="customThemeName"
					type="text"
					maxlength="40"
					placeholder="Например, Ночной лес"
				/>
			</label>
			<div class="custom-theme-row">
				<label>
					<span>Основа</span>
					<select v-model="customBaseTheme">
						<option value="dark">Тёмная</option>
						<option value="light">Светлая</option>
					</select>
				</label>
				<label>
					<span>Эффект нажатия</span>
					<select v-model="customButtonEffect">
						<option v-for="effect in buttonEffects" :key="effect.value" :value="effect.value">
							{{ effect.label }}
						</option>
					</select>
				</label>
			</div>
			<small>{{
				buttonEffects.find((effect) => effect.value === customButtonEffect)?.description
			}}</small>
			<label>
				<span>Акцентный цвет</span>
				<div class="custom-theme-color">
					<input v-model="customAccentColor" type="color" aria-label="Акцентный цвет темы" />
					<input
						v-model="customAccentColor"
						type="text"
						maxlength="7"
						class="accent-color-code"
						:class="{ invalid: !isCustomAccentValid }"
					/>
				</div>
			</label>
			<div class="custom-theme-actions">
				<input
					ref="customBackgroundInput"
					type="file"
					accept="image/*"
					class="sr-only"
					@change="onCustomBackgroundSelected"
				/>
				<ButtonStyled type="outlined">
					<button type="button" @click="customBackgroundInput?.click()">
						{{ customBackground ? 'Заменить фон' : 'Выбрать фон' }}
					</button>
				</ButtonStyled>
				<ButtonStyled type="standard">
					<button type="button" @click="saveCustomTheme">Сохранить и применить</button>
				</ButtonStyled>
			</div>
			<p v-if="customThemeError" class="custom-theme-message custom-theme-message--error">
				{{ customThemeError }}
			</p>
			<p v-else-if="customThemeSaved" class="custom-theme-message">Тема сохранена и применена.</p>
		</div>
	</div>

	<h2 class="m-0 mt-8 text-lg font-semibold text-contrast">
		{{ formatMessage(messages.launcherColorTitle) }}
	</h2>
	<p class="m-0 mt-1">{{ formatMessage(messages.launcherColorDescription) }}</p>

	<div class="accent-color-panel mt-4">
		<label class="accent-color-preview" :title="formatMessage(messages.customColorLabel)">
			<input
				type="color"
				:value="themeStore.accentColor"
				:aria-label="formatMessage(messages.customColorLabel)"
				@input="onNativeColorInput"
				@change="onNativeColorChange"
			/>
		</label>
		<div class="min-w-0 flex-1">
			<label for="accent-color-code" class="mb-1 block text-sm font-semibold text-primary">
				{{ formatMessage(messages.colorCodeLabel) }}
			</label>
			<input
				id="accent-color-code"
				v-model="accentColorInput"
				type="text"
				maxlength="7"
				spellcheck="false"
				class="accent-color-code"
				:class="{ invalid: !isAccentColorValid }"
				@blur="normalizeColorInput"
			/>
			<span v-if="!isAccentColorValid" class="mt-1 block text-xs text-red">
				{{ formatMessage(messages.invalidColor) }}
			</span>
		</div>
	</div>

	<div class="recent-colors mt-3">
		<div class="recent-colors__heading">
			<strong>Недавние цвета</strong>
			<span>Сохраняются последние {{ MAX_RECENT_COLORS }}</span>
		</div>
		<div v-if="recentColors.length" class="recent-colors__list">
			<button
				v-for="color in recentColors"
				:key="color"
				type="button"
				class="recent-color"
				:class="{ active: themeStore.accentColor === color }"
				@click="chooseAccentColor(color)"
			>
				<span :style="{ backgroundColor: color }"></span>
				<code>{{ color }}</code>
			</button>
		</div>
		<p v-else class="recent-colors__empty">Выберите цвет — он появится здесь.</p>
	</div>

	<div class="mt-3">
		<ButtonStyled type="outlined">
			<button type="button" @click="resetTheme">
				{{ formatMessage(messages.resetColor) }}
			</button>
		</ButtonStyled>
	</div>

	<div class="mt-6 flex items-center justify-between">
		<div>
			<h2 class="m-0 text-lg font-semibold text-contrast">
				{{ formatMessage(messages.advancedRenderingTitle) }}
			</h2>
			<p class="m-0 mt-1">{{ formatMessage(messages.advancedRenderingDescription) }}</p>
		</div>
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

	<div v-if="os !== 'MacOS'" class="mt-6 flex items-center justify-between gap-4">
		<div>
			<h2 class="m-0 text-lg font-semibold text-contrast">
				{{ formatMessage(messages.nativeDecorationsTitle) }}
			</h2>
			<p class="m-0 mt-1">{{ formatMessage(messages.nativeDecorationsDescription) }}</p>
		</div>
		<Toggle id="native-decorations" v-model="settings.native_decorations" />
	</div>
</template>

<style lang="scss" scoped>
.theme-mode-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 0.75rem;
	margin-bottom: 2rem;
}

.theme-mode-option {
	display: flex;
	align-items: center;
	gap: 0.8rem;
	min-height: 4rem;
	padding: 0.7rem;
	border: 1px solid var(--color-button-border);
	border-radius: var(--radius-lg);
	color: var(--color-text-primary);
	background: var(--surface-2);
	font: inherit;
	font-weight: 700;
	text-align: left;
	cursor: pointer;
	transition: 160ms ease;
}

.theme-mode-option:hover {
	border-color: var(--color-brand);
	transform: translateY(-1px);
}

.theme-mode-option.active {
	border-color: var(--color-brand);
	box-shadow: 0 0 0 3px var(--color-brand-highlight);
}

.theme-mode-option__preview--windows {
	color: white;
	background: linear-gradient(135deg, #1b96e8, #005a9e);
	border-radius: 0;
}

.windows-background-settings {
	display: flex;
	align-items: center;
	gap: 0.65rem;
	margin: -1rem 0 2rem;
	padding: 0.8rem;
	border: 1px solid var(--color-button-border);
	border-radius: var(--radius-lg);
	background: var(--surface-2);
}

.windows-background-settings > div:first-child {
	display: flex;
	min-width: 0;
	flex: 1;
	flex-direction: column;
}

.windows-background-settings small {
	color: var(--color-text-tertiary);
}

.theme-mode-option__preview {
	display: grid;
	width: 3rem;
	height: 2.4rem;
	flex: 0 0 auto;
	place-items: center;
	border: 1px solid rgba(128, 128, 128, 0.24);
	border-radius: var(--radius-md);
}

.theme-mode-option__preview svg {
	width: 1.1rem;
	height: 1.1rem;
}

.theme-mode-option__preview--dark {
	color: #f7eaff;
	background: #151019;
}

.theme-mode-option__preview--light {
	color: #6f2ca8;
	background: #ffffff;
}

.theme-mode-option__preview--system {
	color: #d6a9ff;
	background: linear-gradient(135deg, #17111f 0 50%, #ffffff 50% 100%);
}

.theme-mode-option__preview--image {
	width: 5.1rem;
	height: 3.25rem;
	background-position: 72% center;
	background-size: cover;
}

.theme-mode-option__preview--custom {
	color: var(--color-link);
	background-color: var(--surface-4);
}

.theme-mode-option__copy {
	display: flex;
	min-width: 0;
	flex-direction: column;
	gap: 0.2rem;
}

.theme-mode-option__copy small {
	color: var(--color-text-tertiary);
	font-size: 0.7rem;
	font-weight: 500;
}

.theme-mode-option--error:hover .theme-mode-option__preview {
	filter: contrast(1.12) saturate(0.72);
	box-shadow: inset 0 0 0 1px rgba(225, 29, 72, 0.32);
}

.custom-theme-heading {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
}

.custom-theme-editor {
	display: grid;
	grid-template-columns: minmax(12rem, 0.85fr) minmax(18rem, 1.4fr);
	gap: 1.25rem;
	padding: 1rem;
	border: 1px solid var(--color-button-border);
	border-radius: var(--radius-lg);
	background: var(--surface-2);
}

.custom-theme-preview {
	display: flex;
	min-height: 16rem;
	align-items: flex-end;
	padding: 1rem;
	border: 1px solid var(--color-button-border);
	border-radius: var(--radius-lg);
	background-position: center;
	background-size: cover;
	box-shadow: inset 0 -5rem 4rem rgba(0, 0, 0, 0.58);
}

.custom-theme-preview span {
	color: white;
	font-size: 1.15rem;
	font-weight: 800;
	text-shadow: 0 2px 10px black;
}

.custom-theme-fields,
.custom-theme-fields label {
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
}

.custom-theme-fields {
	gap: 0.9rem;
}

.custom-theme-fields label > span {
	font-size: 0.78rem;
	font-weight: 750;
}

.custom-theme-fields input[type='text'],
.custom-theme-fields select {
	min-height: 2.55rem;
	padding: 0.55rem 0.75rem;
	border: 1px solid var(--color-button-border);
	border-radius: var(--radius-md);
	color: var(--color-text-primary);
	background: var(--color-button-bg);
	font: inherit;
}

.custom-theme-row {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 0.75rem;
}

.custom-theme-fields > small {
	margin-top: -0.45rem;
	color: var(--color-text-tertiary);
}

.custom-theme-color {
	display: grid;
	grid-template-columns: 3rem 1fr;
	gap: 0.65rem;
}

.custom-theme-color input[type='color'] {
	width: 3rem;
	height: 2.55rem;
	padding: 0.15rem;
	border: 1px solid var(--color-button-border);
	border-radius: var(--radius-md);
	background: var(--color-button-bg);
}

.custom-theme-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 0.6rem;
}

.custom-theme-message {
	margin: 0;
	color: var(--color-link);
	font-size: 0.78rem;
}

.custom-theme-message--error {
	color: var(--color-red);
}

.accent-color-panel {
	display: flex;
	align-items: flex-start;
	gap: 1rem;
	padding: 1rem;
	border: 1px solid var(--color-button-border);
	border-radius: var(--radius-lg);
	background: var(--surface-2);
}

.accent-color-preview {
	width: 4rem;
	height: 4rem;
	flex: 0 0 auto;
	overflow: hidden;
	padding: 0.25rem;
	border: 1px solid var(--color-button-border);
	border-radius: var(--radius-md);
	background: var(--color-button-bg);
	cursor: pointer;
}

.accent-color-preview input {
	width: 100%;
	height: 100%;
	padding: 0;
	border: 0;
	background: transparent;
	cursor: pointer;
}

.accent-color-preview input::-webkit-color-swatch-wrapper {
	padding: 0;
}

.accent-color-preview input::-webkit-color-swatch {
	border: 0;
	border-radius: calc(var(--radius-md) - 0.25rem);
}

.accent-color-code {
	box-sizing: border-box;
	width: 100%;
	min-height: 2.5rem;
	padding: 0.55rem 0.75rem;
	border: 1px solid var(--color-button-border);
	border-radius: var(--radius-md);
	outline: none;
	color: var(--color-text-primary);
	background: var(--color-button-bg);
	font: inherit;
	font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	font-weight: 600;
	text-transform: uppercase;
}

.accent-color-code:focus {
	border-color: var(--color-brand);
	box-shadow: 0 0 0 3px var(--color-brand-highlight);
}

.accent-color-code.invalid {
	border-color: var(--color-red);
}

.recent-colors {
	padding: 0.85rem;
	border: 1px solid var(--color-button-border);
	border-radius: var(--radius-lg);
	background: var(--surface-2);
}

.recent-colors__heading {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
	margin-bottom: 0.65rem;
}

.recent-colors__heading span,
.recent-colors__empty {
	color: var(--color-text-tertiary);
	font-size: 0.72rem;
}

.recent-colors__list {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 0.5rem;
}

.recent-color {
	display: flex;
	align-items: center;
	gap: 0.55rem;
	padding: 0.45rem 0.55rem;
	border: 1px solid var(--color-button-border);
	border-radius: var(--radius-md);
	color: var(--color-text-primary);
	background: var(--color-button-bg);
	cursor: pointer;
}

.recent-color:hover,
.recent-color.active {
	border-color: var(--color-brand);
	background: var(--color-brand-highlight);
}

.recent-color span {
	width: 1.35rem;
	height: 1.35rem;
	border: 1px solid rgba(255, 255, 255, 0.24);
	border-radius: 0.3rem;
}

.recent-color code {
	font-size: 0.72rem;
}

.recent-colors__empty {
	margin: 0;
}

@media (max-width: 820px) {
	.theme-mode-grid,
	.custom-theme-editor,
	.custom-theme-row {
		grid-template-columns: 1fr;
	}

	.recent-colors__list {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}
</style>
