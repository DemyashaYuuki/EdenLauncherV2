import { defineStore } from 'pinia'

import asunaBloomBackground from '@/assets/eden/backgrounds/asuna-bloom.webp'
import edenPortalBackground from '@/assets/eden/backgrounds/eden-portal.webp'
import errorSignalBackground from '@/assets/eden/backgrounds/error-signal.webp'

export const DEFAULT_ACCENT_COLOR = '#BC9BFF'
/** Accent used by the standard light palette when the default accent is selected. */
export const DEFAULT_LIGHT_ACCENT_COLOR = '#7140B2'
/** Default accent of EdenLauncher before the Portal redesign. Treated as "not chosen by the user". */
const LEGACY_DEFAULT_ACCENT_COLOR = '#AC58F5'
const LEGACY_THEME_ACCENT_COLORS: Partial<Record<LauncherVisualTheme, string>> = {
	asuna: '#D86C9B',
	error: '#E11D48',
	windows10: '#0078D4',
}

export type EdenPaletteName = 'portal' | 'light' | 'bloom' | 'signal'

export type EdenPalette = {
	canvas: string
	sidebar: string
	surface: string
	surfaceRaised: string
	border: string
	text: string
	textSecondary: string
	accent: string
	onAccent: string
	success: string
	error: string
}

/** Semantic colour roles of the EdenLauncher design system. */
export const EDEN_PALETTES: Record<EdenPaletteName, EdenPalette> = {
	portal: {
		canvas: '#0D0D14',
		sidebar: '#111119',
		surface: '#171720',
		surfaceRaised: '#1E1D2A',
		border: '#32313F',
		text: '#F5F3FA',
		textSecondary: '#AAA8BC',
		accent: '#BC9BFF',
		onAccent: '#201134',
		success: '#8ED9BC',
		error: '#FF9DAD',
	},
	bloom: {
		canvas: '#F7F4F0',
		sidebar: '#FFFCF8',
		surface: '#FFFEFC',
		surfaceRaised: '#F4ECE6',
		border: '#DED5CC',
		text: '#332A28',
		textSecondary: '#70625F',
		accent: '#99513F',
		onAccent: '#FFF9F1',
		success: '#3F6B54',
		error: '#B52D4B',
	},
	signal: {
		canvas: '#101113',
		sidebar: '#131416',
		surface: '#1A1B1E',
		surfaceRaised: '#232427',
		border: '#3A3B3E',
		text: '#F2F0EA',
		textSecondary: '#B7B4AF',
		accent: '#F2F0EA',
		onAccent: '#121315',
		success: '#B9DBC9',
		error: '#FF9D9D',
	},
	light: {
		canvas: '#F3F2F7',
		sidebar: '#FCFBFE',
		surface: '#FFFFFF',
		surfaceRaised: '#F0EEF5',
		border: '#D9D5E3',
		text: '#262231',
		textSecondary: '#655F73',
		accent: '#7140B2',
		onAccent: '#FFFFFF',
		success: '#28694F',
		error: '#B52D4B',
	},
}

/** Accent that each ready-made mode applies when it is selected. */
export const VISUAL_THEME_ACCENTS: Record<Exclude<LauncherVisualTheme, 'custom'>, string> = {
	standard: DEFAULT_ACCENT_COLOR,
	windows10: DEFAULT_ACCENT_COLOR,
	asuna: EDEN_PALETTES.bloom.accent,
	error: EDEN_PALETTES.signal.accent,
}

/** Preset swatches offered in the appearance settings. */
export const ACCENT_SWATCHES = ['#BC9BFF', '#9CC7F2', '#8ED9BC', '#F0CF86', '#FF9DAD'] as const

export const EDEN_BACKGROUNDS = {
	portal: edenPortalBackground,
	bloom: asunaBloomBackground,
	signal: errorSignalBackground,
} as const

