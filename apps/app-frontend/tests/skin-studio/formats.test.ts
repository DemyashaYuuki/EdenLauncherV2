import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'

import { createImage, getPixel, imagesEqual, setPixel } from '../../src/skin-studio/engine/image.ts'
import { builtinModel, type ModelDefinition } from '../../src/skin-studio/engine/model.ts'
import {
	PaletteError,
	parseAco,
	parseAct,
	parseGpl,
	parseJsonPalette,
	parsePalette,
	parseSwtch,
	writeAco,
	writeAct,
	writeGpl,
	writePalette,
	writeSwtch,
} from '../../src/skin-studio/engine/palette.ts'
import { encodePng } from '../../src/skin-studio/engine/png.ts'
import {
	importPngTexture,
	parseProject,
	ProjectError,
	safeFileStem,
	serializeProject,
	uniqueStem,
} from '../../src/skin-studio/engine/project.ts'
import {
	importTcn,
	ModelImportError,
	stripTechneImages,
	techneToModel,
} from '../../src/skin-studio/engine/tcn.ts'
import { parseXml, XmlError } from '../../src/skin-studio/engine/xml.ts'
import { isSafeEntryName, readZipDirectory, ZipError } from '../../src/skin-studio/engine/zip.ts'
import { buildZip, readAsset, srcRoot } from './helpers.ts'

const palette = {
	name: 'Test',
	swatches: [
		{ r: 255, g: 0, b: 0, a: 255, name: 'Red' },
		{ r: 18, g: 52, b: 86, a: 255, name: 'Blue-ish' },
		{ r: 0, g: 0, b: 0, a: 0 },
	],
}

test('GIMP palettes round-trip, including RGBA channels', () => {
	const parsed = parseGpl(writeGpl(palette), 'x')
	assert.equal(parsed.name, 'Test')
	assert.deepEqual(
		parsed.swatches.map((s) => [s.r, s.g, s.b, s.a]),
		palette.swatches.map((s) => [s.r, s.g, s.b, s.a]),
	)
	const kit = parseGpl(new TextDecoder().decode(readAsset('palettes/eden-palette.gpl')), 'x')
	assert.equal(kit.swatches.length, 8)
	assert.deepEqual([kit.swatches[1].r, kit.swatches[1].g, kit.swatches[1].b], [111, 224, 205])
	assert.throws(() => parseGpl('Not a palette', 'x'), PaletteError)
	assert.throws(() => parseGpl('GIMP Palette\n300 0 0 a', 'x'), PaletteError)
})

test('Photoshop ACO v1+v2 round-trips names and RGB', () => {
	const parsed = parseAco(writeAco(palette), 'x')
	assert.equal(parsed.swatches[1].name, 'Blue-ish')
	assert.deepEqual([parsed.swatches[1].r, parsed.swatches[1].g, parsed.swatches[1].b], [18, 52, 86])
})

test('ACO HSB and CMYK colours convert; unsupported spaces and versions fail loudly', () => {
	const make = (space: number, values: number[], version = 1) => {
		const bytes = new Uint8Array(14)
		const v = new DataView(bytes.buffer)
		v.setUint16(0, version)
		v.setUint16(2, 1)
		v.setUint16(4, space)
		values.forEach((n, i) => v.setUint16(6 + i * 2, n))
		return bytes
	}
	assert.deepEqual(
		(({ r, g, b }) => [r, g, b])(parseAco(make(1, [0, 65535, 65535, 0]), 'x').swatches[0]),
		[255, 0, 0],
	)
	assert.deepEqual(
		(({ r, g, b }) => [r, g, b])(parseAco(make(2, [65535, 0, 0, 65535]), 'x').swatches[0]),
		[255, 0, 0],
	)
	assert.throws(
		() => parseAco(make(7, [0, 0, 0, 0]), 'x'),
		(e: PaletteError) => e.code === 'colorspace',
	)
	assert.throws(
		() => parseAco(make(0, [0, 0, 0, 0], 5), 'x'),
		(e: PaletteError) => e.code === 'version',
	)
	assert.throws(
		() => parseAco(make(0, [0, 0, 0, 0]).subarray(0, 8), 'x'),
		(e: PaletteError) => e.code === 'truncated',
	)
})

test('ACT handles 768 and 772 byte tables with a transparent index', () => {
	const bytes = writeAct(palette)
	assert.equal(bytes.length, 772)
	const parsed = parseAct(bytes, 'x')
	assert.equal(parsed.swatches.length, 3)
	assert.equal(parsed.swatches[2].a, 0)
	assert.equal(parseAct(bytes.subarray(0, 768), 'x').swatches.length, 256)
	assert.throws(() => parseAct(new Uint8Array(100), 'x'), PaletteError)
})

