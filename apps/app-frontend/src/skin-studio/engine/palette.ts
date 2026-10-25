import { clampByte, hsvToRgb } from './color.ts'

export interface Swatch {
	r: number
	g: number
	b: number
	a: number
	name?: string
}

export interface Palette {
	name: string
	swatches: Swatch[]
}

export type PaletteFormat = 'gpl' | 'aco' | 'act' | 'swtch' | 'json'

export const PALETTE_FORMATS: PaletteFormat[] = ['gpl', 'aco', 'act', 'swtch', 'json']
export const MAX_PALETTE_BYTES = 1024 * 1024
export const MAX_SWATCHES = 4096
const MAX_NAME = 64

export class PaletteError extends Error {
	readonly code: string

	constructor(code: string, message: string) {
		super(message)
		this.code = code
		this.name = 'PaletteError'
	}
}

export function cleanName(name: string | undefined | null): string | undefined {
	if (!name) return undefined
	const text = name.replace(/\p{Cc}/gu, '').trim()
	return text ? text.slice(0, MAX_NAME) : undefined
}

function pushSwatch(list: Swatch[], swatch: Swatch): void {
	if (list.length >= MAX_SWATCHES) throw new PaletteError('too-many', 'Too many colours in palette')
	list.push(swatch)
}

export function formatFromFileName(fileName: string): PaletteFormat | null {
	const ext = fileName.toLowerCase().split('.').pop() ?? ''
	if (ext === 'gpl' || ext === 'gimp') return 'gpl'
	if (ext === 'aco' || ext === 'act' || ext === 'swtch' || ext === 'json') return ext
	return null
}

export function parseGpl(text: string, fallbackName: string): Palette {
	const lines = text.replace(/\r\n?/g, '\n').split('\n')
	if (!lines[0] || lines[0].trim() !== 'GIMP Palette') {
		throw new PaletteError('header', 'Not a GIMP palette')
	}
	let name = fallbackName
	let channels = 3
	const swatches: Swatch[] = []
	for (const raw of lines.slice(1)) {
		const line = raw.trim()
		if (!line || line.startsWith('#')) continue
		const meta = /^(Name|Columns|Channels):\s*(.*)$/i.exec(line)
		if (meta) {
			const key = meta[1].toLowerCase()
			if (key === 'name') name = cleanName(meta[2]) ?? name
			if (key === 'channels') {
				if (meta[2].trim().toUpperCase() === 'RGBA') channels = 4
				else if (meta[2].trim().toUpperCase() !== 'RGB') {
					throw new PaletteError('version', 'Unsupported GIMP palette channels')
				}
			}
			continue
		}
		const match =
			channels === 4
				? /^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})(?:\s+(.*))?$/.exec(line)
				: /^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})(?:\s+(.*))?$/.exec(line)
		if (!match) throw new PaletteError('syntax', `Invalid palette line: ${line.slice(0, 40)}`)
		const values = match.slice(1, channels + 1).map(Number)
		if (values.some((v) => v > 255)) throw new PaletteError('range', 'Colour value out of range')
		pushSwatch(swatches, {
			r: values[0],
			g: values[1],
			b: values[2],
			a: channels === 4 ? values[3] : 255,
			name: cleanName(match[channels + 1]),
		})
	}
	return { name, swatches }
}

export function writeGpl(palette: Palette): string {
	const hasAlpha = palette.swatches.some((s) => s.a !== 255)
	const lines = ['GIMP Palette', `Name: ${cleanName(palette.name) ?? 'Palette'}`]
	if (hasAlpha) lines.push('Channels: RGBA')
	lines.push('Columns: 8', '#')
	for (const s of palette.swatches) {
		const values = [s.r, s.g, s.b, ...(hasAlpha ? [s.a] : [])].map((v) =>
			String(v).padStart(3, ' '),
		)
		lines.push(`${values.join(' ')}\t${cleanName(s.name) ?? 'Untitled'}`)
	}
	return lines.join('\n') + '\n'
}

export function parseSwtch(text: string, fallbackName: string): Palette {
	const swatches: Swatch[] = []
	for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
		const line = raw.trim()
		if (!line) continue
		const match = /^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})(?:\s+(.*))?$/.exec(line)
		if (!match) throw new PaletteError('syntax', `Invalid swatch line: ${line.slice(0, 40)}`)
		const values = match.slice(1, 5).map(Number)
		if (values.some((v) => v > 255)) throw new PaletteError('range', 'Colour value out of range')
		pushSwatch(swatches, {
			r: values[0],
			g: values[1],
			b: values[2],
			a: values[3],
			name: cleanName(match[5]),
		})
	}
	return { name: fallbackName, swatches }
}

