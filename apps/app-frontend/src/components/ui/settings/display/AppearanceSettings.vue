<script setup lang="ts">
import { MoonIcon, PaletteIcon, SunIcon } from '@modrinth/assets'
import { ButtonStyled, defineMessages, Toggle, useVIntl } from '@modrinth/ui'
import { computed, ref, watch } from 'vue'

import asunaBackground from '@/assets/theme-asuna.png'
import errorBackground from '@/assets/theme-error.png'
import { get, set } from '@/helpers/settings.ts'
import { getOS } from '@/helpers/utils'
import { useTheming } from '@/store/state'
import {
	DEFAULT_ACCENT_COLOR,
	type LauncherTheme,
	type LauncherVisualTheme,
	normalizeAccentColor,
} from '@/store/theme.ts'

const themeStore = useTheming()
const { formatMessage } = useVIntl()

const messages = defineMessages({
	themeModeTitle: {
		id: 'edenlauncher.appearance-settings.theme-mode.title',
		defaultMessage: 'Режим оформления',
	},
	themeModeDescription: {
		id: 'edenlauncher.appearance-settings.theme-mode.description',
		defaultMessage: 'Выберите тёмную или светлую основу. Акцентный цвет сохранится.',
	},
	darkTheme: {
		id: 'edenlauncher.appearance-settings.theme-mode.dark',
		defaultMessage: 'Тёмная тема',
	},
	lightTheme: {
		id: 'edenlauncher.appearance-settings.theme-mode.light',
		defaultMessage: 'Светлая тема',
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
		defaultMessage: 'Мрак, помехи и glitch',
	},
	launcherColorTitle: {
		id: 'edenlauncher.appearance-settings.launcher-color.title',
		defaultMessage: 'Цвет лаунчера',
	},
	launcherColorDescription: {
		id: 'edenlauncher.appearance-settings.launcher-color.description',
		defaultMessage:
			'Выберите любой цвет. Он сразу применится к кнопкам, выделениям, ссылкам, прогрессу, навигации и фону всех разделов.',
	},
	customColorLabel: {
		id: 'edenlauncher.appearance-settings.launcher-color.custom',
		defaultMessage: 'Свой цвет',
	},
	openPalette: {
		id: 'edenlauncher.appearance-settings.launcher-color.open-palette',
		defaultMessage: 'Открыть палитру',
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
		defaultMessage: 'Вернуть фиолетовый',
	},
	advancedRenderingTitle: {
		id: 'app.appearance-settings.advanced-rendering.title',
		defaultMessage: 'Advanced rendering',
	},
	advancedRenderingDescription: {
		id: 'app.appearance-settings.advanced-rendering.description',
		defaultMessage:
			'Enable visual effects such as background blur. This may reduce performance without hardware acceleration.',
	},
	nativeDecorationsTitle: {
		id: 'app.appearance-settings.native-decorations.title',
		defaultMessage: 'System window frame',
	},
	nativeDecorationsDescription: {
		id: 'app.appearance-settings.native-decorations.description',
		defaultMessage:
			"Use your operating system's title bar and window controls. Requires an app restart.",
	},
})

const colorPresets = [
	{ name: 'Eden Purple', value: DEFAULT_ACCENT_COLOR },
	{ name: 'Orchid', value: '#D946EF' },
	{ name: 'Rose', value: '#F43F8C' },
	{ name: 'Ruby', value: '#EF4444' },
	{ name: 'Amber', value: '#F59E0B' },
	{ name: 'Emerald', value: '#10B981' },
	{ name: 'Azure', value: '#3B82F6' },
	{ name: 'Cyan', value: '#06B6D4' },
]

const os = ref(await getOS())
const settings = ref(await get())
const accentColorInput = ref(themeStore.accentColor)
const colorPicker = ref<HTMLInputElement | null>(null)
const isAccentColorValid = computed(() => normalizeAccentColor(accentColorInput.value) !== null)

const initialTheme: LauncherTheme = settings.value.theme === 'light' ? 'light' : 'dark'
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

function chooseAccentColor(color: string) {
	const normalized = normalizeAccentColor(color)
	if (!normalized) return

	accentColorInput.value = normalized
	themeStore.setAccentColor(normalized)
}

function chooseLauncherTheme(theme: LauncherTheme) {
	settings.value.theme = theme
	themeStore.setThemeState(theme)
	themeStore.setVisualTheme('standard')
}

function chooseVisualTheme(theme: Exclude<LauncherVisualTheme, 'standard'>) {
	themeStore.setVisualTheme(theme)
	settings.value.theme = theme === 'asuna' ? 'light' : 'dark'
	accentColorInput.value = themeStore.accentColor
}

function openColorPalette() {
	colorPicker.value?.click()
}

function onNativeColorInput(event: Event) {
	chooseAccentColor((event.target as HTMLInputElement).value)
}

function normalizeColorInput() {
	accentColorInput.value = themeStore.accentColor
}

