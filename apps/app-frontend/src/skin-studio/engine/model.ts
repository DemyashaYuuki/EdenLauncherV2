/**
 * Box-UV models in Minecraft entity space: +Y points down, the model faces -Z, units are texels
 * of the reference texture size. "right" is the character's right side (-X), "left" is +X.
 */

export type Vec3 = [number, number, number]
export type FaceName = 'top' | 'bottom' | 'right' | 'front' | 'left' | 'back'
export type LayerKind = 'base' | 'overlay'
export type ModelCategory = 'player' | 'mob' | 'entity' | 'block' | 'item' | 'custom'

export const FACE_NAMES: FaceName[] = ['top', 'bottom', 'right', 'front', 'left', 'back']

export interface ModelBox {
	id: string
	name: string
	part: string
	layer: LayerKind
	origin: Vec3
	size: Vec3
	pivot: Vec3
	rotation: Vec3
	uv: [number, number]
	mirror: boolean
	inflate: number
}

export interface ModelPartInfo {
	id: string
	label: string
}

export interface ModelDefinition {
	id: string
	name: string
	category: ModelCategory
	textureWidth: number
	textureHeight: number
	parts: ModelPartInfo[]
	boxes: ModelBox[]
	playerVariant?: 'classic' | 'slim'
	legacy?: boolean
}

export interface Rect {
	x: number
	y: number
	w: number
	h: number
}

export function faceRegion(box: ModelBox, face: FaceName): Rect {
	const [w, h, d] = box.size
	const [u, v] = box.uv
	switch (face) {
		case 'top':
			return { x: u + d, y: v, w, h: d }
		case 'bottom':
			return { x: u + d + w, y: v, w, h: d }
		case 'right':
			return { x: u, y: v + d, w: d, h }
		case 'front':
			return { x: u + d, y: v + d, w, h }
		case 'left':
			return { x: u + d + w, y: v + d, w: d, h }
		case 'back':
			return { x: u + 2 * d + w, y: v + d, w, h }
	}
}

/** The texture region a physical face shows: mirrored boxes swap the side regions. */
export function textureFaceFor(box: ModelBox, physical: FaceName): FaceName {
	if (!box.mirror) return physical
	if (physical === 'right') return 'left'
	if (physical === 'left') return 'right'
	return physical
}

export interface BoxBounds {
	min: Vec3
	max: Vec3
}

export function boxBounds(box: ModelBox): BoxBounds {
	const i = box.inflate
	return {
		min: [box.origin[0] - i, box.origin[1] - i, box.origin[2] - i],
		max: [box.origin[0] + box.size[0] + i, box.origin[1] + box.size[1] + i, box.origin[2] + box.size[2] + i],
	}
}

/** Fractions along the box: fx from -X to +X, fy from top to bottom, fz from front to back. */
export interface FaceFractions {
	fx: number
	fy: number
	fz: number
}

/** Returns texture coordinates (in model texture units) for a point on a physical face. */
export function faceTexCoord(box: ModelBox, physical: FaceName, f: FaceFractions): [number, number] {
	const tf = textureFaceFor(box, physical)
	const r = faceRegion(box, tf)
	const fx = box.mirror ? 1 - f.fx : f.fx
	switch (tf) {
		case 'top':
		case 'bottom':
			return [r.x + fx * r.w, r.y + (1 - f.fz) * r.h]
		case 'front':
			return [r.x + fx * r.w, r.y + f.fy * r.h]
		case 'back':
			return [r.x + (1 - fx) * r.w, r.y + f.fy * r.h]
		case 'right':
			return [r.x + (1 - f.fz) * r.w, r.y + f.fy * r.h]
		case 'left':
			return [r.x + f.fz * r.w, r.y + f.fy * r.h]
	}
}

/** Inverse of {@link faceTexCoord}: a texture coordinate inside the face region to fractions. */
export function texCoordToFractions(
	box: ModelBox,
	physical: FaceName,
	col: number,
	row: number,
): FaceFractions {
	const tf = textureFaceFor(box, physical)
	const r = faceRegion(box, tf)
	const a = (col - r.x) / r.w
	const b = (row - r.y) / r.h
	const unmirror = (fx: number) => (box.mirror ? 1 - fx : fx)
	switch (tf) {
		case 'top':
			return { fx: unmirror(a), fy: 0, fz: 1 - b }
		case 'bottom':
			return { fx: unmirror(a), fy: 1, fz: 1 - b }
		case 'front':
			return { fx: unmirror(a), fy: b, fz: 0 }
		case 'back':
			return { fx: unmirror(1 - a), fy: b, fz: 1 }
		case 'right':
			return { fx: physical === 'right' ? 0 : 1, fy: b, fz: 1 - a }
		case 'left':
			return { fx: physical === 'left' ? 1 : 0, fy: b, fz: a }
	}
}

