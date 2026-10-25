import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
	commitPatch,
	createDocument,
	isDirty,
	jumpTo,
	markSaved,
	redo,
	rename,
	replaceTexture,
	undo,
} from '../../src/skin-studio/engine/document.ts'
import { convertLegacyToModern, createImage, getPixel } from '../../src/skin-studio/engine/image.ts'
import { builtinModel, type ModelDefinition } from '../../src/skin-studio/engine/model.ts'
import { defaultToolSettings, solidPatchFill, Stroke } from '../../src/skin-studio/engine/paint.ts'
import {
	LookupError,
	parseElyTextures,
	parseMojangUuid,
	parseSessionProfile,
	profileLookupUrl,
	safeTextureUrl,
} from '../../src/skin-studio/engine/providers.ts'
import {
	actionForEvent,
	comboFromEvent,
	DEFAULT_SHORTCUTS,
	findConflicts,
	isTypingTarget,
	type KeyLike,
	normalizeCombo,
	sanitizeShortcuts,
} from '../../src/skin-studio/engine/shortcuts.ts'

const key = (code: string, mods: Partial<KeyLike> = {}): KeyLike => ({
	key: '?',
	code,
	ctrlKey: false,
	altKey: false,
	shiftKey: false,
	metaKey: false,
	...mods,
})

test('undo restores imported model geometry when replacing it with a built-in model', () => {
	const classic = builtinModel('player-classic') as ModelDefinition
	const imported = { ...classic, id: 'custom-import', name: 'Imported geometry' }
	const doc = createDocument({ name: 'Custom', model: imported, image: createImage(64, 64) })
	replaceTexture(doc, 'Change model', createImage(64, 64), classic)
	undo(doc)
	assert.equal(doc.model, imported)
	redo(doc)
	assert.equal(doc.model, classic)
})

test('trimming old history cannot mark remaining edits as saved after undo', () => {
	const model = builtinModel('player-classic') as ModelDefinition
	const doc = createDocument({ name: 'History', model, image: createImage(64, 64), saved: true })
	for (let n = 1; n <= 202; n++) {
		commitPatch(doc, 'Paint', solidPatchFill(doc.image, { x: 8, y: 8, w: 1, h: 1 }, [n, 0, 0, 255]))
	}
	while (doc.history.canUndo) undo(doc)
	assert.equal(getPixel(doc.image, 8, 8)[0], 2)
	assert.equal(isDirty(doc), true)
})

test('shortcuts use physical keys so the Russian layout works', () => {
	assert.equal(comboFromEvent({ ...key('KeyZ', { ctrlKey: true }), key: 'я' }), 'Ctrl+Z')
	assert.equal(actionForEvent(DEFAULT_SHORTCUTS, { ...key('KeyB'), key: 'и' }), 'tool.pencil')
	assert.equal(
		actionForEvent(DEFAULT_SHORTCUTS, key('KeyZ', { ctrlKey: true, shiftKey: true })),
		'edit.redo',
	)
	assert.equal(actionForEvent(DEFAULT_SHORTCUTS, key('BracketRight')), 'brush.bigger')
	assert.equal(comboFromEvent(key('ShiftLeft', { shiftKey: true })), null)
})

test('custom shortcut maps are normalised, conflicts are dropped', () => {
	assert.equal(normalizeCombo(' shift + ctrl + z '), 'Ctrl+Shift+Z')
	assert.equal(normalizeCombo('ctrl+'), null)
	assert.equal(normalizeCombo('A+B'), null)
	assert.deepEqual(findConflicts(DEFAULT_SHORTCUTS), [])
	const map = sanitizeShortcuts({ 'tool.pencil': 'q', 'tool.eraser': 'Q', 'edit.undo': 42 })
	assert.equal(map['tool.pencil'], 'Q')
	assert.equal(map['tool.eraser'], 'E')
	assert.equal(map['edit.undo'], 'Ctrl+Z')
	assert.deepEqual(findConflicts(map), [])
})

test('shortcuts are ignored while typing', () => {
	assert.equal(isTypingTarget({ tagName: 'INPUT', type: 'text' }), true)
	assert.equal(isTypingTarget({ tagName: 'INPUT', type: 'range' }), false)
	assert.equal(isTypingTarget({ tagName: 'TEXTAREA' }), true)
	assert.equal(isTypingTarget({ tagName: 'DIV', isContentEditable: true }), true)
	assert.equal(isTypingTarget({ tagName: 'CANVAS' }), false)
})