function resetAccentColor() {
	themeStore.resetAccentColor()
	accentColorInput.value = DEFAULT_ACCENT_COLOR
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
			:aria-pressed="
				themeStore.visualTheme === 'standard' && themeStore.selectedTheme === 'dark'
			"
			@click="chooseLauncherTheme('dark')"
		>
			<span class="theme-mode-option__preview theme-mode-option__preview--dark">
				<MoonIcon />
			</span>
			<span>{{ formatMessage(messages.darkTheme) }}</span>
		</button>
		<button
			type="button"
			class="theme-mode-option"
			:class="{
				active: themeStore.visualTheme === 'standard' && themeStore.selectedTheme === 'light',
			}"
			:aria-pressed="
				themeStore.visualTheme === 'standard' && themeStore.selectedTheme === 'light'
			"
			@click="chooseLauncherTheme('light')"
		>
			<span class="theme-mode-option__preview theme-mode-option__preview--light">
				<SunIcon />
			</span>
			<span>{{ formatMessage(messages.lightTheme) }}</span>
		</button>
		<button
			type="button"
			class="theme-mode-option theme-mode-option--special"
			:class="{ active: themeStore.visualTheme === 'asuna' }"
			:aria-pressed="themeStore.visualTheme === 'asuna'"
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
			class="theme-mode-option theme-mode-option--special theme-mode-option--error"
			:class="{ active: themeStore.visualTheme === 'error' }"
			:aria-pressed="themeStore.visualTheme === 'error'"
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
	</div>

	<h2 class="m-0 text-lg font-semibold text-contrast">
		{{ formatMessage(messages.launcherColorTitle) }}
	</h2>

	<p class="m-0 mt-1">{{ formatMessage(messages.launcherColorDescription) }}</p>

	<div class="accent-color-panel mt-4">
		<label class="accent-color-preview" :title="formatMessage(messages.customColorLabel)">
			<input
				ref="colorPicker"
				type="color"
				:value="themeStore.accentColor"
				:aria-label="formatMessage(messages.customColorLabel)"
				@input="onNativeColorInput"
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
				aria-describedby="accent-color-validation"
				@blur="normalizeColorInput"
			/>
			<span
				v-if="!isAccentColorValid"
				id="accent-color-validation"
				class="mt-1 block text-xs text-red"
			>
				{{ formatMessage(messages.invalidColor) }}
			</span>
		</div>
	</div>

	<div class="mt-3 flex flex-wrap items-center gap-2">
		<ButtonStyled type="standard">
			<button type="button" @click="openColorPalette">
				<PaletteIcon />
				{{ formatMessage(messages.openPalette) }}
			</button>
		</ButtonStyled>

		<button
			v-for="preset in colorPresets"
			:key="preset.value"
			type="button"
			class="accent-color-swatch"
			:class="{ active: themeStore.accentColor === preset.value }"
			:style="{ backgroundColor: preset.value }"
			:title="preset.name"
			:aria-label="preset.name"
			:aria-pressed="themeStore.accentColor === preset.value"
			@click="chooseAccentColor(preset.value)"
		></button>

		<ButtonStyled type="outlined">
			<button type="button" @click="resetAccentColor">
				{{ formatMessage(messages.resetColor) }}
			</button>
		</ButtonStyled>
	</div>

	<div class="mt-6 flex items-center justify-between">
		<div>
			<h2 class="m-0 text-lg font-semibold text-contrast">
				{{ formatMessage(messages.advancedRenderingTitle) }}
			</h2>
			<p class="m-0 mt-1">
				{{ formatMessage(messages.advancedRenderingDescription) }}
			</p>
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

.theme-mode-option--special {
	min-height: 4.75rem;
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

.theme-mode-option__preview--image {
	width: 5.1rem;
	height: 3.25rem;
	background-position: 72% center;
	background-size: cover;
}

.theme-mode-option--error:hover {
	animation: theme-preview-glitch 180ms steps(2, end) infinite;
}

@keyframes theme-preview-glitch {
	0%,
	100% {
		transform: translate(0);
	}
	40% {
		transform: translate(-1px, 1px);
	}
	70% {
		transform: translate(1px, -1px);
	}
}

.theme-mode-option {
	display: flex;
	align-items: center;
	gap: 0.8rem;
	padding: 0.7rem;
	color: var(--color-text-primary);
	font: inherit;
	font-weight: 700;
	text-align: left;
	background: var(--surface-2);
	border: 1px solid var(--color-button-border);
	border-radius: var(--radius-lg);
	cursor: pointer;
	transition:
		border-color 120ms ease,
		box-shadow 120ms ease,
		transform 120ms ease;
}

.theme-mode-option:hover {
	transform: translateY(-1px);
}

.theme-mode-option.active {
	border-color: var(--color-brand);
	box-shadow: 0 0 0 3px var(--color-brand-highlight);
}

.theme-mode-option__preview {
	display: grid;
	width: 3rem;
	height: 2.4rem;
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

.accent-color-panel {
	display: flex;
	align-items: flex-start;
	gap: 1rem;
	padding: 1rem;
	background: var(--surface-2);
	border: 1px solid var(--color-button-border);
	border-radius: var(--radius-lg);
}

.accent-color-preview {
	width: 4rem;
	height: 4rem;
	flex: 0 0 auto;
	padding: 0.25rem;
	background: var(--color-button-bg);
	border: 1px solid var(--color-button-border);
	border-radius: var(--radius-md);
	cursor: pointer;
	overflow: hidden;
}

.accent-color-preview input {
	width: 100%;
	height: 100%;
	padding: 0;
	background: transparent;
	border: 0;
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
	color: var(--color-text-primary);
	font: inherit;
	font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	font-weight: 600;
	text-transform: uppercase;
	background: var(--color-button-bg);
	border: 1px solid var(--color-button-border);
	border-radius: var(--radius-md);
	outline: none;
}

.accent-color-code:focus {
	border-color: var(--color-brand);
	box-shadow: 0 0 0 3px var(--color-brand-highlight);
}

.accent-color-code.invalid {
	border-color: var(--color-red);
}

.accent-color-swatch {
	width: 2.25rem;
	height: 2.25rem;
	padding: 0;
	border: 2px solid transparent;
	border-radius: 9999px;
	box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.22);
	cursor: pointer;
	transition:
		transform 120ms ease,
		box-shadow 120ms ease;
}

.accent-color-swatch:hover {
	transform: scale(1.08);
}

.accent-color-swatch.active {
	box-shadow:
		0 0 0 2px var(--surface-1),
		0 0 0 4px var(--color-brand);
}
</style>