export function fractionsToLocal(box: ModelBox, f: FaceFractions): Vec3 {
	const { min, max } = boxBounds(box)
	return [
		min[0] + f.fx * (max[0] - min[0]),
		min[1] + f.fy * (max[1] - min[1]),
		min[2] + f.fz * (max[2] - min[2]),
	]
}

export function localToFractions(box: ModelBox, p: Vec3): FaceFractions {
	const { min, max } = boxBounds(box)
	const frac = (i: number) => (max[i] === min[i] ? 0 : (p[i] - min[i]) / (max[i] - min[i]))
	return { fx: frac(0), fy: frac(1), fz: frac(2) }
}

export const FACE_NORMALS: Record<FaceName, Vec3> = {
	top: [0, -1, 0],
	bottom: [0, 1, 0],
	right: [-1, 0, 0],
	left: [1, 0, 0],
	front: [0, 0, -1],
	back: [0, 0, 1],
}

/** Picks the physical face whose plane is closest to a local point on the box surface. */
export function nearestFace(box: ModelBox, p: Vec3): FaceName {
	const { min, max } = boxBounds(box)
	const candidates: [FaceName, number][] = [
		['top', Math.abs(p[1] - min[1])],
		['bottom', Math.abs(p[1] - max[1])],
		['right', Math.abs(p[0] - min[0])],
		['left', Math.abs(p[0] - max[0])],
		['front', Math.abs(p[2] - min[2])],
		['back', Math.abs(p[2] - max[2])],
	]
	candidates.sort((x, y) => x[1] - y[1])
	return candidates[0][0]
}

export interface TextureScale {
	sx: number
	sy: number
}

export function textureScale(model: ModelDefinition, width: number, height: number): TextureScale {
	return { sx: width / model.textureWidth, sy: height / model.textureHeight }
}

/** Maps a point on a face to the texel it covers, clamped to that face's region. */
export function facePointToTexel(
	box: ModelBox,
	physical: FaceName,
	f: FaceFractions,
	scale: TextureScale,
): [number, number] {
	const [col, row] = faceTexCoord(box, physical, f)
	const r = faceRegion(box, textureFaceFor(box, physical))
	const x0 = Math.round(r.x * scale.sx)
	const y0 = Math.round(r.y * scale.sy)
	const x1 = Math.round((r.x + r.w) * scale.sx) - 1
	const y1 = Math.round((r.y + r.h) * scale.sy) - 1
	const x = Math.min(x1, Math.max(x0, Math.floor(col * scale.sx)))
	const y = Math.min(y1, Math.max(y0, Math.floor(row * scale.sy)))
	return [x, y]
}

export interface FaceRegionRef {
	box: number
	face: FaceName
	rect: Rect
}

/** All face regions of a model in texture pixels, for 2D hit testing and part locks. */
export function regionsInPixels(model: ModelDefinition, width: number, height: number): FaceRegionRef[] {
	const scale = textureScale(model, width, height)
	const out: FaceRegionRef[] = []
	model.boxes.forEach((box, index) => {
		for (const face of FACE_NAMES) {
			const r = faceRegion(box, textureFaceFor(box, face))
			if (r.w <= 0 || r.h <= 0) continue
			out.push({
				box: index,
				face,
				rect: {
					x: Math.round(r.x * scale.sx),
					y: Math.round(r.y * scale.sy),
					w: Math.round(r.w * scale.sx),
					h: Math.round(r.h * scale.sy),
				},
			})
		}
	})
	return out
}

export function rectContains(r: Rect, x: number, y: number): boolean {
	return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h
}

export function regionsAt(regions: FaceRegionRef[], x: number, y: number): FaceRegionRef[] {
	return regions.filter((region) => rectContains(region.rect, x, y))
}

export type Mat4 = Float64Array

export function identity(): Mat4 {
	const m = new Float64Array(16)
	m[0] = m[5] = m[10] = m[15] = 1
	return m
}

