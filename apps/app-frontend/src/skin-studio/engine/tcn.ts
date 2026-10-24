import type { LayerKind, ModelBox, ModelCategory, ModelDefinition, ModelPartInfo, Vec3 } from './model.ts'
import { attribute, child, children, parseXml, type XmlElement } from './xml.ts'
import { readZipDirectory, readZipEntry } from './zip.ts'

export class ModelImportError extends Error {
	readonly code: string

	constructor(code: string, message: string) {
		super(message)
		this.code = code
		this.name = 'ModelImportError'
	}
}

export interface ImportedModel {
	model: ModelDefinition
	warnings: string[]
}

const BOX_SHAPE = 'd9e621f7-957f-4b77-b1ae-20dcd0da7751'
const PLANE_SHAPE = 'ab894c83-e399-4236-808b-25a78d56f5e1'
const MAX_SHAPES = 1024
const MAX_COORD = 1024

const PART_MAP: Record<string, [string, LayerKind]> = {
	head: ['head', 'base'],
	helmet: ['head', 'overlay'],
	chest: ['body', 'base'],
	chestarmor: ['body', 'overlay'],
	leftarm: ['leftArm', 'base'],
	leftarmarmor: ['leftArm', 'overlay'],
	rightarm: ['rightArm', 'base'],
	rightarmarmor: ['rightArm', 'overlay'],
	leftleg: ['leftLeg', 'base'],
	leftlegarmor: ['leftLeg', 'overlay'],
	rightleg: ['rightLeg', 'base'],
	rightlegarmor: ['rightLeg', 'overlay'],
}

function parseNumbers(text: string | undefined, count: number, label: string): number[] {
	if (text === undefined) return new Array(count).fill(0)
	const parts = text.split(',').map((p) => p.trim())
	if (parts.length !== count) throw new ModelImportError('number', `${label} must have ${count} values`)
	return parts.map((p) => {
		if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(p)) {
			throw new ModelImportError('number', `${label} is not a number`)
		}
		const value = Number(p)
		if (!Number.isFinite(value) || Math.abs(value) > MAX_COORD * 360) {
			throw new ModelImportError('number', `${label} is out of range`)
		}
		return value
	})
}

function vec3(element: XmlElement, name: string): Vec3 {
	const v = parseNumbers(child(element, name)?.text.trim(), 3, name)
	return [v[0], v[1], v[2]]
}

function bool(element: XmlElement, name: string): boolean {
	return child(element, name)?.text.trim().toLowerCase() === 'true'
}

function slug(text: string, fallback: string): string {
	const s = text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 48)
	return s || fallback
}

export interface TechneOptions {
	id?: string
	category?: ModelCategory
}

