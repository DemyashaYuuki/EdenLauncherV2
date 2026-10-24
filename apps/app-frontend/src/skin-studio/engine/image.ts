export interface RgbaImage {
	width: number
	height: number
	data: Uint8ClampedArray
}

export type Rgba = [number, number, number, number]

export const MAX_TEXTURE_SIZE = 4096
export const MIN_TEXTURE_SIZE = 8

export interface DimensionCheck {
	ok: boolean
	reason?: 'not-integer' | 'too-small' | 'too-large' | 'bad-aspect'
}

/**
 * Accepts textures with a 1:1, 2:1 or 1:2 aspect whose sides are multiples of 8, up to 4096.
 * These are the shapes box-UV models address without distortion.
 */
export function checkTextureDimensions(width: number, height: number): DimensionCheck {
	if (!Number.isInteger(width) || !Number.isInteger(height)) return { ok: false, reason: 'not-integer' }
	if (width < MIN_TEXTURE_SIZE || height < MIN_TEXTURE_SIZE) return { ok: false, reason: 'too-small' }
	if (width > MAX_TEXTURE_SIZE || height > MAX_TEXTURE_SIZE) return { ok: false, reason: 'too-large' }
	if (width % 8 !== 0 || height % 8 !== 0) return { ok: false, reason: 'bad-aspect' }
	if (width !== height && width !== height * 2 && height !== width * 2) return { ok: false, reason: 'bad-aspect' }
	return { ok: true }
}

/** Whether a texture of this size keeps the model's aspect, i.e. it is an integer HD multiple. */
export function matchesModelAspect(
	width: number,
	height: number,
	modelWidth: number,
	modelHeight: number,
): boolean {
	return width * modelHeight === height * modelWidth && width % modelWidth === 0
}

/** Standard skin sizes that Mojang's skin service accepts. */
export function isRemoteSkinSize(width: number, height: number): boolean {
	return width === 64 && (height === 64 || height === 32)
}

export function createImage(width: number, height: number, fill: Rgba = [0, 0, 0, 0]): RgbaImage {
	if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
		throw new RangeError(`Invalid image size ${width}x${height}`)
	}
	if (width > MAX_TEXTURE_SIZE || height > MAX_TEXTURE_SIZE) {
		throw new RangeError(`Image larger than ${MAX_TEXTURE_SIZE}px`)
	}
	const data = new Uint8ClampedArray(width * height * 4)
	if (fill[0] || fill[1] || fill[2] || fill[3]) {
		for (let i = 0; i < data.length; i += 4) {
			data[i] = fill[0]
			data[i + 1] = fill[1]
			data[i + 2] = fill[2]
			data[i + 3] = fill[3]
		}
	}
	return { width, height, data }
}

export function cloneImage(image: RgbaImage): RgbaImage {
	return { width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) }
}

export function inBounds(image: RgbaImage, x: number, y: number): boolean {
	return x >= 0 && y >= 0 && x < image.width && y < image.height
}

export function getPixel(image: RgbaImage, x: number, y: number): Rgba {
	const i = (y * image.width + x) * 4
	const d = image.data
	return [d[i], d[i + 1], d[i + 2], d[i + 3]]
}

export function setPixel(image: RgbaImage, x: number, y: number, color: Rgba): void {
	const i = (y * image.width + x) * 4
	const d = image.data
	d[i] = color[0]
	d[i + 1] = color[1]
	d[i + 2] = color[2]
	d[i + 3] = color[3]
}

export function packRgba(r: number, g: number, b: number, a: number): number {
	return ((r & 255) | ((g & 255) << 8) | ((b & 255) << 16) | ((a & 255) << 24)) >>> 0
}

export function unpackRgba(value: number): Rgba {
	return [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]
}

export function readPacked(image: RgbaImage, pixel: number): number {
	const i = pixel * 4
	const d = image.data
	return packRgba(d[i], d[i + 1], d[i + 2], d[i + 3])
}