export function multiply(a: Mat4, b: Mat4): Mat4 {
	const out = new Float64Array(16)
	for (let c = 0; c < 4; c++) {
		for (let r = 0; r < 4; r++) {
			let sum = 0
			for (let k = 0; k < 4; k++) sum += a[k * 4 + r] * b[c * 4 + k]
			out[c * 4 + r] = sum
		}
	}
	return out
}

function translation(t: Vec3): Mat4 {
	const m = identity()
	m[12] = t[0]
	m[13] = t[1]
	m[14] = t[2]
	return m
}

function rotationAxis(axis: 0 | 1 | 2, degrees: number): Mat4 {
	const m = identity()
	if (!degrees) return m
	const rad = (degrees * Math.PI) / 180
	const c = Math.cos(rad)
	const s = Math.sin(rad)
	if (axis === 0) {
		m[5] = c
		m[6] = s
		m[9] = -s
		m[10] = c
	} else if (axis === 1) {
		m[0] = c
		m[2] = -s
		m[8] = s
		m[10] = c
	} else {
		m[0] = c
		m[1] = s
		m[4] = -s
		m[5] = c
	}
	return m
}

/** Box-local (pivot relative) to model space: translate(pivot) · Rz · Ry · Rx, as Minecraft does. */
export function boxMatrix(box: ModelBox): Mat4 {
	return multiply(
		multiply(multiply(translation(box.pivot), rotationAxis(2, box.rotation[2])), rotationAxis(1, box.rotation[1])),
		rotationAxis(0, box.rotation[0]),
	)
}

export function transformPoint(m: Mat4, p: Vec3): Vec3 {
	return [
		m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
		m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
		m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
	]
}

export function transformDirection(m: Mat4, p: Vec3): Vec3 {
	return [
		m[0] * p[0] + m[4] * p[1] + m[8] * p[2],
		m[1] * p[0] + m[5] * p[1] + m[9] * p[2],
		m[2] * p[0] + m[6] * p[1] + m[10] * p[2],
	]
}

/** Inverse of a rigid transform (rotation + translation). */
export function invertRigid(m: Mat4): Mat4 {
	const out = identity()
	for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out[c * 4 + r] = m[r * 4 + c]
	const t: Vec3 = [m[12], m[13], m[14]]
	const it = transformDirection(out, t)
	out[12] = -it[0]
	out[13] = -it[1]
	out[14] = -it[2]
	return out
}

export interface SurfaceSample {
	box: number
	face: FaceName
	point: Vec3
	normal: Vec3
}

/** Model-space surface point at the centre of a texel inside one face region. */
export function texelToSurface(
	model: ModelDefinition,
	boxIndex: number,
	face: FaceName,
	x: number,
	y: number,
	scale: TextureScale,
): SurfaceSample {
	const box = model.boxes[boxIndex]
	const f = texCoordToFractions(box, face, (x + 0.5) / scale.sx, (y + 0.5) / scale.sy)
	const m = boxMatrix(box)
	return {
		box: boxIndex,
		face,
		point: transformPoint(m, fractionsToLocal(box, f)),
		normal: transformDirection(m, FACE_NORMALS[face]),
	}
}

const EPSILON = 1e-3

export interface SurfaceHit {
	box: number
	face: FaceName
	fractions: FaceFractions
}

export function boxCenter(box: ModelBox): Vec3 {
	return transformPoint(boxMatrix(box), [
		box.origin[0] + box.size[0] / 2,
		box.origin[1] + box.size[1] / 2,
		box.origin[2] + box.size[2] / 2,
	])
}

/** Finds which face of which box (on a given layer) contains a model-space point with a given normal. */
export function locateSurface(
	model: ModelDefinition,
	point: Vec3,
	normal: Vec3,
	layer: LayerKind,
): SurfaceHit | null {
	return locateSurfaces(model, point, normal, layer)[0] ?? null
}

