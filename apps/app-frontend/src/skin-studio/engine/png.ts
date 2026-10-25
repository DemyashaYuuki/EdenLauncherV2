import { createImage, MAX_TEXTURE_SIZE, type RgbaImage } from './image.ts'

export const MAX_PNG_BYTES = 32 * 1024 * 1024

export class PngError extends Error {
	readonly code: string

	constructor(code: string, message: string) {
		super(message)
		this.code = code
		this.name = 'PngError'
	}
}

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]

let crcTable: Uint32Array | null = null

function getCrcTable(): Uint32Array {
	if (crcTable) return crcTable
	const table = new Uint32Array(256)
	for (let n = 0; n < 256; n++) {
		let c = n
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
		table[n] = c >>> 0
	}
	crcTable = table
	return table
}

export function crc32(bytes: Uint8Array, start = 0, end = bytes.length): number {
	const table = getCrcTable()
	let c = 0xffffffff
	for (let i = start; i < end; i++) c = table[(c ^ bytes[i]) & 255] ^ (c >>> 8)
	return (c ^ 0xffffffff) >>> 0
}

export function isPng(bytes: Uint8Array): boolean {
	if (bytes.length < 8) return false
	for (let i = 0; i < 8; i++) if (bytes[i] !== SIGNATURE[i]) return false
	return true
}

function readU32(bytes: Uint8Array, offset: number): number {
	return (
		((bytes[offset] << 24) |
			(bytes[offset + 1] << 16) |
			(bytes[offset + 2] << 8) |
			bytes[offset + 3]) >>>
		0
	)
}

function writeU32(bytes: Uint8Array, offset: number, value: number): void {
	bytes[offset] = (value >>> 24) & 255
	bytes[offset + 1] = (value >>> 16) & 255
	bytes[offset + 2] = (value >>> 8) & 255
	bytes[offset + 3] = value & 255
}

/**
 * Inflates zlib data and aborts as soon as the output would exceed `limit` bytes,
 * so a small compressed stream cannot expand into an arbitrarily large buffer.
 */
export async function inflateLimited(
	data: Uint8Array,
	limit: number,
	format: 'deflate' | 'deflate-raw' = 'deflate',
): Promise<Uint8Array> {
	const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream(format))
	const reader = stream.getReader()
	const chunks: Uint8Array[] = []
	let total = 0
	try {
		for (;;) {
			const { done, value } = await reader.read()
			if (done) break
			total += value.byteLength
			if (total > limit) {
				await reader.cancel()
				throw new PngError('inflate-limit', 'Decompressed data is larger than allowed')
			}
			chunks.push(value)
		}
	} catch (error) {
		if (error instanceof PngError) throw error
		throw new PngError('inflate', 'Compressed data is corrupt')
	}
	const out = new Uint8Array(total)
	let offset = 0
	for (const chunk of chunks) {
		out.set(chunk, offset)
		offset += chunk.byteLength
	}
	return out
}

export async function deflate(data: Uint8Array, format: 'deflate' | 'deflate-raw' = 'deflate') {
	const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream(format))
	return new Uint8Array(await new Response(stream).arrayBuffer())
}

interface Header {
	width: number
	height: number
	bitDepth: number
	colorType: number
	interlace: number
}

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }
const VALID_DEPTHS: Record<number, number[]> = {
	0: [1, 2, 4, 8, 16],
	2: [8, 16],
	3: [1, 2, 4, 8],
	4: [8, 16],
	6: [8, 16],
}

export interface PngInfo {
	width: number
	height: number
	bitDepth: number
	colorType: number
}

/** Reads only the IHDR chunk, without inflating anything. */
export function readPngInfo(bytes: Uint8Array): PngInfo {
	if (!isPng(bytes)) throw new PngError('signature', 'Not a PNG file')
	if (bytes.length < 33) throw new PngError('truncated', 'PNG is truncated')
	const length = readU32(bytes, 8)
	const type = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15])
	if (type !== 'IHDR' || length !== 13) throw new PngError('ihdr', 'PNG header is missing')
	return {
		width: readU32(bytes, 16),
		height: readU32(bytes, 20),
		bitDepth: bytes[24],
		colorType: bytes[25],
	}
}

function paeth(a: number, b: number, c: number): number {
	const p = a + b - c
	const pa = Math.abs(p - a)
	const pb = Math.abs(p - b)
	const pc = Math.abs(p - c)
	if (pa <= pb && pa <= pc) return a
	if (pb <= pc) return b
	return c
}