export function writeSwtch(palette: Palette): string {
	return (
		palette.swatches
			.map((s) => {
				const name = cleanName(s.name)
				return `${s.r} ${s.g} ${s.b} ${s.a}${name ? ` ${name}` : ''}`
			})
			.join('\n') + '\n'
	)
}

function acoColor(
	space: number,
	w: number,
	x: number,
	y: number,
	z: number,
): [number, number, number] {
	switch (space) {
		case 0:
			return [w >> 8, x >> 8, y >> 8]
		case 1:
			return hsvToRgb((w / 65535) * 360, x / 65535, y / 65535)
		case 2: {
			const c = 1 - w / 65535
			const m = 1 - x / 65535
			const yy = 1 - y / 65535
			const k = 1 - z / 65535
			return [
				clampByte(255 * (1 - c) * (1 - k)),
				clampByte(255 * (1 - m) * (1 - k)),
				clampByte(255 * (1 - yy) * (1 - k)),
			]
		}
		case 8: {
			const v = clampByte(255 * (1 - Math.min(10000, w) / 10000))
			return [v, v, v]
		}
		default:
			throw new PaletteError('colorspace', `ACO colour space ${space} is not supported`)
	}
}

/** Photoshop .aco version 1 and 2 (names are read from version 2 when present). */
export function parseAco(bytes: Uint8Array, fallbackName: string): Palette {
	if (bytes.length > MAX_PALETTE_BYTES)
		throw new PaletteError('too-big', 'Palette file is too large')
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
	const need = (offset: number, size: number) => {
		if (offset + size > bytes.length)
			throw new PaletteError('truncated', 'Palette file is truncated')
	}
	need(0, 4)
	const version = view.getUint16(0)
	if (version !== 1 && version !== 2)
		throw new PaletteError('version', `ACO version ${version} is not supported`)
	let offset = 0
	let swatches: Swatch[] = []
	const readSection = (sectionVersion: number) => {
		need(offset, 4)
		const v = view.getUint16(offset)
		const count = view.getUint16(offset + 2)
		if (v !== sectionVersion) throw new PaletteError('version', 'Unexpected ACO section')
		if (count > MAX_SWATCHES) throw new PaletteError('too-many', 'Too many colours in palette')
		offset += 4
		const list: Swatch[] = []
		for (let i = 0; i < count; i++) {
			need(offset, 10)
			const space = view.getUint16(offset)
			const [r, g, b] = acoColor(
				space,
				view.getUint16(offset + 2),
				view.getUint16(offset + 4),
				view.getUint16(offset + 6),
				view.getUint16(offset + 8),
			)
			offset += 10
			let name: string | undefined
			if (sectionVersion === 2) {
				need(offset, 4)
				const length = view.getUint32(offset)
				offset += 4
				if (length > 1024) throw new PaletteError('name', 'Colour name is too long')
				need(offset, length * 2)
				let text = ''
				for (let c = 0; c < length; c++) {
					const code = view.getUint16(offset + c * 2)
					if (code !== 0) text += String.fromCharCode(code)
				}
				offset += length * 2
				name = cleanName(text)
			}
			list.push({ r, g, b, a: 255, name })
		}
		return list
	}
	if (version === 1) {
		swatches = readSection(1)
		if (offset + 4 <= bytes.length && view.getUint16(offset) === 2) {
			const named = readSection(2)
			if (named.length === swatches.length) swatches = named
		}
	} else {
		swatches = readSection(2)
	}
	return { name: fallbackName, swatches }
}

export function writeAco(palette: Palette): Uint8Array {
	const names = palette.swatches.map((s) => cleanName(s.name) ?? '')
	const size =
		4 +
		palette.swatches.length * 10 +
		4 +
		palette.swatches.reduce((sum, _s, i) => sum + 14 + (names[i].length + 1) * 2, 0)
	const bytes = new Uint8Array(size)
	const view = new DataView(bytes.buffer)
	let offset = 0
	for (const version of [1, 2]) {
		view.setUint16(offset, version)
		view.setUint16(offset + 2, palette.swatches.length)
		offset += 4
		palette.swatches.forEach((s, i) => {
			view.setUint16(offset, 0)
			view.setUint16(offset + 2, s.r * 257)
			view.setUint16(offset + 4, s.g * 257)
			view.setUint16(offset + 6, s.b * 257)
			view.setUint16(offset + 8, 0)
			offset += 10
			if (version === 2) {
				const name = names[i]
				view.setUint32(offset, name.length + 1)
				offset += 4
				for (let c = 0; c < name.length; c++) view.setUint16(offset + c * 2, name.charCodeAt(c))
				offset += (name.length + 1) * 2
			}
		})
	}
	return bytes
}