test('MCSkin3D .swtch and design kit JSON palettes', () => {
	const parsed = parseSwtch(writeSwtch(palette), 'swatch')
	assert.equal(parsed.swatches[0].name, 'Red')
	assert.equal(parsed.swatches[2].a, 0)
	const kit = parseJsonPalette(
		new TextDecoder().decode(readAsset('palettes/signal-palette.json')),
		'x',
	)
	assert.ok(kit.swatches.length > 0)
	for (const format of ['gpl', 'aco', 'act', 'swtch', 'json'] as const) {
		const again = parsePalette(format, writePalette(format, palette), 'x')
		assert.equal(again.swatches[0].r, 255, format)
	}
	assert.throws(() => parsePalette('gpl', new Uint8Array(2 * 1024 * 1024), 'x'), PaletteError)
})

test('XML reader refuses DTDs, entities and stray processing instructions', () => {
	assert.throws(() => parseXml('<!DOCTYPE x [<!ENTITY a "b">]><x>&a;</x>'), XmlError)
	assert.throws(() => parseXml('<x>&undefined;</x>'), XmlError)
	assert.throws(() => parseXml('<x><?php evil ?></x>'), XmlError)
	assert.throws(() => parseXml('<a><b></a>'), XmlError)
	const doc = parseXml('<?xml version="1.0"?><a k="1 &amp; 2"><b>x&lt;y</b><![CDATA[<raw>]]></a>')
	assert.equal(doc.attributes.k, '1 & 2')
	assert.equal(doc.children[0].text, 'x<y')
	assert.equal(doc.text, '<raw>')
})

const TECHNE = `<?xml version="1.0" encoding="utf-8"?>
<Techne Version="2.2"><Models><Model Texture="t.png"><Name>Box</Name><TextureSize>64,32</TextureSize>
<Geometry><Folder Type="x" Name="Body">
<Shape Type="d9e621f7-957f-4b77-b1ae-20dcd0da7751" Name="Cube"><IsMirrored>True</IsMirrored>
<Offset>-4,-8,-4</Offset><Position>0,24,0</Position><Rotation>0,45,0</Rotation><Size>8,8,8</Size>
<TextureOffset>0,0</TextureOffset><Scale>0.5</Scale><Part>None</Part><IsArmor>True</IsArmor></Shape>
<Shape Type="ab894c83-e399-4236-808b-25a78d56f5e1" Name="Plane"><Size>4,0,4</Size></Shape>
</Folder></Geometry></Model></Models></Techne>`

test('Techne XML converts to a box model with warnings for unsupported shapes', () => {
	const { model, warnings } = techneToModel(TECHNE)
	assert.equal(model.boxes.length, 1)
	const box = model.boxes[0]
	assert.deepEqual(box.pivot, [0, 24, 0])
	assert.deepEqual(box.rotation, [0, 45, 0])
	assert.equal(box.mirror, true)
	assert.equal(box.layer, 'overlay')
	assert.equal(box.inflate, 0.5)
	assert.deepEqual(warnings, ['planes:1'])
	assert.throws(() => techneToModel(TECHNE.replace('8,8,8', '8,8,x')), ModelImportError)
	assert.throws(() => techneToModel('<NotTechne/>'), ModelImportError)
})

test('TCN archives import safely; zip slip, oversized and corrupt entries are rejected', async () => {
	const xml = new TextEncoder().encode(TECHNE)
	const tcn = await buildZip([{ name: 'model.xml', data: xml, compress: true }])
	const { model } = await importTcn(tcn)
	assert.equal(model.name, 'Box')

	assert.equal(isSafeEntryName('../evil.xml'), false)
	assert.equal(isSafeEntryName('C:/evil.xml'), false)
	assert.equal(isSafeEntryName('a\\b.xml'), false)
	assert.equal(isSafeEntryName('dir/model.xml'), true)
	const slip = await buildZip([{ name: '../../model.xml', data: xml }])
	assert.throws(
		() => readZipDirectory(slip),
		(e: ZipError) => e.code === 'unsafe-name',
	)

	const bombData = new Uint8Array(4 * 1024 * 1024)
	const lying = await buildZip([
		{ name: 'model.xml', data: bombData, compress: true, declaredSize: 100 },
	])
	await assert.rejects(importTcn(lying), ZipError)
	const huge = await buildZip([
		{ name: 'model.xml', data: new Uint8Array(10), declaredSize: 64 * 1024 * 1024 },
	])
	assert.throws(
		() => readZipDirectory(huge),
		(e: ZipError) => e.code === 'too-big',
	)
	await assert.rejects(importTcn(new Uint8Array([1, 2, 3])), ZipError)
})