function unfilter(
	raw: Uint8Array,
	offset: number,
	width: number,
	height: number,
	bpp: number,
	rowBytes: number,
): { rows: Uint8Array; next: number } {
	const rows = new Uint8Array(rowBytes * height)
	let p = offset
	for (let y = 0; y < height; y++) {
		if (p >= raw.length) throw new PngError('truncated', 'Image data is truncated')
		const filter = raw[p++]
		if (p + rowBytes > raw.length) throw new PngError('truncated', 'Image data is truncated')
		const row = y * rowBytes
		const prev = row - rowBytes
		for (let x = 0; x < rowBytes; x++) {
			const value = raw[p + x]
			const left = x >= bpp ? rows[row + x - bpp] : 0
			const up = y > 0 ? rows[prev + x] : 0
			const upLeft = y > 0 && x >= bpp ? rows[prev + x - bpp] : 0
			let out: number
			switch (filter) {
				case 0:
					out = value
					break
				case 1:
					out = value + left
					break
				case 2:
					out = value + up
					break
				case 3:
					out = value + ((left + up) >> 1)
					break
				case 4:
					out = value + paeth(left, up, upLeft)
					break
				default:
					throw new PngError('filter', 'Unknown PNG filter')
			}
			rows[row + x] = out & 255
		}
		p += rowBytes
	}
	void width
	return { rows, next: p }
}

function sample(
	rows: Uint8Array,
	rowBytes: number,
	y: number,
	index: number,
	depth: number,
): number {
	if (depth === 8) return rows[y * rowBytes + index]
	if (depth === 16) return rows[y * rowBytes + index * 2]
	const perByte = 8 / depth
	const byte = rows[y * rowBytes + Math.floor(index / perByte)]
	const shift = 8 - depth * ((index % perByte) + 1)
	return (byte >> shift) & ((1 << depth) - 1)
}

function sample16(rows: Uint8Array, rowBytes: number, y: number, index: number): number {
	const i = y * rowBytes + index * 2
	return (rows[i] << 8) | rows[i + 1]
}

interface Ancillary {
	palette: Uint8Array | null
	transparency: Uint8Array | null
}

function writePassPixels(
	image: RgbaImage,
	header: Header,
	extra: Ancillary,
	rows: Uint8Array,
	rowBytes: number,
	passWidth: number,
	passHeight: number,
	mapX: (x: number) => number,
	mapY: (y: number) => number,
): void {
	const { colorType, bitDepth } = header
	const channels = CHANNELS[colorType]
	const scale = bitDepth < 8 ? 255 / ((1 << bitDepth) - 1) : 1
	const trns = extra.transparency
	for (let y = 0; y < passHeight; y++) {
		for (let x = 0; x < passWidth; x++) {
			const di = (mapY(y) * image.width + mapX(x)) * 4
			let r: number
			let g: number
			let b: number
			let a = 255
			if (colorType === 3) {
				const index = sample(rows, rowBytes, y, x, bitDepth)
				const palette = extra.palette as Uint8Array
				if (index * 3 + 2 >= palette.length)
					throw new PngError('palette', 'Palette index out of range')
				r = palette[index * 3]
				g = palette[index * 3 + 1]
				b = palette[index * 3 + 2]
				if (trns && index < trns.length) a = trns[index]
			} else if (colorType === 0 || colorType === 4) {
				const v = sample(rows, rowBytes, y, x * channels, bitDepth)
				r = g = b = Math.round(v * scale)
				if (colorType === 4) a = sample(rows, rowBytes, y, x * channels + 1, bitDepth)
				else if (trns && trns.length >= 2) {
					const key = bitDepth === 16 ? (trns[0] << 8) | trns[1] : trns[1]
					const raw = bitDepth === 16 ? sample16(rows, rowBytes, y, x) : v
					if (raw === key) a = 0
				}
			} else {
				r = sample(rows, rowBytes, y, x * channels, bitDepth)
				g = sample(rows, rowBytes, y, x * channels + 1, bitDepth)
				b = sample(rows, rowBytes, y, x * channels + 2, bitDepth)
				if (colorType === 6) a = sample(rows, rowBytes, y, x * channels + 3, bitDepth)
				else if (trns && trns.length >= 6) {
					const key =
						bitDepth === 16
							? [(trns[0] << 8) | trns[1], (trns[2] << 8) | trns[3], (trns[4] << 8) | trns[5]]
							: [trns[1], trns[3], trns[5]]
					const raw =
						bitDepth === 16
							? [
									sample16(rows, rowBytes, y, x * 3),
									sample16(rows, rowBytes, y, x * 3 + 1),
									sample16(rows, rowBytes, y, x * 3 + 2),
								]
							: [r, g, b]
					if (raw[0] === key[0] && raw[1] === key[1] && raw[2] === key[2]) a = 0
				}
			}
			image.data[di] = r
			image.data[di + 1] = g
			image.data[di + 2] = b
			image.data[di + 3] = a
		}
	}
}