const ACCENT_COLOR_STORAGE_KEY = 'edenlauncher-accent-color'
const BASE_THEME_STORAGE_KEY = 'edenlauncher-base-theme'
const VISUAL_THEME_STORAGE_KEY = 'edenlauncher-visual-theme'
const CUSTOM_THEME_STORAGE_KEY = 'edenlauncher-custom-theme'
const WINDOWS_SHORTCUT_GRID_STORAGE_KEY = 'edenlauncher-windows-shortcut-grid'
const ERROR_FX_STORAGE_KEY = 'edenlauncher-error-fx'
const LEGACY_THEME_OPTIONS = ['dark', 'light', 'oled', 'retro', 'system'] as const
const VISUAL_THEME_OPTIONS = ['standard', 'windows10', 'asuna', 'error', 'custom'] as const
const BUTTON_EFFECT_OPTIONS = ['none', 'pulse', 'wave', 'interference'] as const
const ACCENT_COLOR_PATTERN = /^#[0-9A-F]{6}$/
const ACCENT_PALETTE_NAMES = ['red', 'orange', 'green', 'blue', 'purple'] as const
const PLATFORM_COLOR_NAMES = [
	'fabric',
	'quilt',
	'forge',
	'neoforge',
	'liteloader',
	'bukkit',
	'bungeecord',
	'folia',
	'paper',
	'purpur',
	'spigot',
	'velocity',
	'waterfall',
	'sponge',
	'ornithe',
	'bta-babric',
	'nilloader',
] as const

type RgbColor = {
	r: number
	g: number
	b: number
}

const WHITE: RgbColor = { r: 255, g: 255, b: 255 }
const BLACK: RgbColor = { r: 0, g: 0, b: 0 }

export const DEFAULT_FEATURE_FLAGS = {
	project_background: false,
	page_path: false,
	worlds_in_home: true,
	server_project_qa: false,
	show_version_environment_column: false,
	server_ram_as_bytes_always_on: false,
	always_show_app_controls: false,
	skip_non_essential_warnings: false,
	skip_unknown_pack_warning: false,
	pride_fundraiser: true,
	i18n_debug: false,
	show_instance_play_time: true,
	advanced_filters_collapsed: true,
	always_show_copy_details: false,
	hide_installed_modpacks: false,
}

export type FeatureFlag = keyof typeof DEFAULT_FEATURE_FLAGS
export type FeatureFlags = Record<FeatureFlag, boolean>
// Old values remain readable for compatibility with existing settings files.
export type ColorTheme = (typeof LEGACY_THEME_OPTIONS)[number]
export type LauncherTheme = 'dark' | 'light'
export type LauncherVisualTheme = (typeof VISUAL_THEME_OPTIONS)[number]
export type LauncherButtonEffect = (typeof BUTTON_EFFECT_OPTIONS)[number]

export type CustomLauncherTheme = {
	name: string
	backgroundDataUrl: string
	accentColor: string
	baseTheme: LauncherTheme
	buttonEffect: LauncherButtonEffect
}

export const DEFAULT_CUSTOM_THEME: CustomLauncherTheme = {
	name: 'Моя тема',
	backgroundDataUrl: '',
	accentColor: DEFAULT_ACCENT_COLOR,
	baseTheme: 'dark',
	buttonEffect: 'pulse',
}

export type ThemeStore = {
	selectedTheme: ColorTheme
	visualTheme: LauncherVisualTheme
	accentColor: string
	customTheme: CustomLauncherTheme
	windowsShortcutGrid: boolean
	/** Screen interference and the ERROR wordmark of the Error / Signal mode. */
	errorFxEnabled: boolean
	advancedRendering: boolean
	hideNametagSkinsPage: boolean
	/** Mirrors the OS colour scheme so "system" mode stays reactive. */
	systemPrefersLight: boolean

	devMode: boolean
	featureFlags: FeatureFlags
}

export const DEFAULT_THEME_STORE: ThemeStore = {
	selectedTheme: 'dark',
	visualTheme: 'standard',
	accentColor: DEFAULT_ACCENT_COLOR,
	customTheme: DEFAULT_CUSTOM_THEME,
	windowsShortcutGrid: true,
	errorFxEnabled: true,
	advancedRendering: true,
	hideNametagSkinsPage: false,
	systemPrefersLight: false,

	devMode: false,
	featureFlags: DEFAULT_FEATURE_FLAGS,
}

export function normalizeAccentColor(color: string): string | null {
	const normalized = color.trim().toUpperCase()
	return ACCENT_COLOR_PATTERN.test(normalized) ? normalized : null
}

function normalizeCustomTheme(value: unknown): CustomLauncherTheme | null {
	if (!value || typeof value !== 'object') return null

	const candidate = value as Partial<CustomLauncherTheme>
	const accentColor = normalizeAccentColor(candidate.accentColor ?? '')
	if (!accentColor) return null

	return {
		name: candidate.name?.trim().slice(0, 40) || DEFAULT_CUSTOM_THEME.name,
		backgroundDataUrl:
			typeof candidate.backgroundDataUrl === 'string' ? candidate.backgroundDataUrl : '',
		accentColor,
		baseTheme: candidate.baseTheme === 'light' ? 'light' : 'dark',
		buttonEffect: BUTTON_EFFECT_OPTIONS.includes(candidate.buttonEffect as LauncherButtonEffect)
			? (candidate.buttonEffect as LauncherButtonEffect)
			: DEFAULT_CUSTOM_THEME.buttonEffect,
	}
}