/** Every face that contains the point; overlapping boxes (like the legs at X=0) yield several. */
export function locateSurfaces(
	model: ModelDefinition,
	point: Vec3,
	normal: Vec3,
	layer: LayerKind,
): SurfaceHit[] {
	const hits: SurfaceHit[] = []
	for (let index = 0; index < model.boxes.length; index++) {
		const box = model.boxes[index]
		if (box.layer !== layer) continue
		const m = boxMatrix(box)
		const inv = invertRigid(m)
		const local = transformPoint(inv, point)
		const localNormal = transformDirection(inv, normal)
		const { min, max } = boxBounds(box)
		for (const face of FACE_NAMES) {
			const n = FACE_NORMALS[face]
			if (n[0] * localNormal[0] + n[1] * localNormal[1] + n[2] * localNormal[2] < 0.9) continue
			const axis = n[0] !== 0 ? 0 : n[1] !== 0 ? 1 : 2
			const plane = n[axis] < 0 ? min[axis] : max[axis]
			if (Math.abs(local[axis] - plane) > EPSILON) continue
			let inside = true
			for (let other = 0; other < 3; other++) {
				if (other === axis) continue
				if (local[other] < min[other] - EPSILON || local[other] > max[other] + EPSILON) inside = false
			}
			if (inside) hits.push({ box: index, face, fractions: localToFractions(box, local) })
		}
	}
	return hits
}

/**
 * The texel mirrored across the model's X=0 plane, found through the 3D surface so it also works
 * for imported models. Returns null when the mirrored point is not on any face of the same layer.
 */
export function mirrorTexel(
	model: ModelDefinition,
	width: number,
	height: number,
	regions: FaceRegionRef[],
	x: number,
	y: number,
): [number, number] | null {
	const scale = textureScale(model, width, height)
	for (const region of regionsAt(regions, x, y)) {
		const box = model.boxes[region.box]
		const sample = texelToSurface(model, region.box, region.face, x, y, scale)
		const mirroredPoint: Vec3 = [-sample.point[0], sample.point[1], sample.point[2]]
		const mirroredNormal: Vec3 = [-sample.normal[0], sample.normal[1], sample.normal[2]]
		const hits = locateSurfaces(model, mirroredPoint, mirroredNormal, box.layer)
		if (hits.length === 0) continue
		const center = boxCenter(box)
		const target: Vec3 = [-center[0], center[1], center[2]]
		const distance = (hit: SurfaceHit) => {
			const c = boxCenter(model.boxes[hit.box])
			return (c[0] - target[0]) ** 2 + (c[1] - target[1]) ** 2 + (c[2] - target[2]) ** 2
		}
		const hit = hits.reduce((best, next) => (distance(next) < distance(best) ? next : best))
		return facePointToTexel(model.boxes[hit.box], hit.face, hit.fractions, scale)
	}
	return null
}

function playerBox(
	id: string,
	name: string,
	part: string,
	layer: LayerKind,
	uv: [number, number],
	origin: Vec3,
	size: Vec3,
	pivot: Vec3,
	inflate = 0,
	mirror = false,
): ModelBox {
	return { id, name, part, layer, uv, origin, size, pivot, rotation: [0, 0, 0], mirror, inflate }
}

export const PLAYER_PARTS: ModelPartInfo[] = [
	{ id: 'head', label: 'head' },
	{ id: 'body', label: 'body' },
	{ id: 'rightArm', label: 'rightArm' },
	{ id: 'leftArm', label: 'leftArm' },
	{ id: 'rightLeg', label: 'rightLeg' },
	{ id: 'leftLeg', label: 'leftLeg' },
]

