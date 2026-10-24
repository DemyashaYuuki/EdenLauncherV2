import {
	checkTextureDimensions,
	looksSlim,
	matchesModelAspect,
	type RgbaImage,
} from './image.ts'
import {
	BUILTIN_MODELS,
	builtinModel,
	type LayerKind,
	type ModelBox,
	type ModelCategory,
	type ModelDefinition,
	playerModelFor,
} from './model.ts'
import { cleanName, MAX_SWATCHES, type Palette } from './palette.ts'
import { base64ToBytes, bytesToBase64, decodePng, encodePng, MAX_PNG_BYTES } from './png.ts'

export const PROJECT_FORMAT = 'eden-skin-project'
export const PROJECT_VERSION = 1
export const PROJECT_EXTENSION = 'edenskin'
export const MAX_PROJECT_BYTES = 48 * 1024 * 1024
const MAX_BOXES = 1024
const MAX_PARTS = 256

export class ProjectError extends Error {
	readonly code: string

	constructor(code: string, message: string) {
		super(message)
		this.code = code
		this.name = 'ProjectError'
	}
}

export interface ProjectData {
	name: string
	model: ModelDefinition
	image: RgbaImage
	palette: Palette | null
	createdAt: string
	updatedAt: string
}

const CATEGORIES: ModelCategory[] = ['player', 'mob', 'entity', 'block', 'item', 'custom']

function finite(value: unknown, label: string, limit = 4096): number {
	if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > limit) {
		throw new ProjectError('model', `Invalid model value: ${label}`)
	}
	return value
}

function vector(value: unknown, label: string): [number, number, number] {
	if (!Array.isArray(value) || value.length !== 3) throw new ProjectError('model', `Invalid ${label}`)
	return [finite(value[0], label), finite(value[1], label), finite(value[2], label)]
}

function text(value: unknown, label: string, max = 80): string {
	if (typeof value !== 'string') throw new ProjectError('model', `Invalid ${label}`)
	return value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max)
}

/** Validates an untrusted model definition and returns a normalized copy. */
export function validateModel(input: unknown): ModelDefinition {
	if (!input || typeof input !== 'object') throw new ProjectError('model', 'Model is missing')
	const raw = input as Record<string, unknown>
	const textureWidth = finite(raw.textureWidth, 'textureWidth', 1024)
	const textureHeight = finite(raw.textureHeight, 'textureHeight', 1024)
	if (!Number.isInteger(textureWidth) || !Number.isInteger(textureHeight) || textureWidth < 8 || textureHeight < 8) {
		throw new ProjectError('model', 'Invalid model texture size')
	}
	const category = raw.category as ModelCategory
	if (!CATEGORIES.includes(category)) throw new ProjectError('model', 'Invalid model category')
	if (!Array.isArray(raw.boxes) || raw.boxes.length === 0 || raw.boxes.length > MAX_BOXES) {
		throw new ProjectError('model', 'Invalid model boxes')
	}
	if (!Array.isArray(raw.parts) || raw.parts.length > MAX_PARTS) throw new ProjectError('model', 'Invalid parts')
	const boxes: ModelBox[] = raw.boxes.map((value, index) => {
		if (!value || typeof value !== 'object') throw new ProjectError('model', 'Invalid box')
		const b = value as Record<string, unknown>
		const size = vector(b.size, 'size')
		if (size.some((v) => !Number.isInteger(v) || v < 0 || v > 512)) throw new ProjectError('model', 'Invalid box size')
		if (!Array.isArray(b.uv) || b.uv.length !== 2) throw new ProjectError('model', 'Invalid box UV')
		const layer = b.layer as LayerKind
		if (layer !== 'base' && layer !== 'overlay') throw new ProjectError('model', 'Invalid box layer')
		const inflate = finite(b.inflate ?? 0, 'inflate', 16)
		if (Math.min(...size) + 2 * inflate < 0) throw new ProjectError('model', 'Invalid box inflate')
		return {
			id: text(b.id ?? `box-${index}`, 'box id', 64),
			name: text(b.name ?? `Box ${index + 1}`, 'box name'),
			part: text(b.part ?? 'model', 'box part', 64),
			layer,
			origin: vector(b.origin, 'origin'),
			size,
			pivot: vector(b.pivot ?? [0, 0, 0], 'pivot'),
			rotation: vector(b.rotation ?? [0, 0, 0], 'rotation'),
			uv: [Math.round(finite(b.uv[0], 'uv', 1024)), Math.round(finite(b.uv[1], 'uv', 1024))],
			mirror: b.mirror === true,
			inflate,
		}
	})
	const parts = (raw.parts as unknown[]).map((value) => {
		const p = (value ?? {}) as Record<string, unknown>
		return { id: text(p.id, 'part id', 64), label: text(p.label ?? p.id, 'part label') }
	})
	const variant = raw.playerVariant
	return {
		id: text(raw.id ?? 'custom', 'model id', 64),
		name: text(raw.name ?? 'Model', 'model name'),
		category,
		textureWidth,
		textureHeight,
		parts,
		boxes,
		playerVariant: variant === 'classic' || variant === 'slim' ? variant : undefined,
		legacy: raw.legacy === true,
	}
}