const ADAM7 = [
	[0, 0, 8, 8],
	[4, 0, 8, 8],
	[0, 4, 4, 8],
	[2, 0, 4, 4],
	[0, 2, 2, 4],
	[1, 0, 2, 2],
	[0, 1, 1, 2],
]

function rowBytesFor(width: number, header: Header): number {
	return Math.ceil((width * CHANNELS[header.colorType] * header.bitDepth) / 8)
}

function expectedRawSize(header: Header): number {
	if (header.interlace === 0) return (rowBytesFor(header.width, header) + 1) * header.height
	let total = 0
	for (const [x0, y0, dx, dy] of ADAM7) {
		const w = Math.ceil((header.width - x0) / dx)
		const h = Math.ceil((header.height - y0) / dy)
		if (w > 0 && h > 0) total += (rowBytesFor(w, header) + 1) * h
	}
	return total
}

export interface DecodeOptions {
	maxBytes?: number
	maxDimension?: number
}

/**
 * Decodes a PNG into RGBA8. Validates the signature, chunk layout and CRCs, rejects images larger
 * than `maxDimension` before inflating, and bounds the inflated size to what the header implies.
 * Metadata chunks are ignored, so re-encoding the result strips them.
 */
export async function decodePng(
	bytes: Uint8Array,
	options: DecodeOptions = {},
): Promise<RgbaImage> {
	const maxBytes = options.maxBytes ?? MAX_PNG_BYTES
	const maxDimension = options.maxDimension ?? MAX_TEXTURE_SIZE
	if (bytes.length > maxBytes) throw new PngError('too-big', 'PNG file is too large')
	if (!isPng(bytes)) throw new PngError('signature', 'Not a PNG file')

	let offset = 8
	let header: Header | null = null
	const extra: Ancillary = { palette: null, transparency: null }
	const idat: Uint8Array[] = []
	let idatTotal = 0
	let ended = false
	let chunkCount = 0

	while (offset < bytes.length) {
		if (++chunkCount > 4096) throw new PngError('chunks', 'Too many PNG chunks')
		if (offset + 12 > bytes.length) throw new PngError('truncated', 'PNG is truncated')
		const length = readU32(bytes, offset)
		if (length > bytes.length - offset - 12) throw new PngError('truncated', 'PNG is truncated')
		const typeStart = offset + 4
		const type = String.fromCharCode(
			bytes[typeStart],
			bytes[typeStart + 1],
			bytes[typeStart + 2],
			bytes[typeStart + 3],
		)
		const dataStart = offset + 8
		const dataEnd = dataStart + length
		const storedCrc = readU32(bytes, dataEnd)
		if (crc32(bytes, typeStart, dataEnd) !== storedCrc) {
			throw new PngError('crc', `PNG chunk ${type} is corrupt`)
		}
		const data = bytes.subarray(dataStart, dataEnd)
		if (!header && type !== 'IHDR') throw new PngError('ihdr', 'PNG header is missing')

		if (type === 'IHDR') {
			if (header || length !== 13) throw new PngError('ihdr', 'Invalid PNG header')
			const width = readU32(data, 0)
			const height = readU32(data, 4)
			const bitDepth = data[8]
			const colorType = data[9]
			const interlace = data[12]
			if (width === 0 || height === 0) throw new PngError('size', 'Empty image')
			if (width > maxDimension || height > maxDimension) {
				throw new PngError('size', `Image is larger than ${maxDimension}px`)
			}
			if (!(colorType in CHANNELS) || !VALID_DEPTHS[colorType].includes(bitDepth)) {
				throw new PngError('format', 'Unsupported PNG color format')
			}
			if (data[10] !== 0 || data[11] !== 0 || interlace > 1) {
				throw new PngError('format', 'Unsupported PNG compression or interlace')
			}
			header = { width, height, bitDepth, colorType, interlace }
		} else if (type === 'PLTE') {
			if (length % 3 !== 0 || length === 0 || length > 768)
				throw new PngError('palette', 'Bad palette')
			extra.palette = data.slice()
		} else if (type === 'tRNS') {
			extra.transparency = data.slice()
		} else if (type === 'IDAT') {
			idatTotal += length
			if (idatTotal > maxBytes) throw new PngError('too-big', 'PNG data is too large')
			idat.push(data)
		} else if (type === 'IEND') {
			ended = true
			break
		} else if ((bytes[typeStart] & 0x20) === 0) {
			throw new PngError('chunk', `Unknown critical chunk ${type}`)
		}
		offset = dataEnd + 4
	}

	if (!header) throw new PngError('ihdr', 'PNG header is missing')
	if (!ended) throw new PngError('truncated', 'PNG end marker is missing')
	if (header.colorType === 3 && !extra.palette) throw new PngError('palette', 'Palette is missing')
	if (idat.length === 0) throw new PngError('truncated', 'PNG has no image data')

	const compressed = new Uint8Array(idatTotal)
	let at = 0
	for (const part of idat) {
		compressed.set(part, at)
		at += part.length
	}
	const expected = expectedRawSize(header)
	const raw = await inflateLimited(compressed, expected)
	if (raw.length < expected) throw new PngError('truncated', 'Image data is truncated')

	const image = createImage(header.width, header.height)
	const bpp = Math.max(1, Math.ceil((CHANNELS[header.colorType] * header.bitDepth) / 8))
	if (header.interlace === 0) {
		const rowBytes = rowBytesFor(header.width, header)
		const { rows } = unfilter(raw, 0, header.width, header.height, bpp, rowBytes)
		writePassPixels(
			image,
			header,
			extra,
			rows,
			rowBytes,
			header.width,
			header.height,
			(x) => x,
			(y) => y,
		)
	} else {
		let p = 0
		for (const [x0, y0, dx, dy] of ADAM7) {
			const w = Math.ceil((header.width - x0) / dx)
			const h = Math.ceil((header.height - y0) / dy)
			if (w <= 0 || h <= 0) continue
			const rowBytes = rowBytesFor(w, header)
			const { rows, next } = unfilter(raw, p, w, h, bpp, rowBytes)
			p = next
			writePassPixels(
				image,
				header,
				extra,
				rows,
				rowBytes,
				w,
				h,
				(x) => x0 + x * dx,
				(y) => y0 + y * dy,
			)
		}
	}
	return image
}