/** Adobe Color Table: 256 RGB triplets, optionally followed by a colour count and transparent index. */
export function parseAct(bytes: Uint8Array, fallbackName: string): Palette {
	if (bytes.length !== 768 && bytes.length !== 772) {
		throw new PaletteError('size', 'ACT files must be 768 or 772 bytes')
	}
	let count = 256
	let transparent = -1
	if (bytes.length === 772) {
		count = (bytes[768] << 8) | bytes[769]
		const t = (bytes[770] << 8) | bytes[771]
		transparent = t === 0xffff ? -1 : t
		if (count === 0 || count > 256) count = 256
	}
	const swatches: Swatch[] = []
	for (let i = 0; i < count; i++) {
		swatches.push({
			r: bytes[i * 3],
			g: bytes[i * 3 + 1],
			b: bytes[i * 3 + 2],
			a: i === transparent ? 0 : 255,
		})
	}
	return { name: fallbackName, swatches }
}

export function writeAct(palette: Palette): Uint8Array {
	const bytes = new Uint8Array(772)
	const list = palette.swatches.slice(0, 256)
	let transparent = 0xffff
	list.forEach((s, i) => {
		bytes[i * 3] = s.r
		bytes[i * 3 + 1] = s.g
		bytes[i * 3 + 2] = s.b
		if (s.a === 0 && transparent === 0xffff) transparent = i
	})
	bytes[768] = (list.length >> 8) & 255
	bytes[769] = list.length & 255
	bytes[770] = (transparent >> 8) & 255
	bytes[771] = transparent & 255
	return bytes
}

/** The design kit's JSON palettes: `{ "name": ..., "colors": ["#RRGGBB", ...] }`. */
export function parseJsonPalette(text: string, fallbackName: string): Palette {
	let value: unknown
	try {
		value = JSON.parse(text)
	} catch {
		throw new PaletteError('syntax', 'Invalid JSON palette')
	}
	if (!value || typeof value !== 'object') throw new PaletteError('syntax', 'Invalid JSON palette')
	const record = value as { name?: unknown; colors?: unknown }
	if (!Array.isArray(record.colors)) throw new PaletteError('syntax', 'JSON palette has no colours')
	const swatches: Swatch[] = []
	for (const entry of record.colors) {
		const hex = typeof entry === 'string' ? entry : (entry as { hex?: unknown })?.hex
		const name = typeof entry === 'object' && entry ? (entry as { name?: unknown }).name : undefined
		if (typeof hex !== 'string' || !/^#?[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(hex)) {
			throw new PaletteError('syntax', 'Invalid colour in JSON palette')
		}
		const h = hex.replace('#', '')
		pushSwatch(swatches, {
			r: parseInt(h.slice(0, 2), 16),
			g: parseInt(h.slice(2, 4), 16),
			b: parseInt(h.slice(4, 6), 16),
			a: h.length === 8 ? parseInt(h.slice(6, 8), 16) : 255,
			name: typeof name === 'string' ? cleanName(name) : undefined,
		})
	}
	return {
		name: (typeof record.name === 'string' && cleanName(record.name)) || fallbackName,
		swatches,
	}
}

export function writeJsonPalette(palette: Palette): string {
	const hex = (s: Swatch) =>
		'#' +
		[s.r, s.g, s.b, ...(s.a !== 255 ? [s.a] : [])]
			.map((v) => v.toString(16).padStart(2, '0'))
			.join('')
			.toUpperCase()
	return JSON.stringify({ name: palette.name, colors: palette.swatches.map(hex) }, null, 2) + '\n'
}

export function parsePalette(
	format: PaletteFormat,
	bytes: Uint8Array,
	fallbackName: string,
): Palette {
	if (bytes.length > MAX_PALETTE_BYTES)
		throw new PaletteError('too-big', 'Palette file is too large')
	const text = () => new TextDecoder('utf-8', { fatal: false }).decode(bytes)
	switch (format) {
		case 'gpl':
			return parseGpl(text(), fallbackName)
		case 'swtch':
			return parseSwtch(text(), fallbackName)
		case 'aco':
			return parseAco(bytes, fallbackName)
		case 'act':
			return parseAct(bytes, fallbackName)
		case 'json':
			return parseJsonPalette(text(), fallbackName)
	}
}

export function writePalette(format: PaletteFormat, palette: Palette): Uint8Array {
	switch (format) {
		case 'gpl':
			return new TextEncoder().encode(writeGpl(palette))
		case 'swtch':
			return new TextEncoder().encode(writeSwtch(palette))
		case 'aco':
			return writeAco(palette)
		case 'act':
			return writeAct(palette)
		case 'json':
			return new TextEncoder().encode(writeJsonPalette(palette))
	}
}