function validatePalette(input: unknown): Palette | null {
	if (input === undefined || input === null) return null
	if (typeof input !== 'object') throw new ProjectError('palette', 'Invalid palette')
	const raw = input as { name?: unknown; swatches?: unknown }
	if (!Array.isArray(raw.swatches) || raw.swatches.length > MAX_SWATCHES) {
		throw new ProjectError('palette', 'Invalid palette colours')
	}
	return {
		name: cleanName(typeof raw.name === 'string' ? raw.name : '') ?? 'Palette',
		swatches: raw.swatches.map((value) => {
			const s = (value ?? {}) as Record<string, unknown>
			const channel = (v: unknown) => {
				if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 255) {
					throw new ProjectError('palette', 'Invalid palette colour')
				}
				return v
			}
			return {
				r: channel(s.r),
				g: channel(s.g),
				b: channel(s.b),
				a: channel(s.a ?? 255),
				name: cleanName(typeof s.name === 'string' ? s.name : undefined),
			}
		}),
	}
}

export async function serializeProject(data: ProjectData): Promise<Uint8Array> {
	const builtin = builtinModel(data.model.id)
	const png = await encodePng(data.image)
	const document = {
		format: PROJECT_FORMAT,
		version: PROJECT_VERSION,
		name: data.name,
		createdAt: data.createdAt,
		updatedAt: data.updatedAt,
		model: builtin ? { id: builtin.id } : { definition: data.model },
		texture: { width: data.image.width, height: data.image.height, png: bytesToBase64(png) },
		palette: data.palette ?? undefined,
	}
	return new TextEncoder().encode(JSON.stringify(document))
}

function isoOrNow(value: unknown): string {
	if (typeof value === 'string' && !Number.isNaN(Date.parse(value)) && value.length < 40) return value
	return new Date().toISOString()
}

/** Parses and fully validates an untrusted project file. File system paths inside it are ignored. */
export async function parseProject(bytes: Uint8Array): Promise<ProjectData> {
	if (bytes.length > MAX_PROJECT_BYTES) throw new ProjectError('too-big', 'Project file is too large')
	let raw: Record<string, unknown>
	try {
		raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
	} catch {
		throw new ProjectError('syntax', 'Project file is not valid JSON')
	}
	if (!raw || typeof raw !== 'object' || raw.format !== PROJECT_FORMAT) {
		throw new ProjectError('format', 'Not an Eden skin project')
	}
	if (typeof raw.version !== 'number' || !Number.isInteger(raw.version) || raw.version < 1) {
		throw new ProjectError('format', 'Invalid project version')
	}
	if (raw.version > PROJECT_VERSION) throw new ProjectError('newer-version', 'Project was made by a newer version')
	const modelField = (raw.model ?? {}) as Record<string, unknown>
	let model: ModelDefinition
	if (typeof modelField.id === 'string' && !modelField.definition) {
		const found = builtinModel(modelField.id)
		if (!found) throw new ProjectError('model', 'Unknown built-in model')
		model = found
	} else {
		model = validateModel(modelField.definition)
	}
	const texture = (raw.texture ?? {}) as Record<string, unknown>
	if (typeof texture.png !== 'string') throw new ProjectError('texture', 'Project has no texture')
	let image: RgbaImage
	try {
		image = await decodePng(base64ToBytes(texture.png, MAX_PNG_BYTES))
	} catch (error) {
		throw new ProjectError('texture', `Project texture is invalid: ${(error as Error).message}`)
	}
	if (image.width !== texture.width || image.height !== texture.height) {
		throw new ProjectError('texture', 'Texture size does not match the project')
	}
	if (!checkTextureDimensions(image.width, image.height).ok) {
		throw new ProjectError('texture', 'Unsupported texture size')
	}
	if (!matchesModelAspect(image.width, image.height, model.textureWidth, model.textureHeight)) {
		throw new ProjectError('texture', 'Texture does not fit the model')
	}
	return {
		name: cleanName(typeof raw.name === 'string' ? raw.name : '') ?? 'Skin',
		model,
		image,
		palette: validatePalette(raw.palette),
		createdAt: isoOrNow(raw.createdAt),
		updatedAt: isoOrNow(raw.updatedAt),
	}
}

export interface ImportedTexture {
	image: RgbaImage
	model: ModelDefinition
	hd: boolean
}

/**
 * Decodes an imported PNG and chooses a player model: 2:1 textures are legacy, square ones are
 * classic or slim depending on the arm pixels. Other aspects need a model chosen by the user.
 */
export async function importPngTexture(bytes: Uint8Array): Promise<ImportedTexture> {
	const image = await decodePng(bytes)
	const check = checkTextureDimensions(image.width, image.height)
	if (!check.ok) throw new ProjectError('texture', `Unsupported texture size (${check.reason})`)
	if (image.width === image.height * 2 || image.width === image.height) {
		const model = playerModelFor(image.width, image.height, image.width === image.height && looksSlim(image))
		return { image, model, hd: image.width !== 64 }
	}
	const fallback = BUILTIN_MODELS.find((m) => matchesModelAspect(image.width, image.height, m.textureWidth, m.textureHeight))
	if (!fallback) throw new ProjectError('texture', 'No model matches this texture size')
	return { image, model: fallback, hd: image.width !== fallback.textureWidth }
}

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

/** A file-name stem safe on Windows, macOS and Linux. */
export function safeFileStem(name: string): string {
	let stem = name
		.normalize('NFC')
		.replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/[. ]+$/, '')
		.slice(0, 64)
	if (!stem || RESERVED.test(stem)) stem = stem ? `${stem}_` : 'skin'
	return stem
}

/** Picks "Name", "Name (2)", ... that is not in `taken` (compared case-insensitively). */
export function uniqueStem(stem: string, taken: Iterable<string>): string {
	const used = new Set([...taken].map((t) => t.toLowerCase()))
	if (!used.has(stem.toLowerCase())) return stem
	for (let n = 2; n < 10_000; n++) {
		const candidate = `${stem} (${n})`
		if (!used.has(candidate.toLowerCase())) return candidate
	}
	return `${stem} ${Date.now()}`
}
