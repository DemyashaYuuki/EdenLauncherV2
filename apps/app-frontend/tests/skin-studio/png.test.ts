import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createImage, getPixel, imagesEqual, setPixel } from '../../src/skin-studio/engine/image.ts'
import {
	crc32,
	decodePng,
	deflate,
	encodePng,
	inflateLimited,
	PngError,
	readPngInfo,
} from '../../src/skin-studio/engine/png.ts'
import { concat, ihdr, pngChunk, rawPng, readAsset, SIGNATURE } from './helpers.ts'

test('crc32 matches the reference value', () => {
	assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926)
})

test('round-trips RGBA pixels through encode and decode', async () => {
	const image = createImage(64, 64)
	for (let y = 0; y < 64; y++) {
		for (let x = 0; x < 64; x++) setPixel(image, x, y, [x * 4, y * 4, (x ^ y) & 255, (x + y) % 256])
	}
	const bytes = await encodePng(image)
	const decoded = await decodePng(bytes)
	assert.ok(imagesEqual(image, decoded))
})

test('decodes the original design kit skins', async () => {
	for (const name of ['eden-ranger.png', 'signal-operator.png']) {
		const image = await decodePng(readAsset(`textures/${name}`))
		assert.equal(image.width, 64)
		assert.equal(image.height, 64)
		assert.equal(getPixel(image, 8, 8)[3], 255)
	}
})

test('decodes palette PNGs with tRNS', async () => {
	const palette = pngChunk('PLTE', [255, 0, 0, 0, 255, 0])
	const trns = pngChunk('tRNS', [255, 0])
	const scanlines = new Uint8Array([0, 0b01000000])
	const bytes = await rawPng(2, 1, 1, 3, scanlines, [palette, trns])
	const image = await decodePng(bytes)
	assert.deepEqual(getPixel(image, 0, 0), [255, 0, 0, 255])
	assert.deepEqual(getPixel(image, 1, 0), [0, 255, 0, 0])
})

test('decodes 16-bit grayscale+alpha and RGB with filters', async () => {
	const gray = new Uint8Array([0, 0x80, 0x00, 0xff, 0xff])
	const g = await decodePng(await rawPng(1, 1, 16, 4, gray))
	assert.deepEqual(getPixel(g, 0, 0), [0x80, 0x80, 0x80, 0xff])
	const rgb = new Uint8Array([1, 10, 20, 30, 5, 5, 5, 2, 1, 1, 1, 1, 1, 1])
	const c = await decodePng(await rawPng(2, 2, 8, 2, rgb))
	assert.deepEqual(getPixel(c, 1, 0), [15, 25, 35, 255])
	assert.deepEqual(getPixel(c, 0, 1), [11, 21, 31, 255])
	assert.deepEqual(getPixel(c, 1, 1), [16, 26, 36, 255])
})

test('decodes Adam7 interlaced images', async () => {
	const width = 3
	const height = 3
	const passes = [
		[0, 0, 8, 8],
		[4, 0, 8, 8],
		[0, 4, 4, 8],
		[2, 0, 4, 4],
		[0, 2, 2, 4],
		[1, 0, 2, 2],
		[0, 1, 1, 2],
	]
	const value = (x: number, y: number) => y * width + x + 1
	const bytes: number[] = []
	for (const [x0, y0, dx, dy] of passes) {
		for (let y = y0; y < height; y += dy) {
			const row: number[] = []
			for (let x = x0; x < width; x += dx) row.push(value(x, y))
			if (row.length) bytes.push(0, ...row)
		}
	}
	const image = await decodePng(await rawPng(width, height, 8, 0, new Uint8Array(bytes), [], 1))
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) assert.equal(getPixel(image, x, y)[0], value(x, y))
	}
})

test('rejects a non-PNG signature', async () => {
	await assert.rejects(decodePng(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9])), (e: PngError) => e.code === 'signature')
})

test('rejects oversized dimensions before inflating', async () => {
	const bytes = concat(SIGNATURE, ihdr(8192, 64, 8, 6), pngChunk('IDAT', [0]), pngChunk('IEND', []))
	await assert.rejects(decodePng(bytes), (e: PngError) => e.code === 'size')
	assert.equal(readPngInfo(bytes).width, 8192)
})

test('stops a decompression bomb at the size implied by the header', async () => {
	const bomb = await deflate(new Uint8Array(20 * 1024 * 1024))
	const bytes = concat(SIGNATURE, ihdr(64, 64, 8, 6), pngChunk('IDAT', bomb), pngChunk('IEND', []))
	assert.ok(bomb.length < 64 * 1024)
	await assert.rejects(decodePng(bytes), (e: PngError) => e.code === 'inflate-limit')
	await assert.rejects(inflateLimited(bomb, 1024), (e: PngError) => e.code === 'inflate-limit')
})

test('rejects corrupt chunk CRCs', async () => {
	const bytes = await encodePng(createImage(8, 8, [1, 2, 3, 255]))
	bytes[bytes.length - 20] ^= 0xff
	await assert.rejects(decodePng(bytes), PngError)
})

test('re-encoding strips metadata chunks', async () => {
	const image = createImage(8, 8, [10, 20, 30, 255])
	const original = await encodePng(image)
	const withText = concat(
		original.subarray(0, 33),
		pngChunk('tEXt', [...new TextEncoder().encode('Comment\0secret')]),
		original.subarray(33),
	)
	const decoded = await decodePng(withText)
	const reencoded = await encodePng(decoded)
	assert.equal(new TextDecoder('latin1').decode(reencoded).includes('tEXt'), false)
	assert.ok(imagesEqual(decoded, image))
})

test('rejects unknown critical chunks', async () => {
	const original = await encodePng(createImage(8, 8))
	const bytes = concat(original.subarray(0, 33), pngChunk('ABCD', [1]), original.subarray(33))
	await assert.rejects(decodePng(bytes), (e: PngError) => e.code === 'chunk')
})