function chunk(type: string, data: Uint8Array): Uint8Array {
	const out = new Uint8Array(12 + data.length)
	writeU32(out, 0, data.length)
	for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
	out.set(data, 8)
	writeU32(out, 8 + data.length, crc32(out, 4, 8 + data.length))
	return out
}

/** Encodes RGBA8 with per-row adaptive filtering. Only IHDR, IDAT and IEND are written. */
export async function encodePng(image: RgbaImage): Promise<Uint8Array> {
	const { width, height, data } = image
	const rowBytes = width * 4
	const raw = new Uint8Array((rowBytes + 1) * height)
	const candidate = new Uint8Array(rowBytes)
	const best = new Uint8Array(rowBytes)
	for (let y = 0; y < height; y++) {
		const row = y * rowBytes
		let bestFilter = 0
		let bestScore = Infinity
		for (let filter = 0; filter <= 4; filter++) {
			let score = 0
			for (let x = 0; x < rowBytes; x++) {
				const value = data[row + x]
				const left = x >= 4 ? data[row + x - 4] : 0
				const up = y > 0 ? data[row - rowBytes + x] : 0
				const upLeft = y > 0 && x >= 4 ? data[row - rowBytes + x - 4] : 0
				let out: number
				if (filter === 0) out = value
				else if (filter === 1) out = value - left
				else if (filter === 2) out = value - up
				else if (filter === 3) out = value - ((left + up) >> 1)
				else out = value - paeth(left, up, upLeft)
				out &= 255
				candidate[x] = out
				score += out < 128 ? out : 256 - out
			}
			if (score < bestScore) {
				bestScore = score
				bestFilter = filter
				best.set(candidate)
			}
		}
		raw[y * (rowBytes + 1)] = bestFilter
		raw.set(best, y * (rowBytes + 1) + 1)
	}
	const ihdr = new Uint8Array(13)
	writeU32(ihdr, 0, width)
	writeU32(ihdr, 4, height)
	ihdr[8] = 8
	ihdr[9] = 6
	const parts = [
		new Uint8Array(SIGNATURE),
		chunk('IHDR', ihdr),
		chunk('IDAT', await deflate(raw)),
		chunk('IEND', new Uint8Array(0)),
	]
	const total = parts.reduce((sum, part) => sum + part.length, 0)
	const out = new Uint8Array(total)
	let offset = 0
	for (const part of parts) {
		out.set(part, offset)
		offset += part.length
	}
	return out
}

export function bytesToBase64(bytes: Uint8Array): string {
	let binary = ''
	const step = 0x8000
	for (let i = 0; i < bytes.length; i += step) {
		binary += String.fromCharCode(...bytes.subarray(i, i + step))
	}
	return btoa(binary)
}

export function base64ToBytes(text: string, maxBytes: number): Uint8Array {
	if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text)) throw new PngError('base64', 'Invalid base64 data')
	if ((text.length * 3) / 4 > maxBytes + 3)
		throw new PngError('too-big', 'Embedded data is too large')
	const binary = atob(text)
	const out = new Uint8Array(binary.length)
	for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
	return out
}