test('all bundled MCSkin3D models import, contain only geometry and no embedded artwork', () => {
	const root = resolve(srcRoot, 'assets/eden/skin-studio/models')
	let count = 0
	for (const category of readdirSync(root, { withFileTypes: true })) {
		if (!category.isDirectory()) continue
		for (const file of readdirSync(resolve(root, category.name))) {
			if (!file.endsWith('.xml')) continue
			const xml = readFileSync(resolve(root, category.name, file), 'utf8')
			assert.equal(xml.includes('iVBOR'), false, file)
			assert.equal(stripTechneImages(xml), xml, file)
			const { model, warnings } = techneToModel(xml)
			assert.ok(model.boxes.length > 0, file)
			assert.deepEqual(warnings, [], file)
			count++
		}
	}
	assert.equal(count, 48)
})

test('projects round-trip and reject tampered input', async () => {
	const model = builtinModel('player-slim') as ModelDefinition
	const image = createImage(64, 64)
	setPixel(image, 44, 20, [9, 8, 7, 255])
	const bytes = await serializeProject({
		name: 'My skin',
		model,
		image,
		palette,
		createdAt: '2026-10-24T10:00:00.000Z',
		updatedAt: '2026-10-24T11:00:00.000Z',
	})
	const parsed = await parseProject(bytes)
	assert.equal(parsed.name, 'My skin')
	assert.equal(parsed.model.id, 'player-slim')
	assert.ok(imagesEqual(parsed.image, image))
	assert.equal(parsed.palette?.swatches.length, 3)

	const doc = JSON.parse(new TextDecoder().decode(bytes))
	const tamper = async (
		mutate: (d: {
			version: number
			format: string
			model: unknown
			texture: { width: number; png: string }
			path?: string
			name: string
		}) => void,
	) => {
		const copy = structuredClone(doc)
		mutate(copy)
		return parseProject(new TextEncoder().encode(JSON.stringify(copy)))
	}
	await assert.rejects(
		tamper((d) => (d.version = 99)),
		(e: ProjectError) => e.code === 'newer-version',
	)
	await assert.rejects(
		tamper((d) => (d.format = 'other')),
		ProjectError,
	)
	await assert.rejects(
		tamper((d) => (d.model = { id: 'no-such-model' })),
		ProjectError,
	)
	await assert.rejects(
		tamper((d) => (d.texture.width = 128)),
		ProjectError,
	)
	await assert.rejects(
		tamper((d) => (d.texture.png = '!!!')),
		ProjectError,
	)
	await assert.rejects(
		tamper(
			(d) =>
				(d.model = { definition: { ...model, boxes: [{ ...model.boxes[0], size: [1e9, 1, 1] }] } }),
		),
		ProjectError,
	)
	const withPath = await tamper((d) => {
		d.path = 'C:/Windows/System32/evil.edenskin'
		d.name = 'x\u0000y'
	})
	assert.equal(withPath.name, 'xy')
	assert.equal('path' in withPath, false)
	await assert.rejects(parseProject(new TextEncoder().encode('{')), ProjectError)
})

test('custom model definitions survive a project round-trip', async () => {
	const { model } = techneToModel(TECHNE)
	const image = createImage(128, 64)
	const parsed = await parseProject(
		await serializeProject({
			name: 'Mob',
			model,
			image,
			palette: null,
			createdAt: '',
			updatedAt: '',
		}),
	)
	assert.equal(parsed.model.boxes.length, 1)
	assert.equal(parsed.model.boxes[0].mirror, true)
	assert.equal(parsed.image.width, 128)
})

test('PNG import picks legacy, classic or slim and accepts HD multiples', async () => {
	const legacy = await importPngTexture(await encodePng(createImage(64, 32, [1, 1, 1, 255])))
	assert.equal(legacy.model.id, 'player-legacy')
	const classicImage = createImage(64, 64, [1, 1, 1, 255])
	assert.equal((await importPngTexture(await encodePng(classicImage))).model.id, 'player-classic')
	const slimImage = createImage(64, 64)
	setPixel(slimImage, 44, 20, [1, 1, 1, 255])
	assert.equal((await importPngTexture(await encodePng(slimImage))).model.id, 'player-slim')
	const hd = await importPngTexture(await encodePng(createImage(256, 256, [1, 1, 1, 255])))
	assert.equal(hd.hd, true)
	await assert.rejects(importPngTexture(await encodePng(createImage(64, 48))), ProjectError)
	const ranger = await importPngTexture(readAsset('textures/eden-ranger.png'))
	assert.equal(getPixel(ranger.image, 8, 8)[3], 255)
})

test('file names are sanitised and made unique', () => {
	assert.equal(safeFileStem('a/b\\c:d*e?'), 'a b c d e')
	assert.equal(safeFileStem('CON'), 'CON_')
	assert.equal(safeFileStem('...'), 'skin')
	assert.equal(safeFileStem('name. '), 'name')
	assert.equal(uniqueStem('Skin', ['skin', 'Skin (2)']), 'Skin (3)')
})
