import { defineStore } from 'pinia'

export const DEFAULT_ACCENT_COLOR = '#AC58F5'

const ACCENT_COLOR_STORAGE_KEY = 'edenlauncher-accent-color'
const BASE_THEME_STORAGE_KEY = 'edenlauncher-base-theme'
const LEGACY_THEME_OPTIONS = ['dark', 'light', 'oled', 'retro', 'system'] as const
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

export type ThemeStore = {
	selectedTheme: ColorTheme
	accentColor: string
	advancedRendering: boolean
	hideNametagSkinsPage: boolean

	devMode: boolean
	featureFlags: FeatureFlags
}

export const DEFAULT_THEME_STORE: ThemeStore = {
	selectedTheme: 'dark',
	accentColor: DEFAULT_ACCENT_COLOR,
	advancedRendering: true,
	hideNametagSkinsPage: false,

	devMode: false,
	featureFlags: DEFAULT_FEATURE_FLAGS,
}

export function normalizeAccentColor(color: string): string | null {
	const normalized = color.trim().toUpperCase()
	return ACCENT_COLOR_PATTERN.test(normalized) ? normalized : null
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

function readableTextColor(color: RgbColor): string {
	const luminance = relativeLuminance(color)
	const whiteContrast = 1.05 / (luminance + 0.05)
	const darkContrast = (luminance + 0.05) / 0.05
	return whiteContrast >= darkContrast ? '#FFFFFF' : '#09060D'
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

function setCssVariable(
	root: HTMLElement,
	name: string,
	value: string,
	priority: '' | 'important' = '',
) {
	root.style.setProperty(name, value, priority)
}

function normalizeLauncherTheme(theme: ColorTheme): LauncherTheme {
	return theme === 'light' ? 'light' : 'dark'
}

export function applyAccentColor(color: string, theme: LauncherTheme = 'dark'): boolean {
	const normalized = normalizeAccentColor(color)
	if (!normalized || typeof document === 'undefined') return false

	const root = document.documentElement
	const accent = hexToRgb(normalized)
	const palette = buildAccentPalette(accent)
	const isLight = theme === 'light'
	const base = hexToRgb(isLight ? '#F7F5FA' : '#09060D')
	const surfaceMixes = isLight
		? [0.018, 0.012, 0.006, 0.025, 0.04, 0.07]
		: [0.04, 0.055, 0.075, 0.095, 0.125, 0.17]
	const surfaces = surfaceMixes.map((amount) => mixColor(base, accent, amount))
	const shadeEntries = Object.entries(palette)

	root.dataset.accentColor = normalized
	root.dataset.launcherTheme = theme
	root.style.colorScheme = theme

	for (const paletteName of ACCENT_PALETTE_NAMES) {
		for (const [shade, shadeColor] of shadeEntries) {
			setCssVariable(root, `--color-${paletteName}-${shade}`, rgbToHex(shadeColor))
		}
		setCssVariable(root, `--color-${paletteName}`, normalized)
		setCssVariable(root, `--color-${paletteName}-highlight`, rgba(accent, 0.27))
		setCssVariable(root, `--color-${paletteName}-bg`, rgba(accent, 0.16))
	}

	setCssVariable(root, '--surface-1', rgbToHex(surfaces[0]))
	setCssVariable(root, '--surface-1-5', rgbToHex(surfaces[1]))
	setCssVariable(root, '--surface-2', isLight ? '#FFFFFF' : rgbToHex(surfaces[2]))
	setCssVariable(root, '--surface-2-5', rgbToHex(surfaces[3]))
	setCssVariable(root, '--surface-3', isLight ? '#FFFFFF' : rgbToHex(surfaces[4]))
	setCssVariable(root, '--surface-4', isLight ? '#FFFFFF' : rgbToHex(surfaces[5]))
	setCssVariable(root, '--surface-5', rgbToHex(mixColor(base, accent, isLight ? 0.14 : 0.24)))

	setCssVariable(root, '--color-text-primary', isLight ? '#18121D' : '#FFFAFF')
	setCssVariable(
		root,
		'--color-text-default',
		isLight
			? rgbToHex(mixColor(hexToRgb('#39333F'), accent, 0.07))
			: rgbToHex(mixColor(WHITE, accent, 0.14)),
	)
	setCssVariable(
		root,
		'--color-text-tertiary',
		isLight
			? rgbToHex(mixColor(hexToRgb('#716A77'), accent, 0.09))
			: rgbToHex(mixColor(WHITE, accent, 0.32)),
	)
	setCssVariable(root, '--color-bg', 'var(--surface-1)')
	setCssVariable(root, '--color-raised-bg', 'var(--surface-3)')
	setCssVariable(root, '--color-super-raised-bg', 'var(--surface-4)')
	setCssVariable(root, '--color-button-bg', 'var(--surface-4)')
	setCssVariable(root, '--color-button-border', rgba(isLight ? palette[700] : palette[300], 0.2))
	setCssVariable(root, '--color-scrollbar', rgbToHex(isLight ? palette[300] : palette[800]))
	setCssVariable(
		root,
		'--color-divider',
		rgba(isLight ? palette[700] : palette[400], isLight ? 0.16 : 0.18),
	)
	setCssVariable(root, '--color-divider-dark', rgba(isLight ? palette[800] : palette[300], 0.28))
	setCssVariable(root, '--color-base', 'var(--color-text-default)')
	setCssVariable(root, '--color-secondary', 'var(--color-text-tertiary)')
	setCssVariable(root, '--color-contrast', 'var(--color-text-primary)')
	setCssVariable(root, '--color-accent-contrast', readableTextColor(accent))
	setCssVariable(
		root,
		'--color-gray',
		rgbToHex(mixColor(isLight ? hexToRgb('#6F6874') : WHITE, accent, isLight ? 0.12 : 0.42)),
	)
	setCssVariable(root, '--color-gray-highlight', rgba(accent, 0.2))

	setCssVariable(root, '--color-brand', normalized)
	setCssVariable(root, '--color-brand-highlight', rgba(accent, 0.26))
	setCssVariable(root, '--color-brand-shadow', rgba(accent, 0.62))
	setCssVariable(root, '--color-button-bg-selected', rgba(accent, 0.24))
	setCssVariable(
		root,
		'--color-button-text-selected',
		rgbToHex(isLight ? palette[700] : palette[300]),
	)
	setCssVariable(root, '--color-link', rgbToHex(isLight ? palette[700] : palette[300]), 'important')
	setCssVariable(
		root,
		'--color-link-hover',
		rgbToHex(isLight ? palette[600] : palette[200]),
		'important',
	)
	setCssVariable(
		root,
		'--color-link-active',
		rgbToHex(isLight ? palette[800] : palette[100]),
		'important',
	)
	setCssVariable(root, '--color-focus-ring', rgbToHex(isLight ? palette[600] : palette[300]))
	setCssVariable(root, '--color-tooltip-bg', 'var(--surface-4)')
	setCssVariable(root, '--color-tooltip-text', isLight ? '#18121D' : '#FFFAFF')
	setCssVariable(root, '--color-ad', rgba(palette[700], 0.2))
	setCssVariable(root, '--color-ad-raised', rgba(palette[400], 0.34))
	setCssVariable(root, '--color-ad-highlight', rgbToHex(palette[400]))

	setCssVariable(
		root,
		'--loading-bar-gradient',
		`linear-gradient(90deg, ${rgbToHex(palette[800])} 0%, ${rgbToHex(palette[300])} 55%, ${rgbToHex(palette[600])} 100%)`,
	)
	setCssVariable(
		root,
		'--color-gradient-button-bg',
		`linear-gradient(180deg, ${isLight ? '#FFFFFF' : rgbToHex(surfaces[5])} 0%, ${rgbToHex(surfaces[4])} 100%)`,
	)
	setCssVariable(
		root,
		'--brand-gradient-bg',
		isLight
			? `linear-gradient(0deg, ${rgba(surfaces[0], 0.98)}, ${rgba(palette[100], 0.68)})`
			: `linear-gradient(0deg, ${rgba(surfaces[0], 0.97)}, ${rgba(palette[800], 0.58)})`,
	)
	setCssVariable(
		root,
		'--brand-gradient-strong-bg',
		`linear-gradient(270deg, ${rgbToHex(surfaces[0])} 10%, ${isLight ? '#FFFFFF' : rgbToHex(surfaces[5])} 100%)`,
	)
	setCssVariable(root, '--brand-gradient-button', rgba(accent, 0.12))
	setCssVariable(root, '--brand-gradient-border', rgba(palette[300], 0.18))
	setCssVariable(
		root,
		'--brand-gradient-fade-out-color',
		`linear-gradient(to bottom, ${rgba(surfaces[0], 0)}, ${rgbToHex(surfaces[0])} 80%)`,
	)

	PLATFORM_COLOR_NAMES.forEach((platform, index) => {
		const shades = [300, 400, 500, 600] as const
		setCssVariable(
			root,
			`--color-platform-${platform}`,
			rgbToHex(palette[shades[index % shades.length]]),
		)
	})

	return true
}

export const useTheming = defineStore('themeStore', {
	state: (): ThemeStore => ({
		...DEFAULT_THEME_STORE,
		featureFlags: { ...DEFAULT_FEATURE_FLAGS },
	}),
	actions: {
		initializeTheme() {
			let savedTheme: ColorTheme = 'dark'
			try {
				savedTheme =
					window.localStorage.getItem(BASE_THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark'
			} catch (error) {
				console.warn('Could not read the saved EdenLauncher theme.', error)
			}
			this.setThemeState(savedTheme)

			let savedColor: string | null = null
			try {
				savedColor = window.localStorage.getItem(ACCENT_COLOR_STORAGE_KEY)
			} catch (error) {
				console.warn('Could not read the saved EdenLauncher color.', error)
			}

			this.setAccentColor(savedColor ?? DEFAULT_ACCENT_COLOR)
		},
		setThemeState(newTheme: ColorTheme) {
			this.selectedTheme = normalizeLauncherTheme(newTheme)
			this.setThemeClass()

			try {
				window.localStorage.setItem(BASE_THEME_STORAGE_KEY, this.selectedTheme)
			} catch (error) {
				console.warn('Could not save the EdenLauncher theme.', error)
			}
		},
		setThemeClass() {
			if (typeof document === 'undefined') return

			const html = document.documentElement
			for (const theme of LEGACY_THEME_OPTIONS) {
				html.classList.remove(theme, `${theme}-mode`)
			}
			html.removeAttribute('data-theme')
			html.classList.add(`${this.selectedTheme}-mode`)
			applyAccentColor(this.accentColor, normalizeLauncherTheme(this.selectedTheme))
		},
		setAccentColor(newColor: string) {
			const normalized = normalizeAccentColor(newColor)
			if (!normalized) return false

			this.accentColor = normalized
			applyAccentColor(normalized, normalizeLauncherTheme(this.selectedTheme))

			try {
				window.localStorage.setItem(ACCENT_COLOR_STORAGE_KEY, normalized)
			} catch (error) {
				console.warn('Could not save the EdenLauncher color.', error)
			}

			return true
		},
		resetAccentColor() {
			this.setAccentColor(DEFAULT_ACCENT_COLOR)
		},
		getFeatureFlag(key: FeatureFlag) {
			return this.featureFlags[key] ?? DEFAULT_FEATURE_FLAGS[key]
		},
	},
})

