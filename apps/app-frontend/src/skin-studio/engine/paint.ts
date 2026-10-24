import { clampByte, colorDistance, hslToRgb, hsvToRgb, rgbToHsl, rgbToHsv } from './color.ts'
import { compositeOver, packRgba, readPacked, type Rgba, type RgbaImage, writePacked } from './image.ts'
import type { Rect } from './model.ts'

export type ToolId =
	| 'pencil'
	| 'eraser'
	| 'dropper'
	| 'fill'
	| 'noise'
	| 'dodgeBurn'
	| 'darkenLighten'
	| 'stamp'
	| 'select'
	| 'camera'

export type BrushShape = 'square' | 'circle' | 'custom'
export type FillMode = 'contiguous' | 'global'
export type FillLock = 'none' | 'face' | 'part'

export interface BrushMask {
	width: number
	height: number
	coverage: Float32Array
}

export interface StampPattern {
	width: number
	height: number
	data: Uint8ClampedArray
}

export interface ToolSettings {
	brushShape: BrushShape
	brushSize: number
	customBrush: BrushMask | null
	opacity: number
	exposure: number
	incremental: boolean
	noiseStrength: number
	fillTolerance: number
	fillMode: FillMode
	fillLock: FillLock
	mirror: boolean
	invert: boolean
}

export const MAX_BRUSH_SIZE = 64

export function defaultToolSettings(): ToolSettings {
	return {
		brushShape: 'square',
		brushSize: 1,
		customBrush: null,
		opacity: 1,
		exposure: 0.5,
		incremental: false,
		noiseStrength: 0.15,
		fillTolerance: 0,
		fillMode: 'contiguous',
		fillLock: 'none',
		mirror: false,
		invert: false,
	}
}

export function brushMask(shape: BrushShape, size: number, custom: BrushMask | null = null): BrushMask {
	if (shape === 'custom' && custom) return custom
	const n = Math.max(1, Math.min(MAX_BRUSH_SIZE, Math.round(size)))
	const coverage = new Float32Array(n * n)
	const c = (n - 1) / 2
	const radius = n / 2
	for (let y = 0; y < n; y++) {
		for (let x = 0; x < n; x++) {
			if (shape === 'circle' && n > 2) {
				const dx = x - c
				const dy = y - c
				if (dx * dx + dy * dy > radius * radius) continue
			}
			coverage[y * n + x] = 1
		}
	}
	return { width: n, height: n, coverage }
}

/** Builds a custom brush from the alpha of a captured stamp pattern. */
export function maskFromPattern(pattern: StampPattern): BrushMask {
	const coverage = new Float32Array(pattern.width * pattern.height)
	for (let i = 0; i < coverage.length; i++) coverage[i] = pattern.data[i * 4 + 3] / 255
	return { width: pattern.width, height: pattern.height, coverage }
}

export function capturePattern(image: RgbaImage, cx: number, cy: number, size: number): StampPattern {
	const n = Math.max(1, Math.min(MAX_BRUSH_SIZE, Math.round(size)))
	const start = Math.floor(n / 2)
	const data = new Uint8ClampedArray(n * n * 4)
	for (let y = 0; y < n; y++) {
		for (let x = 0; x < n; x++) {
			const sx = cx - start + x
			const sy = cy - start + y
			if (sx < 0 || sy < 0 || sx >= image.width || sy >= image.height) continue
			const si = (sy * image.width + sx) * 4
			data.set(image.data.subarray(si, si + 4), (y * n + x) * 4)
		}
	}
	return { width: n, height: n, data }
}

export interface Patch {
	pixels: Uint32Array
	before: Uint32Array
	after: Uint32Array
}

export function applyPatch(image: RgbaImage, patch: Patch, side: 'before' | 'after'): void {
	const values = side === 'before' ? patch.before : patch.after
	for (let i = 0; i < patch.pixels.length; i++) writePacked(image, patch.pixels[i], values[i])
}

