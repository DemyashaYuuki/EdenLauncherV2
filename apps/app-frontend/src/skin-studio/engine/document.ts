import { History, type HistoryEntry } from './history.ts'
import { cloneImage, type RgbaImage } from './image.ts'
import { builtinModel, type ModelDefinition } from './model.ts'
import type { Patch } from './paint.ts'
import type { Palette } from './palette.ts'
import type { ProjectData } from './project.ts'

export interface SkinDocument {
	id: string
	name: string
	path: string | null
	model: ModelDefinition
	image: RgbaImage
	history: History
	palette: Palette | null
	createdAt: string
	updatedAt: string
	savedEntryId: number
	metaDirty: boolean
	version: number
}

let counter = 0

export function newDocumentId(): string {
	counter = (counter + 1) % 1_000_000
	const random = Math.floor(Math.random() * 0xffffffff).toString(36)
	return `doc-${Date.now().toString(36)}-${counter.toString(36)}-${random}`
}

export function createDocument(input: {
	name: string
	model: ModelDefinition
	image: RgbaImage
	path?: string | null
	palette?: Palette | null
	createdAt?: string
	updatedAt?: string
	saved?: boolean
	id?: string
}): SkinDocument {
	const now = new Date().toISOString()
	return {
		id: input.id ?? newDocumentId(),
		name: input.name,
		path: input.path ?? null,
		model: input.model,
		image: input.image,
		history: new History(),
		palette: input.palette ?? null,
		createdAt: input.createdAt ?? now,
		updatedAt: input.updatedAt ?? now,
		savedEntryId: input.saved ? 0 : -1,
		metaDirty: false,
		version: 0,
	}
}

export function fromProject(project: ProjectData, path: string | null, saved: boolean, id?: string): SkinDocument {
	return createDocument({
		name: project.name,
		model: project.model,
		image: project.image,
		path,
		palette: project.palette,
		createdAt: project.createdAt,
		updatedAt: project.updatedAt,
		saved,
		id,
	})
}

export function toProject(doc: SkinDocument): ProjectData {
	return {
		name: doc.name,
		model: doc.model,
		image: doc.image,
		palette: doc.palette,
		createdAt: doc.createdAt,
		updatedAt: new Date().toISOString(),
	}
}

function currentEntryId(doc: SkinDocument): number {
	const { history } = doc
	return history.cursor > 0 ? history.list[history.cursor - 1].id : 0
}

export function isDirty(doc: SkinDocument): boolean {
	return doc.metaDirty || currentEntryId(doc) !== doc.savedEntryId
}

export function markSaved(doc: SkinDocument, path: string): void {
	doc.path = path
	doc.savedEntryId = currentEntryId(doc)
	doc.metaDirty = false
	doc.updatedAt = new Date().toISOString()
}

export function commitPatch(doc: SkinDocument, label: string, patch: Patch | null): HistoryEntry | null {
	if (!patch) return null
	doc.version++
	return doc.history.push(label, { kind: 'patch', patch })
}

/** Records a whole-texture change (conversions, resize, crop) as one undoable step. */
export function replaceTexture(
	doc: SkinDocument,
	label: string,
	image: RgbaImage,
	model: ModelDefinition = doc.model,
): HistoryEntry {
	const entry = doc.history.push(label, {
		kind: 'replace',
		before: cloneImage(doc.image),
		after: cloneImage(image),
		modelBefore: doc.model.id,
		modelAfter: model.id,
	})
	doc.image = image
	doc.model = model
	doc.version++
	return entry
}

function resolveModel(doc: SkinDocument, id: string | undefined): ModelDefinition {
	if (!id || id === doc.model.id) return doc.model
	return builtinModel(id) ?? doc.model
}

export function undo(doc: SkinDocument): HistoryEntry | null {
	const result = doc.history.undo(doc.image)
	if (!result) return null
	doc.image = result.image
	if (result.entry.change.kind === 'replace') doc.model = resolveModel(doc, result.entry.change.modelBefore)
	doc.version++
	return result.entry
}

export function redo(doc: SkinDocument): HistoryEntry | null {
	const result = doc.history.redo(doc.image)
	if (!result) return null
	doc.image = result.image
	if (result.entry.change.kind === 'replace') doc.model = resolveModel(doc, result.entry.change.modelAfter)
	doc.version++
	return result.entry
}

export function jumpTo(doc: SkinDocument, position: number): void {
	while (doc.history.cursor > position) if (!undo(doc)) break
	while (doc.history.cursor < position) if (!redo(doc)) break
}

export function rename(doc: SkinDocument, name: string): void {
	const clean = name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80)
	if (!clean || clean === doc.name) return
	doc.name = clean
	doc.metaDirty = true
	doc.version++
}