function hexToRgb(color: string): RgbColor {
	return {
		r: Number.parseInt(color.slice(1, 3), 16),
		g: Number.parseInt(color.slice(3, 5), 16),
		b: Number.parseInt(color.slice(5, 7), 16),
	}
}

function rgbToHex({ r, g, b }: RgbColor): string {
	return `#${[r, g, b]
		.map((channel) => Math.round(channel).toString(16).padStart(2, '0'))
		.join('')}`.toUpperCase()
}

function mixColor(color: RgbColor, target: RgbColor, amount: number): RgbColor {
	return {
		r: color.r + (target.r - color.r) * amount,
		g: color.g + (target.g - color.g) * amount,
		b: color.b + (target.b - color.b) * amount,
	}
}

function rgba(color: RgbColor, alpha: number): string {
	return `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${alpha})`
}

function relativeLuminance(color: RgbColor): number {
	const [red, green, blue] = [color.r, color.g, color.b].map((channel) => {
		const normalized = channel / 255
		return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
	})

	return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function buildAccentPalette(accent: RgbColor): Record<number, RgbColor> {
	return {
		50: mixColor(accent, WHITE, 0.92),
		100: mixColor(accent, WHITE, 0.84),
		200: mixColor(accent, WHITE, 0.68),
		300: mixColor(accent, WHITE, 0.48),
		400: mixColor(accent, WHITE, 0.24),
		500: accent,
		600: mixColor(accent, BLACK, 0.14),
		700: mixColor(accent, BLACK, 0.3),
		800: mixColor(accent, BLACK, 0.45),
		900: mixColor(accent, BLACK, 0.6),
		950: mixColor(accent, BLACK, 0.74),
	}
}

function contrastRatio(first: RgbColor, second: RgbColor): number {
	const a = relativeLuminance(first)
	const b = relativeLuminance(second)
	return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/** Darkens (or lightens) a colour until it reaches the requested contrast against a surface. */
function ensureContrast(color: RgbColor, surface: RgbColor, minimum: number): RgbColor {
	if (contrastRatio(color, surface) >= minimum) return color
	const target = relativeLuminance(surface) > 0.4 ? BLACK : WHITE
	for (let amount = 0.05; amount <= 1; amount += 0.05) {
		const candidate = mixColor(color, target, amount)
		if (contrastRatio(candidate, surface) >= minimum) return candidate
	}
	return target
}

function setCssVariable(
	root: HTMLElement,
	name: string,
	value: string,
	priority: '' | 'important' = '',
) {
	root.style.setProperty(name, value, priority)
}

let systemThemeListenerInstalled = false

function normalizeLauncherTheme(theme: ColorTheme): LauncherTheme {
	if (theme === 'light') return 'light'
	if (theme === 'system' && typeof window !== 'undefined') {
		return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
	}
	return 'dark'
}

/** Picks the design palette for a visual mode and the resolved light/dark base. */
export function resolvePaletteName(
	visualTheme: LauncherVisualTheme,
	theme: LauncherTheme,
): EdenPaletteName {
	if (visualTheme === 'asuna') return 'bloom'
	if (visualTheme === 'error') return 'signal'
	if (visualTheme === 'windows10') return 'portal'
	return theme === 'light' ? 'light' : 'portal'
}

/**
 * Colour a button really gets. The default dark accent is swapped for the
 * darker light-palette accent so the light mode keeps readable controls.
 */
export function resolveAccentForPalette(color: string, paletteName: EdenPaletteName): string {
	const normalized = normalizeAccentColor(color) ?? EDEN_PALETTES[paletteName].accent
	if (paletteName === 'light' && normalized === DEFAULT_ACCENT_COLOR)
		return DEFAULT_LIGHT_ACCENT_COLOR
	return normalized
}

/** Text colour placed on top of an accent-coloured button. */
export function textOnAccent(color: string, paletteName: EdenPaletteName): string {
	const palette = EDEN_PALETTES[paletteName]
	const normalized = normalizeAccentColor(color)
	if (!normalized) return palette.onAccent
	if (normalized === palette.accent) return palette.onAccent
	const accent = hexToRgb(normalized)
	const darkText = mixColor(hexToRgb('#0D0B14'), accent, 0.12)
	return contrastRatio(darkText, accent) >= contrastRatio(WHITE, accent)
		? rgbToHex(darkText)
		: '#FFFFFF'
}

export function applyAccentColor(
	color: string,
	theme: LauncherTheme = 'dark',
	paletteName: EdenPaletteName = theme === 'light' ? 'light' : 'portal',
): boolean {
	const requested = normalizeAccentColor(color)
	if (!requested || typeof document === 'undefined') return false

	const root = document.documentElement
	const palette = EDEN_PALETTES[paletteName]
	const isLight = relativeLuminance(hexToRgb(palette.canvas)) > 0.4
	const normalized = resolveAccentForPalette(requested, paletteName)
	const accent = hexToRgb(normalized)
	const shades = buildAccentPalette(accent)
	const canvas = hexToRgb(palette.canvas)
	const surface = hexToRgb(palette.surface)
	const raised = hexToRgb(palette.surfaceRaised)
	const border = hexToRgb(palette.border)
	const text = hexToRgb(palette.text)
	const textSecondary = hexToRgb(palette.textSecondary)
	const success = hexToRgb(palette.success)
	const error = hexToRgb(palette.error)
	// Accent used as text/icon colour: must stay readable on cards.
	const accentText = ensureContrast(accent, surface, 4.5)
	const onAccent = textOnAccent(normalized, paletteName)
	const accentHover = mixColor(accent, isLight ? BLACK : WHITE, isLight ? 0.1 : 0.16)
	const accentPressed = mixColor(accent, BLACK, isLight ? 0.22 : 0.12)

	root.dataset.accentColor = normalized
	root.dataset.launcherTheme = isLight ? 'light' : 'dark'
	root.dataset.edenPalette = paletteName
	root.style.colorScheme = isLight ? 'light' : 'dark'

	// Eden semantic tokens (used by the redesigned components).
	setCssVariable(root, '--eden-canvas', palette.canvas)
	setCssVariable(root, '--eden-sidebar', palette.sidebar)
	setCssVariable(root, '--eden-surface', palette.surface)
	setCssVariable(root, '--eden-surface-raised', palette.surfaceRaised)
	setCssVariable(root, '--eden-border', palette.border)
	setCssVariable(root, '--eden-border-strong', rgbToHex(mixColor(border, text, 0.18)))
	setCssVariable(root, '--eden-text', palette.text)
	setCssVariable(root, '--eden-text-secondary', palette.textSecondary)
	setCssVariable(root, '--eden-accent', normalized)
	setCssVariable(root, '--eden-accent-hover', rgbToHex(accentHover))
	setCssVariable(root, '--eden-accent-pressed', rgbToHex(accentPressed))
	setCssVariable(root, '--eden-accent-text', rgbToHex(accentText))
	setCssVariable(root, '--eden-accent-soft', rgba(accent, isLight ? 0.12 : 0.14))
	setCssVariable(root, '--eden-accent-soft-strong', rgba(accent, isLight ? 0.2 : 0.24))
	setCssVariable(root, '--eden-on-accent', onAccent)
	setCssVariable(root, '--eden-success', palette.success)
	setCssVariable(root, '--eden-success-soft', rgba(success, isLight ? 0.12 : 0.14))
	setCssVariable(root, '--eden-error', palette.error)
	setCssVariable(root, '--eden-error-soft', rgba(error, isLight ? 0.1 : 0.14))
	setCssVariable(root, '--eden-focus', rgbToHex(ensureContrast(accent, canvas, 3)))
	setCssVariable(root, '--eden-shadow', isLight ? 'rgba(52, 40, 66, 0.08)' : 'rgba(0, 0, 0, 0.28)')

	for (const paletteKey of ACCENT_PALETTE_NAMES) {
		const base = paletteKey === 'red' ? error : paletteKey === 'green' ? success : accent
		const baseHex = rgbToHex(base)
		for (const [shade, shadeColor] of Object.entries(buildAccentPalette(base))) {
			setCssVariable(root, `--color-${paletteKey}-${shade}`, rgbToHex(shadeColor))
		}
		setCssVariable(
			root,
			`--color-${paletteKey}`,
			paletteKey === 'red' || paletteKey === 'green' ? baseHex : rgbToHex(accentText),
		)
		setCssVariable(root, `--color-${paletteKey}-highlight`, rgba(base, 0.22))
		setCssVariable(root, `--color-${paletteKey}-bg`, rgba(base, 0.14))
	}

	setCssVariable(root, '--surface-1', palette.canvas)
	setCssVariable(root, '--surface-1-5', palette.sidebar)
	setCssVariable(root, '--surface-2', rgbToHex(mixColor(canvas, surface, 0.55)))
	setCssVariable(root, '--surface-2-5', rgbToHex(mixColor(canvas, surface, 0.8)))
	setCssVariable(root, '--surface-3', palette.surface)
	setCssVariable(root, '--surface-4', palette.surfaceRaised)
	setCssVariable(root, '--surface-5', palette.border)

	setCssVariable(root, '--color-text-primary', palette.text)
	setCssVariable(root, '--color-text-default', rgbToHex(mixColor(text, textSecondary, 0.35)))
	setCssVariable(root, '--color-text-secondary', rgbToHex(mixColor(text, textSecondary, 0.6)))
	setCssVariable(root, '--color-text-tertiary', palette.textSecondary)
	setCssVariable(root, '--color-bg', 'var(--surface-1)')
	setCssVariable(root, '--color-raised-bg', 'var(--surface-3)')
	setCssVariable(root, '--color-super-raised-bg', 'var(--surface-4)')
	setCssVariable(root, '--color-button-bg', 'var(--surface-4)')
	setCssVariable(root, '--color-button-border', palette.border)
	setCssVariable(root, '--color-scrollbar', rgbToHex(mixColor(border, text, isLight ? 0.12 : 0.18)))
	setCssVariable(root, '--color-divider', palette.border)
	setCssVariable(root, '--color-divider-dark', rgbToHex(mixColor(border, text, 0.16)))
	setCssVariable(root, '--color-base', 'var(--color-text-default)')
	setCssVariable(root, '--color-secondary', 'var(--color-text-tertiary)')
	setCssVariable(root, '--color-contrast', 'var(--color-text-primary)')
	setCssVariable(root, '--color-accent-contrast', onAccent)
	setCssVariable(root, '--color-gray', palette.textSecondary)
	setCssVariable(root, '--color-gray-highlight', rgba(textSecondary, 0.18))

	setCssVariable(root, '--color-brand', normalized)
	setCssVariable(root, '--color-brand-highlight', rgba(accent, isLight ? 0.16 : 0.2))
	setCssVariable(root, '--color-brand-shadow', rgba(accent, 0.45))
	setCssVariable(root, '--color-button-bg-selected', rgba(accent, isLight ? 0.14 : 0.2))
	setCssVariable(root, '--color-button-text-selected', rgbToHex(accentText))
	setCssVariable(root, '--color-link', rgbToHex(accentText), 'important')
	setCssVariable(
		root,
		'--color-link-hover',
		rgbToHex(mixColor(accentText, isLight ? BLACK : WHITE, 0.15)),
		'important',
	)
	setCssVariable(
		root,
		'--color-link-active',
		rgbToHex(mixColor(accentText, isLight ? BLACK : WHITE, 0.28)),
		'important',
	)
	setCssVariable(root, '--color-focus-ring', rgbToHex(ensureContrast(accent, canvas, 3)))
	setCssVariable(root, '--color-tooltip-bg', isLight ? palette.text : palette.surfaceRaised)
	setCssVariable(root, '--color-tooltip-text', isLight ? palette.surface : palette.text)
	setCssVariable(root, '--color-ad', rgba(shades[700], 0.2))
	setCssVariable(root, '--color-ad-raised', rgba(shades[400], 0.34))
	setCssVariable(root, '--color-ad-highlight', rgbToHex(accentText))

	setCssVariable(
		root,
		'--loading-bar-gradient',
		`linear-gradient(90deg, ${normalized} 0%, ${rgbToHex(accentHover)} 100%)`,
	)
	setCssVariable(
		root,
		'--color-gradient-button-bg',
		`linear-gradient(180deg, ${palette.surfaceRaised} 0%, ${palette.surfaceRaised} 100%)`,
	)
	setCssVariable(
		root,
		'--brand-gradient-bg',
		`linear-gradient(0deg, ${rgba(canvas, 0.98)}, ${rgba(raised, 0.9)})`,
	)
	setCssVariable(
		root,
		'--brand-gradient-strong-bg',
		`linear-gradient(270deg, ${palette.canvas} 10%, ${palette.surfaceRaised} 100%)`,
	)
	setCssVariable(root, '--brand-gradient-button', rgba(accent, 0.12))
	setCssVariable(root, '--brand-gradient-border', palette.border)
	setCssVariable(
		root,
		'--brand-gradient-fade-out-color',
		`linear-gradient(to bottom, ${rgba(canvas, 0)}, ${palette.canvas} 80%)`,
	)

	PLATFORM_COLOR_NAMES.forEach((platform, index) => {
		const platformShades = [300, 400, 500, 600] as const
		setCssVariable(
			root,
			`--color-platform-${platform}`,
			rgbToHex(ensureContrast(shades[platformShades[index % platformShades.length]], surface, 3)),
		)
	})

	return true
}

/** Accent that should replace a stored value from the previous design, or null to keep it. */
function migrateStoredAccent(
	color: string | null,
	visualTheme: LauncherVisualTheme,
): string | null {
	const normalized = color ? normalizeAccentColor(color) : null
	if (!normalized) return null
	if (normalized === LEGACY_DEFAULT_ACCENT_COLOR) {
		return visualTheme === 'custom' ? null : VISUAL_THEME_ACCENTS[visualTheme]
	}
	if (visualTheme !== 'custom' && LEGACY_THEME_ACCENT_COLORS[visualTheme] === normalized) {
		return VISUAL_THEME_ACCENTS[visualTheme]
	}
	return null
}

export const useTheming = defineStore('themeStore', {
	state: (): ThemeStore => ({
		...DEFAULT_THEME_STORE,
		customTheme: { ...DEFAULT_CUSTOM_THEME },
		featureFlags: { ...DEFAULT_FEATURE_FLAGS },
	}),
	getters: {
		/** Light or dark base after resolving the "system" preference. */
		resolvedTheme(state): LauncherTheme {
			if (state.selectedTheme === 'system') return state.systemPrefersLight ? 'light' : 'dark'
			return state.selectedTheme === 'light' ? 'light' : 'dark'
		},
		/** Error effects are drawn only while the Error / Signal mode is selected. */
		errorFxActive(state): boolean {
			return state.visualTheme === 'error' && state.errorFxEnabled
		},
		paletteName(): EdenPaletteName {
			return resolvePaletteName(this.visualTheme, this.resolvedTheme)
		},
	},
	actions: {
		initializeTheme() {
			try {
				this.errorFxEnabled = window.localStorage.getItem(ERROR_FX_STORAGE_KEY) !== 'false'
			} catch (error) {
				console.warn('Could not read the Error effects setting.', error)
			}
			try {
				this.windowsShortcutGrid =
					window.localStorage.getItem(WINDOWS_SHORTCUT_GRID_STORAGE_KEY) !== 'false'
			} catch (error) {
				console.warn('Could not read the Windows shortcut grid setting.', error)
			}
			try {
				const windowsBackground = window.localStorage.getItem(
					'edenlauncher-windows-desktop-background',
				)
				if (windowsBackground) {
					document.documentElement.style.setProperty(
						'--windows-desktop-background-image',
						`url(${JSON.stringify(windowsBackground)})`,
					)
				}
			} catch (error) {
				console.warn('Could not read the Windows desktop background.', error)
			}
			let savedTheme: ColorTheme = 'dark'
			try {
				const storedTheme = window.localStorage.getItem(BASE_THEME_STORAGE_KEY)
				savedTheme = storedTheme === 'light' || storedTheme === 'system' ? storedTheme : 'dark'
			} catch (error) {
				console.warn('Could not read the saved EdenLauncher theme.', error)
			}
			this.selectedTheme = savedTheme

			try {
				const storedCustomTheme = window.localStorage.getItem(CUSTOM_THEME_STORAGE_KEY)
				if (storedCustomTheme) {
					const customTheme = normalizeCustomTheme(JSON.parse(storedCustomTheme))
					if (customTheme) this.customTheme = customTheme
				}
			} catch (error) {
				console.warn('Could not read the saved EdenLauncher custom theme.', error)
			}

			let savedVisualTheme: LauncherVisualTheme = 'standard'
			try {
				const storedVisualTheme = window.localStorage.getItem(VISUAL_THEME_STORAGE_KEY)
				if (VISUAL_THEME_OPTIONS.includes(storedVisualTheme as LauncherVisualTheme)) {
					savedVisualTheme = storedVisualTheme as LauncherVisualTheme
				}
			} catch (error) {
				console.warn('Could not read the saved EdenLauncher visual theme.', error)
			}
			this.visualTheme = savedVisualTheme
			if (savedVisualTheme === 'custom') {
				this.selectedTheme = this.customTheme.baseTheme
				this.accentColor = this.customTheme.accentColor
			}
			this.setThemeClass(false)
			const systemQuery = window.matchMedia('(prefers-color-scheme: light)')
			this.systemPrefersLight = systemQuery.matches
			if (!systemThemeListenerInstalled) {
				systemThemeListenerInstalled = true
				systemQuery.addEventListener('change', (event) => {
					this.systemPrefersLight = event.matches
					if (this.selectedTheme === 'system') this.setThemeClass(true)
				})
			}

			let savedColor: string | null = null
			try {
				savedColor = window.localStorage.getItem(ACCENT_COLOR_STORAGE_KEY)
			} catch (error) {
				console.warn('Could not read the saved EdenLauncher color.', error)
			}
			// Accents that were only the previous design's defaults move to the new palette.
			// A colour the user picked on purpose is kept as is.
			const migratedColor = migrateStoredAccent(savedColor, savedVisualTheme)

			this.setAccentColor(
				savedVisualTheme === 'custom'
					? this.customTheme.accentColor
					: (migratedColor ?? savedColor ?? VISUAL_THEME_ACCENTS[savedVisualTheme]),
			)
		},
		setThemeState(newTheme: ColorTheme) {
			this.selectedTheme =
				newTheme === 'light' || newTheme === 'system' || newTheme === 'dark' ? newTheme : 'dark'
			this.setThemeClass(true)

			try {
				window.localStorage.setItem(BASE_THEME_STORAGE_KEY, this.selectedTheme)
			} catch (error) {
				console.warn('Could not save the EdenLauncher theme.', error)
			}
		},
		setThemeClass(animate = false) {
			if (typeof document === 'undefined') return

			const html = document.documentElement
			if (animate) {
				html.classList.remove('theme-transitioning')
				void html.offsetWidth
				html.classList.add('theme-transitioning')
				window.setTimeout(() => html.classList.remove('theme-transitioning'), 520)
			}
			for (const theme of LEGACY_THEME_OPTIONS) {
				html.classList.remove(theme, `${theme}-mode`)
			}
			for (const theme of VISUAL_THEME_OPTIONS) {
				html.classList.remove(`theme-${theme}`)
			}
			html.removeAttribute('data-theme')
			const resolvedTheme = normalizeLauncherTheme(this.selectedTheme)
			html.classList.add(`${resolvedTheme}-mode`)
			html.classList.add(`theme-${this.visualTheme}`)
			html.dataset.visualTheme = this.visualTheme
			html.dataset.themePreference = this.selectedTheme
			const paletteName = resolvePaletteName(this.visualTheme, resolvedTheme)
			let heroImage: string = EDEN_BACKGROUNDS.portal
			if (paletteName === 'bloom') heroImage = EDEN_BACKGROUNDS.bloom
			if (paletteName === 'signal') heroImage = EDEN_BACKGROUNDS.signal
			if (this.visualTheme === 'custom') {
				html.dataset.buttonEffect = this.customTheme.buttonEffect
				if (this.customTheme.backgroundDataUrl) {
					heroImage = this.customTheme.backgroundDataUrl
					html.style.setProperty(
						'--custom-theme-background-image',
						`url(${JSON.stringify(this.customTheme.backgroundDataUrl)})`,
					)
				} else {
					html.style.removeProperty('--custom-theme-background-image')
				}
			} else {
				html.removeAttribute('data-button-effect')
				html.style.removeProperty('--custom-theme-background-image')
			}
			// Text on the hero stays light on dark artwork and dark on the light Bloom/custom art.
			html.dataset.errorFx = this.visualTheme === 'error' && this.errorFxEnabled ? 'on' : 'off'
			html.dataset.heroTone =
				paletteName === 'bloom' ||
				(this.visualTheme === 'custom' &&
					resolvedTheme === 'light' &&
					!!this.customTheme.backgroundDataUrl)
					? 'light'
					: 'dark'
			html.style.setProperty('--eden-hero-image', `url(${JSON.stringify(heroImage)})`)
			applyAccentColor(this.accentColor, resolvedTheme, paletteName)
		},
		setVisualTheme(newTheme: LauncherVisualTheme) {
			if (!VISUAL_THEME_OPTIONS.includes(newTheme)) return

			this.visualTheme = newTheme
			if (newTheme === 'asuna') {
				this.selectedTheme = 'light'
				this.accentColor = VISUAL_THEME_ACCENTS.asuna
			} else if (newTheme === 'error') {
				this.selectedTheme = 'dark'
				this.accentColor = VISUAL_THEME_ACCENTS.error
			} else if (newTheme === 'windows10') {
				this.selectedTheme = 'dark'
				this.accentColor = VISUAL_THEME_ACCENTS.windows10
			} else if (newTheme === 'standard') {
				// Leaving a ready-made mode restores the Eden accent instead of keeping its colour.
				const previousModeAccents = [VISUAL_THEME_ACCENTS.asuna, VISUAL_THEME_ACCENTS.error]
				if (previousModeAccents.includes(this.accentColor)) this.accentColor = DEFAULT_ACCENT_COLOR
			} else if (newTheme === 'custom') {
				this.selectedTheme = this.customTheme.baseTheme
				this.accentColor = this.customTheme.accentColor
			}
			this.setThemeClass(true)
			try {
				window.localStorage.setItem(VISUAL_THEME_STORAGE_KEY, newTheme)
				window.localStorage.setItem(BASE_THEME_STORAGE_KEY, this.selectedTheme)
				window.localStorage.setItem(ACCENT_COLOR_STORAGE_KEY, this.accentColor)
			} catch (error) {
				console.warn('Could not save the EdenLauncher visual theme.', error)
			}
		},
		saveCustomTheme(newTheme: CustomLauncherTheme) {
			const normalized = normalizeCustomTheme(newTheme)
			if (!normalized) return false

			try {
				window.localStorage.setItem(CUSTOM_THEME_STORAGE_KEY, JSON.stringify(normalized))
			} catch (error) {
				console.warn('Could not save the EdenLauncher custom theme.', error)
				return false
			}

			this.customTheme = normalized
			this.setVisualTheme('custom')
			return true
		},
		setAccentColor(newColor: string) {
			const normalized = normalizeAccentColor(newColor)
			if (!normalized) return false

			this.accentColor = normalized
			const resolvedTheme = normalizeLauncherTheme(this.selectedTheme)
			applyAccentColor(
				normalized,
				resolvedTheme,
				resolvePaletteName(this.visualTheme, resolvedTheme),
			)

			try {
				window.localStorage.setItem(ACCENT_COLOR_STORAGE_KEY, normalized)
			} catch (error) {
				console.warn('Could not save the EdenLauncher color.', error)
			}

			return true
		},
		setErrorFxEnabled(enabled: boolean) {
			this.errorFxEnabled = enabled
			document.documentElement.dataset.errorFx =
				this.visualTheme === 'error' && enabled ? 'on' : 'off'
			try {
				window.localStorage.setItem(ERROR_FX_STORAGE_KEY, String(enabled))
			} catch (error) {
				console.warn('Could not save the Error effects setting.', error)
			}
		},
		setWindowsShortcutGrid(enabled: boolean) {
			this.windowsShortcutGrid = enabled
			try {
				window.localStorage.setItem(WINDOWS_SHORTCUT_GRID_STORAGE_KEY, String(enabled))
			} catch (error) {
				console.warn('Could not save the Windows shortcut grid setting.', error)
			}
		},
		resetAccentColor() {
			this.setAccentColor(DEFAULT_ACCENT_COLOR)
		},
		resetToDefaults() {
			this.visualTheme = 'standard'
			this.selectedTheme = 'dark'
			this.accentColor = DEFAULT_ACCENT_COLOR
			this.customTheme = { ...DEFAULT_CUSTOM_THEME }
			this.windowsShortcutGrid = true
			this.errorFxEnabled = true
			this.setThemeClass(true)

			try {
				window.localStorage.setItem(VISUAL_THEME_STORAGE_KEY, 'standard')
				window.localStorage.setItem(BASE_THEME_STORAGE_KEY, 'dark')
				window.localStorage.setItem(ACCENT_COLOR_STORAGE_KEY, DEFAULT_ACCENT_COLOR)
				window.localStorage.removeItem(CUSTOM_THEME_STORAGE_KEY)
				window.localStorage.setItem(WINDOWS_SHORTCUT_GRID_STORAGE_KEY, 'true')
				window.localStorage.removeItem(ERROR_FX_STORAGE_KEY)
			} catch (error) {
				console.warn('Could not reset the EdenLauncher theme.', error)
			}
		},
		getFeatureFlag(key: FeatureFlag) {
			return this.featureFlags[key] ?? DEFAULT_FEATURE_FLAGS[key]
		},
	},
})