export function patchBytes(patch: Patch): number {
	return patch.pixels.byteLength * 3
}

/** Deterministic 0..1 value per (seed, pixel), so non-incremental noise is stable within a stroke. */
export function hashNoise(seed: number, pixel: number): number {
	let t = (seed ^ Math.imul(pixel + 1, 0x9e3779b1)) >>> 0
	t = Math.imul(t ^ (t >>> 15), t | 1)
	t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export interface StrokeOptions {
	image: RgbaImage
	tool: ToolId
	color: Rgba
	settings: ToolSettings
	allowed?: (x: number, y: number) => boolean
	mirror?: (x: number, y: number) => [number, number] | null
	pattern?: StampPattern | null
	seed?: number
}

const STROKE_TOOLS: ToolId[] = ['pencil', 'eraser', 'noise', 'dodgeBurn', 'darkenLighten', 'stamp']

export function isStrokeTool(tool: ToolId): boolean {
	return STROKE_TOOLS.includes(tool)
}

/**
 * One pointer-down to pointer-up gesture. Pixels are modified in place; the original value of every
 * touched pixel is remembered so the stroke can be committed as one undo step or cancelled.
 */
export class Stroke {
	readonly options: StrokeOptions
	private readonly original = new Map<number, number>()
	private readonly coverage = new Map<number, number>()
	private readonly mask: BrushMask
	private readonly seed: number
	private last: [number, number] | null = null
	private dabCenter: [number, number] = [0, 0]

	constructor(options: StrokeOptions) {
		if (!isStrokeTool(options.tool)) throw new Error(`${options.tool} is not a stroke tool`)
		this.options = options
		const { settings, pattern } = options
		this.mask =
			options.tool === 'stamp' && pattern
				? maskFromPattern(pattern)
				: brushMask(settings.brushShape, settings.brushSize, settings.customBrush)
		this.seed = options.seed ?? Math.floor(Math.random() * 0xffffffff)
	}

	get touchedCount(): number {
		return this.original.size
	}

	moveTo(x: number, y: number): void {
		this.last = [x, y]
	}

	/** Paints a line of dabs from the previous position, skipping the already painted start point. */
	lineTo(x: number, y: number, clip?: Rect): void {
		if (!this.last) {
			this.dab(x, y, clip)
			this.last = [x, y]
			return
		}
		let [x0, y0] = this.last
		if (x0 === x && y0 === y) return
		const dx = Math.abs(x - x0)
		const dy = -Math.abs(y - y0)
		const sx = x0 < x ? 1 : -1
		const sy = y0 < y ? 1 : -1
		let err = dx + dy
		for (;;) {
			if (x0 === x && y0 === y) break
			const e2 = 2 * err
			if (e2 >= dy) {
				err += dy
				x0 += sx
			}
			if (e2 <= dx) {
				err += dx
				y0 += sy
			}
			this.dab(x0, y0, clip)
		}
		this.last = [x, y]
	}

	dab(x: number, y: number, clip?: Rect): void {
		const { image } = this.options
		const mask = this.mask
		const startX = x - Math.floor(mask.width / 2)
		const startY = y - Math.floor(mask.height / 2)
		this.dabCenter = [x, y]
		const mirrored = new Set<number>()
		for (let my = 0; my < mask.height; my++) {
			for (let mx = 0; mx < mask.width; mx++) {
				const c = mask.coverage[my * mask.width + mx]
				if (c <= 0) continue
				const px = startX + mx
				const py = startY + my
				if (px < 0 || py < 0 || px >= image.width || py >= image.height) continue
				if (clip && (px < clip.x || py < clip.y || px >= clip.x + clip.w || py >= clip.y + clip.h)) {
					continue
				}
				this.apply(px, py, c, mx, my)
				if (this.options.settings.mirror && this.options.mirror) {
					const target = this.options.mirror(px, py)
					if (!target) continue
					const key = target[1] * image.width + target[0]
					if (mirrored.has(key) || (target[0] === px && target[1] === py)) continue
					mirrored.add(key)
					this.apply(target[0], target[1], c, mask.width - 1 - mx, my)
				}
			}
		}
	}

	private apply(x: number, y: number, c: number, mx: number, my: number): void {
		const { image, allowed, settings } = this.options
		if (allowed && !allowed(x, y)) return
		const pixel = y * image.width + x
		if (!this.original.has(pixel)) this.original.set(pixel, readPacked(image, pixel))
		const previous = this.coverage.get(pixel) ?? 0
		let amount: number
		if (settings.incremental) {
			amount = c
			this.coverage.set(pixel, Math.min(1, previous + c))
		} else {
			const next = Math.min(1, Math.max(previous, c))
			if (next <= previous) return
			amount = next
			this.coverage.set(pixel, next)
			writePacked(image, pixel, this.original.get(pixel) as number)
		}
		this.blend(pixel, amount, mx, my)
	}

	private blend(pixel: number, amount: number, mx: number, my: number): void {
		const { image, tool, color, settings, pattern } = this.options
		const d = image.data
		const i = pixel * 4
		const opacity = Math.min(1, Math.max(0, settings.opacity))
		switch (tool) {
			case 'pencil':
				compositeOver(image, pixel, color[0], color[1], color[2], color[3], opacity * amount)
				return
			case 'eraser': {
				const alpha = d[i + 3] * (1 - opacity * amount)
				if (alpha < 0.5) {
					d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0
				} else {
					d[i + 3] = clampByte(alpha)
				}
				return
			}
			case 'stamp': {
				if (!pattern) return
				const pi = (my * pattern.width + mx) * 4
				compositeOver(
					image,
					pixel,
					pattern.data[pi],
					pattern.data[pi + 1],
					pattern.data[pi + 2],
					pattern.data[pi + 3],
					opacity,
				)
				return
			}
			case 'noise': {
				if (d[i + 3] === 0) return
				const n = (hashNoise(this.seed, pixel) - 0.5) * 2 * settings.noiseStrength * amount
				const hsv = rgbToHsv(d[i], d[i + 1], d[i + 2])
				const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v + n)
				d[i] = rgb[0]
				d[i + 1] = rgb[1]
				d[i + 2] = rgb[2]
				return
			}
			case 'dodgeBurn': {
				if (d[i + 3] === 0) return
				const k = settings.exposure * amount * 0.25
				for (let ch = 0; ch < 3; ch++) {
					const v = d[i + ch]
					d[i + ch] = clampByte(settings.invert ? v * (1 - k) : v + (255 - v) * k)
				}
				return
			}
			case 'darkenLighten': {
				if (d[i + 3] === 0) return
				const hsl = rgbToHsl(d[i], d[i + 1], d[i + 2])
				const delta = (settings.exposure * amount) / 5
				const rgb = hslToRgb(hsl.h, hsl.s, hsl.l + (settings.invert ? delta : -delta))
				d[i] = rgb[0]
				d[i + 1] = rgb[1]
				d[i + 2] = rgb[2]
				return
			}
			default:
				return
		}
	}

	/** Restores every touched pixel. */
	cancel(): void {
		for (const [pixel, value] of this.original) writePacked(this.options.image, pixel, value)
		this.original.clear()
		this.coverage.clear()
	}

	/** Returns the pixels that actually changed, or null when the stroke had no effect. */
	finish(): Patch | null {
		const { image } = this.options
		const changed: number[] = []
		for (const [pixel, value] of this.original) {
			if (readPacked(image, pixel) !== value) changed.push(pixel)
		}
		if (changed.length === 0) return null
		changed.sort((a, b) => a - b)
		const pixels = Uint32Array.from(changed)
		const before = new Uint32Array(pixels.length)
		const after = new Uint32Array(pixels.length)
		for (let k = 0; k < pixels.length; k++) {
			before[k] = this.original.get(pixels[k]) as number
			after[k] = readPacked(image, pixels[k])
		}
		return { pixels, before, after }
	}

	get lastDabCenter(): [number, number] {
		return this.dabCenter
	}
}

