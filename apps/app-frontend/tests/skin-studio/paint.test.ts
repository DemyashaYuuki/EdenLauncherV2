import assert from 'node:assert/strict'
import { test } from 'node:test'

import { History } from '../../src/skin-studio/engine/history.ts'
import {
	cloneImage,
	convertArmWidth,
	convertLegacyToModern,
	createImage,
	getPixel,
	imagesEqual,
	looksSlim,
	type Rgba,
	setPixel,
} from '../../src/skin-studio/engine/image.ts'
import { builtinModel, type ModelDefinition, mirrorTexel, regionsInPixels } from '../../src/skin-studio/engine/model.ts'
import {
	brushMask,
	capturePattern,
	defaultToolSettings,
	floodFill,
	pickColor,
	Stroke,
	type ToolSettings,
} from '../../src/skin-studio/engine/paint.ts'

const RED: Rgba = [255, 0, 0, 255]
const settings = (patch: Partial<ToolSettings> = {}): ToolSettings => ({ ...defaultToolSettings(), ...patch })

function countOpaque(image: ReturnType<typeof createImage>): number {
	let n = 0
	for (let i = 3; i < image.data.length; i += 4) if (image.data[i] > 0) n++
	return n
}

test('brush masks: square and round footprints', () => {
	assert.equal(brushMask('square', 3).coverage.reduce((a, b) => a + b, 0), 9)
	const round = brushMask('circle', 5)
	assert.equal(round.coverage[0], 0)
	assert.equal(round.coverage[12], 1)
	assert.equal(brushMask('square', 999).width, 64)
})

test('a pencil stroke interpolates between pointer samples without gaps', () => {
	const image = createImage(64, 64)
	const stroke = new Stroke({ image, tool: 'pencil', color: RED, settings: settings() })
	stroke.lineTo(2, 2)
	stroke.lineTo(40, 10)
	stroke.lineTo(41, 60)
	const patch = stroke.finish()
	assert.ok(patch)
	for (const [x, y] of [
		[2, 2],
		[40, 10],
		[41, 60],
		[21, 6],
	]) {
		assert.deepEqual(getPixel(image, x, y), RED, `${x},${y}`)
	}
	for (let x = 2; x <= 40; x++) {
		let found = false
		for (let y = 0; y < 64; y++) if (getPixel(image, x, y)[3]) found = true
		assert.ok(found, `column ${x} painted`)
	}
	assert.equal(patch.pixels.length, countOpaque(image))
})

test('opacity composites over existing colours', () => {
	const image = createImage(4, 4, [0, 0, 255, 255])
	const stroke = new Stroke({ image, tool: 'pencil', color: RED, settings: settings({ opacity: 0.5 }) })
	stroke.dab(1, 1)
	assert.deepEqual(getPixel(image, 1, 1), [128, 0, 128, 255])
})

test('non-incremental strokes apply once per pixel, incremental strokes accumulate', () => {
	const once = createImage(4, 4)
	const a = new Stroke({ image: once, tool: 'pencil', color: RED, settings: settings({ opacity: 0.5 }) })
	a.dab(1, 1)
	a.dab(1, 1)
	a.dab(1, 1)
	assert.equal(getPixel(once, 1, 1)[3], 128)
	const many = createImage(4, 4)
	const b = new Stroke({
		image: many,
		tool: 'pencil',
		color: RED,
		settings: settings({ opacity: 0.5, incremental: true }),
	})
	b.dab(1, 1)
	b.dab(1, 1)
	assert.equal(getPixel(many, 1, 1)[3], 192)
})

test('eraser clears to transparent black at full opacity', () => {
	const image = createImage(4, 4, [10, 20, 30, 255])
	const stroke = new Stroke({ image, tool: 'eraser', color: RED, settings: settings() })
	stroke.dab(2, 2)
	assert.deepEqual(getPixel(image, 2, 2), [0, 0, 0, 0])
	assert.deepEqual(getPixel(image, 1, 1), [10, 20, 30, 255])
})