function playerModel(variant: 'classic' | 'slim'): ModelDefinition {
	const arm = variant === 'slim' ? 3 : 4
	const armY = variant === 'slim' ? 2.5 : 2
	const rightArmX = variant === 'slim' ? -2 : -3
	return {
		id: variant === 'slim' ? 'player-slim' : 'player-classic',
		name: variant === 'slim' ? 'Slim' : 'Classic',
		category: 'player',
		textureWidth: 64,
		textureHeight: 64,
		parts: PLAYER_PARTS,
		playerVariant: variant,
		boxes: [
			playerBox('head', 'Head', 'head', 'base', [0, 0], [-4, -8, -4], [8, 8, 8], [0, 0, 0]),
			playerBox('hat', 'Hat', 'head', 'overlay', [32, 0], [-4, -8, -4], [8, 8, 8], [0, 0, 0], 0.5),
			playerBox('body', 'Body', 'body', 'base', [16, 16], [-4, 0, -2], [8, 12, 4], [0, 0, 0]),
			playerBox('jacket', 'Jacket', 'body', 'overlay', [16, 32], [-4, 0, -2], [8, 12, 4], [0, 0, 0], 0.25),
			playerBox('rightArm', 'Right arm', 'rightArm', 'base', [40, 16], [rightArmX, -2, -2], [arm, 12, 4], [-5, armY, 0]),
			playerBox(
				'rightSleeve',
				'Right sleeve',
				'rightArm',
				'overlay',
				[40, 32],
				[rightArmX, -2, -2],
				[arm, 12, 4],
				[-5, armY, 0],
				0.25,
			),
			playerBox('leftArm', 'Left arm', 'leftArm', 'base', [32, 48], [-1, -2, -2], [arm, 12, 4], [5, armY, 0]),
			playerBox(
				'leftSleeve',
				'Left sleeve',
				'leftArm',
				'overlay',
				[48, 48],
				[-1, -2, -2],
				[arm, 12, 4],
				[5, armY, 0],
				0.25,
			),
			playerBox('rightLeg', 'Right leg', 'rightLeg', 'base', [0, 16], [-2, 0, -2], [4, 12, 4], [-1.9, 12, 0]),
			playerBox(
				'rightPants',
				'Right pants',
				'rightLeg',
				'overlay',
				[0, 32],
				[-2, 0, -2],
				[4, 12, 4],
				[-1.9, 12, 0],
				0.25,
			),
			playerBox('leftLeg', 'Left leg', 'leftLeg', 'base', [16, 48], [-2, 0, -2], [4, 12, 4], [1.9, 12, 0]),
			playerBox(
				'leftPants',
				'Left pants',
				'leftLeg',
				'overlay',
				[0, 48],
				[-2, 0, -2],
				[4, 12, 4],
				[1.9, 12, 0],
				0.25,
			),
		],
	}
}

function legacyModel(): ModelDefinition {
	return {
		id: 'player-legacy',
		name: 'Legacy 64×32',
		category: 'player',
		textureWidth: 64,
		textureHeight: 32,
		parts: PLAYER_PARTS,
		playerVariant: 'classic',
		legacy: true,
		boxes: [
			playerBox('head', 'Head', 'head', 'base', [0, 0], [-4, -8, -4], [8, 8, 8], [0, 0, 0]),
			playerBox('hat', 'Hat', 'head', 'overlay', [32, 0], [-4, -8, -4], [8, 8, 8], [0, 0, 0], 0.5),
			playerBox('body', 'Body', 'body', 'base', [16, 16], [-4, 0, -2], [8, 12, 4], [0, 0, 0]),
			playerBox('rightArm', 'Right arm', 'rightArm', 'base', [40, 16], [-3, -2, -2], [4, 12, 4], [-5, 2, 0]),
			playerBox('leftArm', 'Left arm', 'leftArm', 'base', [40, 16], [-1, -2, -2], [4, 12, 4], [5, 2, 0], 0, true),
			playerBox('rightLeg', 'Right leg', 'rightLeg', 'base', [0, 16], [-2, 0, -2], [4, 12, 4], [-1.9, 12, 0]),
			playerBox('leftLeg', 'Left leg', 'leftLeg', 'base', [0, 16], [-2, 0, -2], [4, 12, 4], [1.9, 12, 0], 0, true),
		],
	}
}

function capeModel(): ModelDefinition {
	return {
		id: 'cape',
		name: 'Cape',
		category: 'item',
		textureWidth: 64,
		textureHeight: 32,
		parts: [{ id: 'cape', label: 'cape' }],
		boxes: [
			{
				id: 'cape',
				name: 'Cape',
				part: 'cape',
				layer: 'base',
				uv: [0, 0],
				origin: [-5, 0, -1],
				size: [10, 16, 1],
				pivot: [0, 0, 0],
				rotation: [0, 180, 0],
				mirror: false,
				inflate: 0,
			},
		],
	}
}

export const BUILTIN_MODELS: ModelDefinition[] = [
	playerModel('classic'),
	playerModel('slim'),
	legacyModel(),
	capeModel(),
]

export function builtinModel(id: string): ModelDefinition | undefined {
	return BUILTIN_MODELS.find((model) => model.id === id)
}

/** Only standard player models can be uploaded to an account or a server. */
export function remoteVariant(model: ModelDefinition): 'classic' | 'slim' | null {
	return model.category === 'player' && model.playerVariant ? model.playerVariant : null
}

export function playerModelFor(width: number, height: number, slim: boolean): ModelDefinition {
	if (width === height * 2) return legacyModel()
	return playerModel(slim ? 'slim' : 'classic')
}