export interface FillOptions {
	image: RgbaImage
	x: number
	y: number
	color: Rgba
	tolerance: number
	mode: FillMode
	opacity: number
	regions?: Rect[] | null
	allowed?: (x: number, y: number) => boolean
}

function insideAny(regions: Rect[], x: number, y: number): boolean {
	for (const r of regions) if (x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h) return true
	return false
}

/** Flood fill by the largest per-channel difference to the seed colour. */
export function floodFill(options: FillOptions): Patch | null {
	const { image, x, y, color, mode, regions, allowed } = options
	const { width, height } = image
	if (x < 0 || y < 0 || x >= width || y >= height) return null
	const accept = (px: number, py: number) =>
		(!regions || regions.length === 0 || insideAny(regions, px, py)) && (!allowed || allowed(px, py))
	if (!accept(x, y)) return null
	const seed = readPacked(image, y * width + x)
	const seedRgba: Rgba = [seed & 255, (seed >>> 8) & 255, (seed >>> 16) & 255, seed >>> 24]
	const tolerance = Math.min(255, Math.max(0, options.tolerance))
	const matches = (pixel: number) => {
		const i = pixel * 4
		const d = image.data
		return colorDistance([d[i], d[i + 1], d[i + 2], d[i + 3]], seedRgba) <= tolerance
	}
	const selected: number[] = []
	if (mode === 'global') {
		for (let py = 0; py < height; py++) {
			for (let px = 0; px < width; px++) {
				const pixel = py * width + px
				if (accept(px, py) && matches(pixel)) selected.push(pixel)
			}
		}
	} else {
		const visited = new Uint8Array(width * height)
		const stack = [y * width + x]
		visited[y * width + x] = 1
		while (stack.length) {
			const pixel = stack.pop() as number
			if (!matches(pixel)) continue
			selected.push(pixel)
			const px = pixel % width
			const py = (pixel - px) / width
			const neighbours: [number, number][] = [
				[px + 1, py],
				[px - 1, py],
				[px, py + 1],
				[px, py - 1],
			]
			for (const [nx, ny] of neighbours) {
				if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
				const next = ny * width + nx
				if (visited[next]) continue
				visited[next] = 1
				if (accept(nx, ny)) stack.push(next)
			}
		}
	}
	const changed: number[] = []
	const before: number[] = []
	const after: number[] = []
	for (const pixel of selected) {
		const old = readPacked(image, pixel)
		compositeOver(image, pixel, color[0], color[1], color[2], color[3], options.opacity)
		const value = readPacked(image, pixel)
		if (value !== old) {
			changed.push(pixel)
			before.push(old)
			after.push(value)
		}
	}
	if (changed.length === 0) return null
	return {
		pixels: Uint32Array.from(changed),
		before: Uint32Array.from(before),
		after: Uint32Array.from(after),
	}
}

export function pickColor(image: RgbaImage, x: number, y: number): Rgba | null {
	if (x < 0 || y < 0 || x >= image.width || y >= image.height) return null
	const value = readPacked(image, y * image.width + x)
	return [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, value >>> 24]
}

export function solidPatchFill(image: RgbaImage, rect: Rect, color: Rgba): Patch | null {
	const pixels: number[] = []
	const before: number[] = []
	const after: number[] = []
	const value = packRgba(color[0], color[1], color[2], color[3])
	for (let y = rect.y; y < rect.y + rect.h; y++) {
		for (let x = rect.x; x < rect.x + rect.w; x++) {
			if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue
			const pixel = y * image.width + x
			const old = readPacked(image, pixel)
			if (old === value) continue
			pixels.push(pixel)
			before.push(old)
			after.push(value)
			writePacked(image, pixel, value)
		}
	}
	if (!pixels.length) return null
	return { pixels: Uint32Array.from(pixels), before: Uint32Array.from(before), after: Uint32Array.from(after) }
}