test('documents track dirty state through strokes, undo, save and rename', () => {
	const model = builtinModel('player-classic') as ModelDefinition
	const doc = createDocument({ name: 'Skin', model, image: createImage(64, 64), saved: true })
	assert.equal(isDirty(doc), false)
	const paint = (x: number) => {
		const s = new Stroke({
			image: doc.image,
			tool: 'pencil',
			color: [255, 0, 0, 255],
			settings: defaultToolSettings(),
		})
		s.dab(x, 10)
		commitPatch(doc, 'Pencil', s.finish())
	}
	paint(1)
	assert.equal(isDirty(doc), true)
	undo(doc)
	assert.equal(isDirty(doc), false)
	redo(doc)
	paint(2)
	markSaved(doc, 'Skin.edenskin')
	assert.equal(isDirty(doc), false)
	jumpTo(doc, 0)
	assert.equal(isDirty(doc), true)
	assert.equal(getPixel(doc.image, 1, 10)[3], 0)
	jumpTo(doc, 2)
	assert.equal(isDirty(doc), false)
	rename(doc, 'New\u0000 name')
	assert.equal(doc.name, 'New name')
	assert.equal(isDirty(doc), true)
	assert.equal(createDocument({ name: 'x', model, image: createImage(64, 64) }).savedEntryId, -1)
})

test('legacy conversion is one undoable step that also restores the model', () => {
	const legacyModel = builtinModel('player-legacy') as ModelDefinition
	const doc = createDocument({
		name: 'Old',
		model: legacyModel,
		image: createImage(64, 32),
		saved: true,
	})
	replaceTexture(doc, 'Convert', convertLegacyToModern(doc.image), builtinModel('player-classic'))
	assert.equal(doc.image.height, 64)
	assert.equal(doc.model.id, 'player-classic')
	undo(doc)
	assert.equal(doc.image.height, 32)
	assert.equal(doc.model.id, 'player-legacy')
	redo(doc)
	assert.equal(doc.model.id, 'player-classic')
})

test('nickname lookups only build URLs for fixed hosts and valid names', () => {
	assert.equal(
		profileLookupUrl('mojang', 'Notch'),
		'https://api.mojang.com/users/profiles/minecraft/Notch',
	)
	assert.equal(
		profileLookupUrl('ely', 'erick-skrauch'),
		'https://skinsystem.ely.by/textures/erick-skrauch',
	)
	assert.throws(() => profileLookupUrl('mojang', '../admin'), LookupError)
	assert.throws(() => profileLookupUrl('mojang', 'a'.repeat(17)), LookupError)
})

test('texture URLs are allowlisted and upgraded to HTTPS', () => {
	assert.equal(
		safeTextureUrl('mojang', 'http://textures.minecraft.net/texture/abc'),
		'https://textures.minecraft.net/texture/abc',
	)
	for (const bad of [
		'https://evil.example/texture/abc',
		'https://textures.minecraft.net.evil.example/x',
		'https://user:pass@textures.minecraft.net/x',
		'https://textures.minecraft.net:8443/x',
		'file:///C:/Windows/win.ini',
		'javascript:alert(1)',
	]) {
		assert.throws(() => safeTextureUrl('mojang', bad), LookupError, bad)
	}
	assert.throws(() => safeTextureUrl('ely', 'https://textures.minecraft.net/x'), LookupError)
})

test('profile responses are parsed defensively', () => {
	assert.equal(
		parseMojangUuid({ id: '069a79f444e94726a5befca90e38aaf5' }),
		'069a79f444e94726a5befca90e38aaf5',
	)
	assert.throws(() => parseMojangUuid({ id: '../../x' }), LookupError)
	const value = btoa(
		JSON.stringify({
			textures: {
				SKIN: { url: 'http://textures.minecraft.net/texture/1', metadata: { model: 'slim' } },
			},
		}),
	)
	assert.deepEqual(parseSessionProfile({ properties: [{ name: 'textures', value }] }), {
		url: 'https://textures.minecraft.net/texture/1',
		slim: true,
	})
	assert.throws(
		() => parseSessionProfile({ properties: [] }),
		(e: LookupError) => e.code === 'not-found',
	)
	assert.deepEqual(parseElyTextures({ SKIN: { url: 'http://ely.by/storage/skins/a.png' } }), {
		url: 'https://ely.by/storage/skins/a.png',
		slim: false,
	})
	assert.throws(
		() => parseElyTextures({ SKIN: { url: 'https://evil.example/a.png' } }),
		LookupError,
	)
})