/** Converts a Techne document (the XML inside a .tcn, or MCSkin3D's model .xml) to a model. */
export function techneToModel(xml: string, options: TechneOptions = {}): ImportedModel {
	const root = parseXml(xml)
	if (root.name !== 'Techne') throw new ModelImportError('format', 'Not a Techne model')
	const models = child(root, 'Models')
	const first = models ? children(models, 'Model')[0] : undefined
	if (!first) throw new ModelImportError('format', 'Techne file has no model')
	const warnings: string[] = []
	const name = (child(first, 'Name')?.text.trim() || child(root, 'Name')?.text.trim() || 'Model').slice(0, 80)
	const size = parseNumbers(child(first, 'TextureSize')?.text.trim() ?? '64,32', 2, 'TextureSize')
	const textureWidth = Math.round(size[0])
	const textureHeight = Math.round(size[1])
	if (textureWidth < 8 || textureHeight < 8 || textureWidth > 1024 || textureHeight > 1024) {
		throw new ModelImportError('texture', 'Unsupported model texture size')
	}

	const shapes: { element: XmlElement; folder: string }[] = []
	const geometry = child(first, 'Geometry')
	const collect = (node: XmlElement, folder: string, depth: number) => {
		if (depth > 8) throw new ModelImportError('depth', 'Model folders are nested too deeply')
		for (const item of node.children) {
			const tag = item.name.toLowerCase()
			if (tag === 'shape') shapes.push({ element: item, folder })
			else if (tag === 'folder') collect(item, attribute(item, 'Name') ?? folder, depth + 1)
		}
	}
	if (geometry) collect(geometry, 'Model', 0)
	if (shapes.length === 0) throw new ModelImportError('empty', 'Model has no shapes')
	if (shapes.length > MAX_SHAPES) throw new ModelImportError('too-many', 'Model has too many shapes')

	const boxes: ModelBox[] = []
	const partIds = new Map<string, ModelPartInfo>()
	let skippedPlanes = 0
	let skippedUnknown = 0
	shapes.forEach(({ element, folder }, index) => {
		const type = (attribute(element, 'Type') ?? '').toLowerCase()
		if (type === PLANE_SHAPE) {
			skippedPlanes++
			return
		}
		if (type !== BOX_SHAPE) {
			skippedUnknown++
			return
		}
		const shapeName = (attribute(element, 'Name') ?? `Shape ${index + 1}`).slice(0, 80)
		const sizeValues = vec3(element, 'Size')
		if (sizeValues.some((v) => v < 0 || v > 512 || !Number.isInteger(Math.round(v)))) {
			throw new ModelImportError('size', `Shape ${shapeName} has an invalid size`)
		}
		const uvValues = parseNumbers(child(element, 'TextureOffset')?.text.trim() ?? '0,0', 2, 'TextureOffset')
		const scaleText = child(element, 'Scale')?.text.trim()
		const inflate = scaleText ? parseNumbers(scaleText, 1, 'Scale')[0] : 0
		const smallest = Math.min(...sizeValues.map((v) => Math.round(v)))
		if (inflate > 16 || smallest + 2 * inflate < 0) {
			throw new ModelImportError('scale', `Shape ${shapeName} has an invalid scale`)
		}
		const partText = (child(element, 'Part')?.text.trim() ?? 'None').toLowerCase()
		const mapped = PART_MAP[partText]
		const isArmor = bool(element, 'IsArmor')
		const part = mapped ? mapped[0] : slug(folder, 'model')
		const layer: LayerKind = mapped ? mapped[1] : isArmor ? 'overlay' : 'base'
		if (!partIds.has(part)) partIds.set(part, { id: part, label: mapped ? part : folder })
		boxes.push({
			id: `${slug(shapeName, 'shape')}-${index}`,
			name: shapeName,
			part,
			layer,
			origin: vec3(element, 'Offset'),
			size: [Math.round(sizeValues[0]), Math.round(sizeValues[1]), Math.round(sizeValues[2])],
			pivot: vec3(element, 'Position'),
			rotation: vec3(element, 'Rotation'),
			uv: [Math.round(uvValues[0]), Math.round(uvValues[1])],
			mirror: bool(element, 'IsMirrored'),
			inflate,
		})
	})
	if (skippedPlanes) warnings.push(`planes:${skippedPlanes}`)
	if (skippedUnknown) warnings.push(`unknown-shapes:${skippedUnknown}`)
	if (boxes.length === 0) throw new ModelImportError('empty', 'Model has no supported shapes')

	return {
		model: {
			id: options.id ?? `imported-${slug(name, 'model')}`,
			name,
			category: options.category ?? 'custom',
			textureWidth,
			textureHeight,
			parts: [...partIds.values()],
			boxes,
		},
		warnings,
	}
}

/** Imports a Techne .tcn archive: the first safe .xml entry is the model. */
export async function importTcn(bytes: Uint8Array, options: TechneOptions = {}): Promise<ImportedModel> {
	const entries = readZipDirectory(bytes)
	const entry = entries.find((e) => e.name.toLowerCase().endsWith('.xml'))
	if (!entry) throw new ModelImportError('format', 'TCN archive has no model XML')
	const data = await readZipEntry(bytes, entry)
	return techneToModel(new TextDecoder().decode(data), options)
}

/**
 * Removes embedded texture data (DefaultTexture, PreviewImage) from a Techne document, so bundled
 * model geometry carries no third-party artwork.
 */
export function stripTechneImages(xml: string): string {
	return xml
		.replace(/<DefaultTexture>[\s\S]*?<\/DefaultTexture>/gi, '<DefaultTexture />')
		.replace(/<PreviewImage>[\s\S]*?<\/PreviewImage>/gi, '<PreviewImage />')
}