export function writePacked(image: RgbaImage, pixel: number, value: number): void {
	const i = pixel * 4
	const d = image.data
	d[i] = value & 255
	d[i + 1] = (value >>> 8) & 255
	d[i + 2] = (value >>> 16) & 255
	d[i + 3] = (value >>> 24) & 255
}

/**
 * Straight-alpha source-over compositing of `color` onto the pixel, with `opacity` in 0..1
 * scaling the source alpha.
 */
export function compositeOver(
	image: RgbaImage,
	pixel: number,
	r: number,
	g: number,
	b: number,
	a: number,
	opacity: number,
): void {
	const d = image.data
	const i = pixel * 4
	const sa = (a / 255) * Math.min(1, Math.max(0, opacity))
	if (sa <= 0) return
	const da = d[i + 3] / 255
	const oa = sa + da * (1 - sa)
	if (oa <= 0) {
		d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0
		return
	}
	d[i] = Math.round((r * sa + d[i] * da * (1 - sa)) / oa)
	d[i + 1] = Math.round((g * sa + d[i + 1] * da * (1 - sa)) / oa)
	d[i + 2] = Math.round((b * sa + d[i + 2] * da * (1 - sa)) / oa)
	d[i + 3] = Math.round(oa * 255)
}

export function imagesEqual(a: RgbaImage, b: RgbaImage): boolean {
	if (a.width !== b.width || a.height !== b.height) return false
	const x = a.data
	const y = b.data
	for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false
	return true
}

export function resizeNearest(image: RgbaImage, width: number, height: number): RgbaImage {
	const out = createImage(width, height)
	for (let y = 0; y < height; y++) {
		const sy = Math.min(image.height - 1, Math.floor((y * image.height) / height))
		for (let x = 0; x < width; x++) {
			const sx = Math.min(image.width - 1, Math.floor((x * image.width) / width))
			const si = (sy * image.width + sx) * 4
			const di = (y * width + x) * 4
			out.data[di] = image.data[si]
			out.data[di + 1] = image.data[si + 1]
			out.data[di + 2] = image.data[si + 2]
			out.data[di + 3] = image.data[si + 3]
		}
	}
	return out
}

/** Keeps the top-left corner; new area is transparent. */
export function cropOrExtend(image: RgbaImage, width: number, height: number): RgbaImage {
	const out = createImage(width, height)
	const w = Math.min(width, image.width)
	const h = Math.min(height, image.height)
	for (let y = 0; y < h; y++) {
		const s = y * image.width * 4
		const d = y * width * 4
		out.data.set(image.data.subarray(s, s + w * 4), d)
	}
	return out
}

export function copyRect(
	src: RgbaImage,
	sx: number,
	sy: number,
	w: number,
	h: number,
	dst: RgbaImage,
	dx: number,
	dy: number,
	flipX = false,
	flipY = false,
): void {
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const fx = flipX ? w - 1 - x : x
			const fy = flipY ? h - 1 - y : y
			const tx = dx + fx
			const ty = dy + fy
			if (!inBounds(dst, tx, ty) || !inBounds(src, sx + x, sy + y)) continue
			const si = ((sy + y) * src.width + sx + x) * 4
			const di = (ty * dst.width + tx) * 4
			dst.data[di] = src.data[si]
			dst.data[di + 1] = src.data[si + 1]
			dst.data[di + 2] = src.data[si + 2]
			dst.data[di + 3] = src.data[si + 3]
		}
	}
}

export function clearRect(image: RgbaImage, x: number, y: number, w: number, h: number): void {
	for (let yy = y; yy < y + h; yy++) {
		for (let xx = x; xx < x + w; xx++) {
			if (!inBounds(image, xx, yy)) continue
			const i = (yy * image.width + xx) * 4
			image.data[i] = image.data[i + 1] = image.data[i + 2] = image.data[i + 3] = 0
		}
	}
}

/**
 * Converts a legacy 64x32 skin (or a proportional HD one) to the modern 64x64 layout the same way
 * the game does: the left arm and left leg receive mirrored copies of the right limbs.
 */
