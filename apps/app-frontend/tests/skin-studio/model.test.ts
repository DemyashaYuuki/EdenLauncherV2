import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
	builtinModel,
	FACE_NAMES,
	type FaceName,
	faceRegion,
	facePointToTexel,
	faceTexCoord,
	mirrorTexel,
	type ModelDefinition,
	regionsAt,
	regionsInPixels,
	texCoordToFractions,
	textureFaceFor,
	textureScale,
} from '../../src/skin-studio/engine/model.ts'
import { readFixture } from './helpers.ts'

const classic = builtinModel('player-classic') as ModelDefinition
const slim = builtinModel('player-slim') as ModelDefinition
const legacy = builtinModel('player-legacy') as ModelDefinition

function box(model: ModelDefinition, id: string) {
	const found = model.boxes.find((b) => b.id === id)
	assert.ok(found, id)
	return found
}

test('classic base face regions match the design kit UV map', () => {
	const map = JSON.parse(readFixture('classic-uv-map.json')).baseFaces as Record<
		string,
		Record<FaceName, [number, number, number, number]>
	>
	for (const [part, faces] of Object.entries(map)) {
		const b = box(classic, part)
		for (const face of FACE_NAMES) {
			const r = faceRegion(b, face)
			assert.deepEqual([r.x, r.y, r.w, r.h], faces[face], `${part}.${face}`)
		}
	}
})

test('face orientation: front columns run to the viewer right, sides wrap toward the front', () => {
	const head = box(classic, 'head')
	assert.deepEqual(faceTexCoord(head, 'front', { fx: 0, fy: 0, fz: 0 }), [8, 8])
	assert.deepEqual(faceTexCoord(head, 'front', { fx: 1, fy: 1, fz: 0 }), [16, 16])
	assert.deepEqual(faceTexCoord(head, 'back', { fx: 1, fy: 0, fz: 1 }), [24, 8])
	assert.deepEqual(faceTexCoord(head, 'right', { fx: 0, fy: 0, fz: 0 }), [8, 8])
	assert.deepEqual(faceTexCoord(head, 'left', { fx: 1, fy: 0, fz: 0 }), [16, 8])
	assert.deepEqual(faceTexCoord(head, 'top', { fx: 0, fy: 0, fz: 0 }), [8, 8])
	assert.deepEqual(faceTexCoord(head, 'bottom', { fx: 0, fy: 1, fz: 0 }), [16, 8])
})

test('adjacent faces share their edge in the texture unfolding', () => {
	for (const model of [classic, slim]) {
		for (const b of model.boxes) {
			for (let k = 0; k <= 4; k++) {
				const t = k / 4
				assert.deepEqual(
					faceTexCoord(b, 'top', { fx: t, fy: 0, fz: 0 }),
					faceTexCoord(b, 'front', { fx: t, fy: 0, fz: 0 }),
				)
				assert.deepEqual(
					faceTexCoord(b, 'right', { fx: 0, fy: t, fz: 0 }),
					faceTexCoord(b, 'front', { fx: 0, fy: t, fz: 0 }),
				)
				assert.deepEqual(
					faceTexCoord(b, 'left', { fx: 1, fy: t, fz: 0 }),
					faceTexCoord(b, 'front', { fx: 1, fy: t, fz: 0 }),
				)
				assert.deepEqual(
					faceTexCoord(b, 'left', { fx: 1, fy: t, fz: 1 }),
					faceTexCoord(b, 'back', { fx: 1, fy: t, fz: 1 }),
				)
			}
		}
	}
})

test('every texel of every face maps to a surface point and back to itself', () => {
	for (const [model, w, h] of [
		[classic, 64, 64],
		[slim, 64, 64],
		[legacy, 64, 32],
		[classic, 128, 128],
	] as const) {
		const scale = textureScale(model, w, h)
		for (const b of model.boxes) {
			for (const face of FACE_NAMES) {
				const r = faceRegion(b, textureFaceFor(b, face))
				for (let y = r.y * scale.sy; y < (r.y + r.h) * scale.sy; y++) {
					for (let x = r.x * scale.sx; x < (r.x + r.w) * scale.sx; x++) {
						const f = texCoordToFractions(b, face, (x + 0.5) / scale.sx, (y + 0.5) / scale.sy)
						assert.deepEqual(facePointToTexel(b, face, f, scale), [x, y], `${model.id}/${b.id}/${face}/${x},${y}`)
					}
				}
			}
		}
	}
})

test('slim arms are three pixels wide', () => {
	assert.deepEqual(faceRegion(box(slim, 'rightArm'), 'front'), { x: 44, y: 20, w: 3, h: 12 })
	assert.deepEqual(faceRegion(box(slim, 'rightArm'), 'back'), { x: 51, y: 20, w: 3, h: 12 })
	assert.deepEqual(faceRegion(box(slim, 'leftArm'), 'left'), { x: 39, y: 52, w: 4, h: 12 })
})

test('legacy left limbs mirror the right limb texture', () => {
	const left = box(legacy, 'leftArm')
	const right = box(legacy, 'rightArm')
	assert.equal(textureFaceFor(left, 'left'), 'right')
	assert.deepEqual(faceTexCoord(left, 'front', { fx: 0, fy: 0, fz: 0 }), faceTexCoord(right, 'front', { fx: 1, fy: 0, fz: 0 }))
	assert.deepEqual(faceTexCoord(left, 'left', { fx: 1, fy: 0.5, fz: 0.25 }), faceTexCoord(right, 'right', { fx: 0, fy: 0.5, fz: 0.25 }))
})

test('symmetry maps body halves and limbs onto each other', () => {
	const regions = regionsInPixels(classic, 64, 64)
	const m = (x: number, y: number) => mirrorTexel(classic, 64, 64, regions, x, y)
	assert.deepEqual(m(8, 10), [15, 10])
	assert.deepEqual(m(0, 10), [23, 10])
	assert.deepEqual(m(7, 10), [16, 10])
	assert.deepEqual(m(44, 20), [39, 52])
	assert.deepEqual(m(4, 20), [23, 52])
	assert.deepEqual(m(40, 8), [47, 8])
	for (let y = 0; y < 64; y++) {
		for (let x = 0; x < 64; x++) {
			const target = m(x, y)
			if (!target) continue
			assert.deepEqual(m(target[0], target[1]), [x, y], `involution at ${x},${y}`)
		}
	}
	const slimRegions = regionsInPixels(slim, 64, 64)
	assert.deepEqual(mirrorTexel(slim, 64, 64, slimRegions, 44, 25), [38, 57])
})

test('2D hit testing finds the face under a texel', () => {
	const regions = regionsInPixels(classic, 64, 64)
	const hits = regionsAt(regions, 10, 12)
	assert.equal(hits.length, 1)
	assert.equal(classic.boxes[hits[0].box].id, 'head')
	assert.equal(hits[0].face, 'front')
	assert.equal(regionsAt(regions, 60, 0).length, 0)
})
