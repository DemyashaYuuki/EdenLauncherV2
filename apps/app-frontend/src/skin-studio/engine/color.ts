import type { Rgba } from './image.ts'

export interface Hsv {
	h: number
	s: number
	v: number
}

export function clampByte(value: number): number {
	if (!Number.isFinite(value)) return 0
	return Math.min(255, Math.max(0, Math.round(value)))
}

/** h in degrees 0..360, s and v in 0..1. */
export function rgbToHsv(r: number, g: number, b: number): Hsv {
	const rn = r / 255
	const gn = g / 255
	const bn = b / 255
	const max = Math.max(rn, gn, bn)
	const min = Math.min(rn, gn, bn)
	const delta = max - min
	let h = 0
	if (delta > 0) {
		if (max === rn) h = 60 * (((gn - bn) / delta) % 6)
		else if (max === gn) h = 60 * ((bn - rn) / delta + 2)
		else h = 60 * ((rn - gn) / delta + 4)
	}
	if (h < 0) h += 360
	return { h, s: max === 0 ? 0 : delta / max, v: max }
}

export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
	const hh = ((h % 360) + 360) % 360
	const ss = Math.min(1, Math.max(0, s))
	const vv = Math.min(1, Math.max(0, v))
	const c = vv * ss
	const x = c * (1 - Math.abs(((hh / 60) % 2) - 1))
	const m = vv - c
	let rgb: [number, number, number]
	if (hh < 60) rgb = [c, x, 0]
	else if (hh < 120) rgb = [x, c, 0]
	else if (hh < 180) rgb = [0, c, x]
	else if (hh < 240) rgb = [0, x, c]
	else if (hh < 300) rgb = [x, 0, c]
	else rgb = [c, 0, x]
	return [
		clampByte((rgb[0] + m) * 255),
		clampByte((rgb[1] + m) * 255),
		clampByte((rgb[2] + m) * 255),
	]
}

/** Accepts #RGB, #RGBA, #RRGGBB and #RRGGBBAA (the # is optional). */
export function parseHex(input: string): Rgba | null {
	const text = input.trim().replace(/^#/, '')
	if (!/^[0-9a-fA-F]+$/.test(text)) return null
	if (text.length === 3 || text.length === 4) {
		const parts = [...text].map((c) => parseInt(c + c, 16))
		return [parts[0], parts[1], parts[2], parts[3] ?? 255]
	}
	if (text.length === 6 || text.length === 8) {
		const value = (i: number) => parseInt(text.slice(i, i + 2), 16)
		return [value(0), value(2), value(4), text.length === 8 ? value(6) : 255]
	}
	return null
}

function hexByte(value: number): string {
	return clampByte(value).toString(16).padStart(2, '0').toUpperCase()
}

export function toHex(color: Rgba, includeAlpha = color[3] !== 255): string {
	const base = `#${hexByte(color[0])}${hexByte(color[1])}${hexByte(color[2])}`
	return includeAlpha ? base + hexByte(color[3]) : base
}

export function sameColor(a: Rgba, b: Rgba): boolean {
	return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3]
}

/** Largest per-channel difference, used as the fill tolerance metric. */
export function colorDistance(a: Rgba, b: Rgba): number {
	return Math.max(
		Math.abs(a[0] - b[0]),
		Math.abs(a[1] - b[1]),
		Math.abs(a[2] - b[2]),
		Math.abs(a[3] - b[3]),
	)
}

export interface Hsl {
	h: number
	s: number
	l: number
}

export function rgbToHsl(r: number, g: number, b: number): Hsl {
	const rn = r / 255
	const gn = g / 255
	const bn = b / 255
	const max = Math.max(rn, gn, bn)
	const min = Math.min(rn, gn, bn)
	const l = (max + min) / 2
	const delta = max - min
	if (delta === 0) return { h: 0, s: 0, l }
	const s = delta / (1 - Math.abs(2 * l - 1))
	let h: number
	if (max === rn) h = 60 * (((gn - bn) / delta) % 6)
	else if (max === gn) h = 60 * ((bn - rn) / delta + 2)
	else h = 60 * ((rn - gn) / delta + 4)
	if (h < 0) h += 360
	return { h, s, l }
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
	const ll = Math.min(1, Math.max(0, l))
	const ss = Math.min(1, Math.max(0, s))
	const c = (1 - Math.abs(2 * ll - 1)) * ss
	const hh = (((h % 360) + 360) % 360) / 60
	const x = c * (1 - Math.abs((hh % 2) - 1))
	const m = ll - c / 2
	let rgb: [number, number, number]
	if (hh < 1) rgb = [c, x, 0]
	else if (hh < 2) rgb = [x, c, 0]
	else if (hh < 3) rgb = [0, c, x]
	else if (hh < 4) rgb = [0, x, c]
	else if (hh < 5) rgb = [x, 0, c]
	else rgb = [c, 0, x]
	return [
		clampByte((rgb[0] + m) * 255),
		clampByte((rgb[1] + m) * 255),
		clampByte((rgb[2] + m) * 255),
	]
}

/** WCAG relative luminance, used for choosing readable text over swatches. */
export function relativeLuminance(color: Rgba): number {
	const channel = (value: number) => {
		const c = value / 255
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
	}
	return 0.2126 * channel(color[0]) + 0.7152 * channel(color[1]) + 0.0722 * channel(color[2])
}