export function convertLegacyToModern(image: RgbaImage): RgbaImage {
	if (image.width !== image.height * 2) throw new RangeError('Not a legacy layout')
	const s = image.width / 64
	const out = createImage(image.width, image.width)
	out.data.set(image.data, 0)
	const moves: [number, number, number, number, number, number][] = [
		[4, 16, 16, 32, 4, 4],
		[8, 16, 16, 32, 4, 4],
		[0, 20, 24, 32, 4, 12],
		[4, 20, 16, 32, 4, 12],
		[8, 20, 8, 32, 4, 12],
		[12, 20, 16, 32, 4, 12],
		[44, 16, -8, 32, 4, 4],
		[48, 16, -8, 32, 4, 4],
		[40, 20, 0, 32, 4, 12],
		[44, 20, -8, 32, 4, 12],
		[48, 20, -16, 32, 4, 12],
		[52, 20, -8, 32, 4, 12],
	]
	for (const [x, y, dx, dy, w, h] of moves) {
		copyRect(image, x * s, y * s, w * s, h * s, out, (x + dx) * s, (y + dy) * s, true, false)
	}
	return out
}

/** Drops the bottom half of a modern skin. The layers that only exist in 64x64 are lost. */
export function convertModernToLegacy(image: RgbaImage): RgbaImage {
	if (image.width !== image.height) throw new RangeError('Not a modern layout')
	return cropOrExtend(image, image.width, image.width / 2)
}

interface ArmRegion {
	u: number
	v: number
}

const ARM_REGIONS: ArmRegion[] = [
	{ u: 40, v: 16 },
	{ u: 40, v: 32 },
	{ u: 32, v: 48 },
	{ u: 48, v: 48 },
]

function resampleColumns(
	src: RgbaImage,
	sx: number,
	sy: number,
	sw: number,
	h: number,
	dst: RgbaImage,
	dx: number,
	dy: number,
	dw: number,
): void {
	for (let x = 0; x < dw; x++) {
		const from = Math.min(sw - 1, Math.floor((x * sw) / dw))
		copyRect(src, sx + from, sy, 1, h, dst, dx + x, dy)
	}
}

/**
 * Re-packs the arm UV regions between the 4 px (classic) and 3 px (slim) arm widths.
 * Faces are resampled column-wise; side faces keep their pixels.
 */
export function convertArmWidth(image: RgbaImage, from: 3 | 4, to: 3 | 4): RgbaImage {
	if (from === to) return cloneImage(image)
	if (image.width !== image.height) throw new RangeError('Arm conversion needs a 64x64 layout')
	const s = image.width / 64
	const out = cloneImage(image)
	for (const region of ARM_REGIONS) {
		const u = region.u * s
		const v = region.v * s
		const d = 4 * s
		const h = 12 * s
		const fw = from * s
		const tw = to * s
		const total = (2 * 4 + 2 * 4) * s
		clearRect(out, u, v, total, d + h)
		resampleColumns(image, u + d, v, fw, d, out, u + d, v, tw)
		resampleColumns(image, u + d + fw, v, fw, d, out, u + d + tw, v, tw)
		copyRect(image, u, v + d, d, h, out, u, v + d)
		resampleColumns(image, u + d, v + d, fw, h, out, u + d, v + d, tw)
		copyRect(image, u + d + fw, v + d, d, h, out, u + d + tw, v + d)
		resampleColumns(image, u + 2 * d + fw, v + d, fw, h, out, u + 2 * d + tw, v + d, tw)
	}
	return out
}

/** Detects the slim layout by checking the column that only classic arms use. */
export function looksSlim(image: RgbaImage): boolean {
	if (image.width !== image.height) return false
	const s = image.width / 64
	for (let y = 20 * s; y < 32 * s; y++) {
		for (let x = 54 * s; x < 56 * s; x++) {
			if (image.data[(y * image.width + x) * 4 + 3] !== 0) return false
		}
	}
	return true
}