test('cancel restores the image, finish of an empty stroke is null', () => {
	const image = createImage(8, 8, [1, 2, 3, 255])
	const copy = cloneImage(image)
	const stroke = new Stroke({ image, tool: 'pencil', color: RED, settings: settings({ brushSize: 3 }) })
	stroke.lineTo(1, 1)
	stroke.lineTo(6, 6)
	stroke.cancel()
	assert.ok(imagesEqual(image, copy))
	const empty = new Stroke({ image, tool: 'pencil', color: [1, 2, 3, 255], settings: settings() })
	empty.dab(3, 3)
	assert.equal(empty.finish(), null)
})

test('the allowed predicate (selection, locks, hidden parts) blocks pixels', () => {
	const image = createImage(8, 8)
	const stroke = new Stroke({
		image,
		tool: 'pencil',
		color: RED,
		settings: settings({ brushSize: 8 }),
		allowed: (x, y) => x < 4 && y < 4,
	})
	stroke.dab(4, 4)
	assert.equal(countOpaque(image), 16)
})

test('mirror painting writes the symmetric texel through the model', () => {
	const model = builtinModel('player-classic') as ModelDefinition
	const regions = regionsInPixels(model, 64, 64)
	const image = createImage(64, 64)
	const stroke = new Stroke({
		image,
		tool: 'pencil',
		color: RED,
		settings: settings({ mirror: true }),
		mirror: (x, y) => mirrorTexel(model, 64, 64, regions, x, y),
	})
	stroke.dab(44, 20)
	assert.deepEqual(getPixel(image, 39, 52), RED)
	assert.equal(stroke.finish()?.pixels.length, 2)
})

test('noise is deterministic per stroke seed and keeps alpha', () => {
	const make = () => createImage(8, 8, [100, 120, 140, 200])
	const a = make()
	const b = make()
	for (const image of [a, b]) {
		const stroke = new Stroke({
			image,
			tool: 'noise',
			color: RED,
			settings: settings({ brushSize: 8, noiseStrength: 0.5 }),
			seed: 42,
		})
		stroke.dab(4, 4)
	}
	assert.ok(imagesEqual(a, b))
	assert.equal(getPixel(a, 3, 3)[3], 200)
	assert.notDeepEqual(getPixel(a, 0, 0), getPixel(a, 5, 5))
})

test('dodge brightens, burn darkens, lighten and darken shift luminance', () => {
	const run = (tool: 'dodgeBurn' | 'darkenLighten', invert: boolean) => {
		const image = createImage(2, 2, [100, 100, 100, 255])
		new Stroke({ image, tool, color: RED, settings: settings({ exposure: 1, invert }) }).dab(0, 0)
		return getPixel(image, 0, 0)[0]
	}
	assert.ok(run('dodgeBurn', false) > 100)
	assert.ok(run('dodgeBurn', true) < 100)
	assert.ok(run('darkenLighten', true) > 100)
	assert.ok(run('darkenLighten', false) < 100)
})

test('stamp copies a captured pattern', () => {
	const image = createImage(16, 16)
	setPixel(image, 2, 2, RED)
	setPixel(image, 3, 2, [0, 255, 0, 255])
	const pattern = capturePattern(image, 3, 3, 3)
	const stroke = new Stroke({ image, tool: 'stamp', color: RED, settings: settings(), pattern })
	stroke.dab(11, 11)
	assert.deepEqual(getPixel(image, 10, 10), RED)
	assert.deepEqual(getPixel(image, 11, 10), [0, 255, 0, 255])
	assert.equal(getPixel(image, 12, 12)[3], 0)
})

test('flood fill: contiguous, global, tolerance and region lock', () => {
	const base = createImage(8, 8, [0, 0, 0, 255])
	for (let y = 0; y < 8; y++) setPixel(base, 4, y, [255, 255, 255, 255])
	setPixel(base, 6, 6, [5, 5, 5, 255])

	const contiguous = cloneImage(base)
	floodFill({ image: contiguous, x: 0, y: 0, color: RED, tolerance: 0, mode: 'contiguous', opacity: 1 })
	assert.deepEqual(getPixel(contiguous, 3, 7), RED)
	assert.deepEqual(getPixel(contiguous, 5, 0), [0, 0, 0, 255])

	const global = cloneImage(base)
	floodFill({ image: global, x: 0, y: 0, color: RED, tolerance: 0, mode: 'global', opacity: 1 })
	assert.deepEqual(getPixel(global, 5, 0), RED)
	assert.deepEqual(getPixel(global, 6, 6), [5, 5, 5, 255])

	const tolerant = cloneImage(base)
	floodFill({ image: tolerant, x: 7, y: 7, color: RED, tolerance: 5, mode: 'contiguous', opacity: 1 })
	assert.deepEqual(getPixel(tolerant, 6, 6), RED)

	const locked = cloneImage(base)
	floodFill({
		image: locked,
		x: 0,
		y: 0,
		color: RED,
		tolerance: 0,
		mode: 'contiguous',
		opacity: 1,
		regions: [{ x: 0, y: 0, w: 2, h: 2 }],
	})
	assert.deepEqual(getPixel(locked, 1, 1), RED)
	assert.deepEqual(getPixel(locked, 2, 2), [0, 0, 0, 255])
	assert.deepEqual(pickColor(locked, 0, 0), RED)
})

test('history undoes and redoes complete strokes and jumps several steps', () => {
	const history = new History()
	let image = createImage(8, 8)
	const states = [cloneImage(image)]
	for (let i = 0; i < 4; i++) {
		const stroke = new Stroke({ image, tool: 'pencil', color: [i * 50, 0, 0, 255], settings: settings({ brushSize: 2 }) })
		stroke.lineTo(i, 0)
		stroke.lineTo(i, 7)
		history.push(`stroke ${i}`, { kind: 'patch', patch: stroke.finish()! })
		states.push(cloneImage(image))
	}
	assert.equal(history.list.length, 4)
	image = history.undo(image)!.image
	assert.ok(imagesEqual(image, states[3]))
	image = history.jumpTo(image, 1)
	assert.ok(imagesEqual(image, states[1]))
	image = history.redo(image)!.image
	assert.ok(imagesEqual(image, states[2]))
	image = history.jumpTo(image, 4)
	assert.ok(imagesEqual(image, states[4]))
	history.jumpTo(image, 2)
	history.push('branch', { kind: 'replace', before: cloneImage(image), after: createImage(8, 8, RED) })
	assert.equal(history.list.length, 3)
	assert.equal(history.canRedo, false)
})

test('history respects entry and memory budgets', () => {
	const small = new History({ maxEntries: 3, maxBytes: 1 << 30 })
	const image = createImage(8, 8)
	for (let i = 0; i < 10; i++) {
		small.push(`r${i}`, { kind: 'replace', before: cloneImage(image), after: cloneImage(image) })
	}
	assert.equal(small.list.length, 3)
	assert.equal(small.list[0].label, 'r7')
	const big = createImage(512, 512)
	const tight = new History({ maxEntries: 100, maxBytes: big.data.byteLength * 5 })
	for (let i = 0; i < 10; i++) tight.push(`b${i}`, { kind: 'replace', before: big, after: big })
	assert.ok(tight.bytes <= big.data.byteLength * 5)
	assert.equal(tight.cursor, tight.list.length)
})

test('legacy conversion mirrors the right limbs like the game', () => {
	const legacy = createImage(64, 32)
	setPixel(legacy, 4, 20, RED)
	setPixel(legacy, 44, 20, [0, 255, 0, 255])
	setPixel(legacy, 0, 20, [0, 0, 255, 255])
	const modern = convertLegacyToModern(legacy)
	assert.equal(modern.height, 64)
	assert.deepEqual(getPixel(modern, 23, 52), RED)
	assert.deepEqual(getPixel(modern, 39, 52), [0, 255, 0, 255])
	assert.deepEqual(getPixel(modern, 27, 52), [0, 0, 255, 255])
	assert.deepEqual(getPixel(modern, 4, 20), RED)
})

test('arm width conversion repacks the arm regions', () => {
	const classic = createImage(64, 64)
	for (let y = 16; y < 32; y++) for (let x = 40; x < 56; x++) setPixel(classic, x, y, [x, y, 0, 255])
	const slim = convertArmWidth(classic, 4, 3)
	assert.ok(looksSlim(slim))
	assert.equal(getPixel(slim, 55, 25)[3], 0)
	assert.deepEqual(getPixel(slim, 47, 25), [48, 25, 0, 255])
	const back = convertArmWidth(slim, 3, 4)
	assert.equal(looksSlim(back), false)
	assert.deepEqual(getPixel(back, 40, 25), [40, 25, 0, 255])
})
