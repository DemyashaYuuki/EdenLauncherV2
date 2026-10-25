import * as THREE from 'three'

import type { RgbaImage } from '../engine/image.ts'
import {
	boxBounds,
	FACE_NAMES,
	FACE_NORMALS,
	type FaceName,
	facePointToTexel,
	faceTexCoord,
	localToFractions,
	type ModelBox,
	type ModelDefinition,
	textureScale,
	type Vec3,
} from '../engine/model.ts'

export type TransparencyMode = 'off' | 'helmet' | 'all'
export type PaintTarget = 'auto' | 'base' | 'overlay'

export interface Visibility {
	parts: Record<string, boolean>
	overlay: Record<string, boolean>
	overlayGlobal: boolean
	ghost: boolean
}

export interface SceneOptions {
	background: string | null
	grass: boolean
	lighting: boolean
	animate: boolean
	followCursor: boolean
	transparency: TransparencyMode
}

export interface TexelHit {
	x: number
	y: number
	box: number
	face: FaceName
	layer: 'base' | 'overlay'
	part: string
}

interface BoxView {
	index: number
	box: ModelBox
	pivot: THREE.Group
	mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial | THREE.MeshBasicMaterial>
	baseRotation: THREE.Euler
}

const DEG = Math.PI / 180

/** Positions of a face's four corners (as box fractions) in counter-clockwise order seen from outside. */
const FACE_CORNERS: Record<FaceName, [number, number, number][]> = {
	top: [
		[0, 0, 1],
		[1, 0, 1],
		[1, 0, 0],
		[0, 0, 0],
	],
	bottom: [
		[0, 1, 0],
		[1, 1, 0],
		[1, 1, 1],
		[0, 1, 1],
	],
	right: [
		[0, 0, 1],
		[0, 0, 0],
		[0, 1, 0],
		[0, 1, 1],
	],
	left: [
		[1, 0, 0],
		[1, 0, 1],
		[1, 1, 1],
		[1, 1, 0],
	],
	front: [
		[0, 0, 0],
		[1, 0, 0],
		[1, 1, 0],
		[0, 1, 0],
	],
	back: [
		[1, 0, 1],
		[0, 0, 1],
		[0, 1, 1],
		[1, 1, 1],
	],
}

/**
 * Geometry for one box in pivot-relative Minecraft coordinates, faces in {@link FACE_NAMES} order
 * so a raycast triangle index identifies the face. UVs come from the same mapping the paint
 * engine uses.
 */
export function buildBoxGeometry(box: ModelBox, model: ModelDefinition): THREE.BufferGeometry {
	const { min, max } = boxBounds(box)
	const positions: number[] = []
	const normals: number[] = []
	const uvs: number[] = []
	const indices: number[] = []
	FACE_NAMES.forEach((face, faceIndex) => {
		const corners = FACE_CORNERS[face]
		const points = corners.map(([fx, fy, fz]) => [
			min[0] + fx * (max[0] - min[0]),
			min[1] + fy * (max[1] - min[1]),
			min[2] + fz * (max[2] - min[2]),
		])
		const a = new THREE.Vector3(...points[0])
		const b = new THREE.Vector3(...points[1])
		const c = new THREE.Vector3(...points[2])
		const n = FACE_NORMALS[face]
		const winding = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a))
		const order = winding.dot(new THREE.Vector3(...n)) >= 0 ? [0, 1, 2, 3] : [0, 3, 2, 1]
		const base = faceIndex * 4
		for (const k of order) {
			const [fx, fy, fz] = corners[k]
			positions.push(...points[k])
			normals.push(...n)
			const [u, v] = faceTexCoord(box, face, { fx, fy, fz })
			uvs.push(u / model.textureWidth, v / model.textureHeight)
		}
		indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
	})
	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
	geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
	geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
	geometry.setIndex(indices)
	return geometry
}

function grassTexture(): THREE.DataTexture {
	const size = 16
	const data = new Uint8Array(size * size * 4)
	for (let i = 0; i < size * size; i++) {
		const shade = ((i * 7919) % 23) - 11
		data[i * 4] = 92 + shade
		data[i * 4 + 1] = 148 + shade
		data[i * 4 + 2] = 70 + shade
		data[i * 4 + 3] = 255
	}
	const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
	texture.magFilter = THREE.NearestFilter
	texture.minFilter = THREE.NearestFilter
	texture.wrapS = texture.wrapT = THREE.RepeatWrapping
	texture.repeat.set(3, 3)
	texture.colorSpace = THREE.SRGBColorSpace
	texture.needsUpdate = true
	return texture
}

export interface OrbitState {
	theta: number
	phi: number
	radius: number
	target: THREE.Vector3
}

/**
 * Owns the three.js scene for one viewport: model meshes, texture, camera orbit, picking,
 * animation and screenshots. It never touches the document beyond reading the texture buffer.
 */
export class StudioScene {
	readonly renderer: THREE.WebGLRenderer
	readonly scene = new THREE.Scene()
	readonly camera = new THREE.PerspectiveCamera(32, 1, 0.5, 2000)
	private root = new THREE.Group()
	private views: BoxView[] = []
	private texture: THREE.DataTexture | null = null
	private textureImage: RgbaImage | null = null
	private model: ModelDefinition | null = null
	private grass: THREE.Mesh | null = null
	private lights: THREE.Light[] = []
	private raycaster = new THREE.Raycaster()
	private frame = 0
	private disposed = false
	private clock = new THREE.Clock()
	private needsRender = true
	private cursor = new THREE.Vector2(0, 0)
	orbit: OrbitState = { theta: 0.55, phi: 1.35, radius: 70, target: new THREE.Vector3(0, -12, 0) }
	options: SceneOptions = {
		background: null,
		grass: false,
		lighting: true,
		animate: false,
		followCursor: false,
		transparency: 'helmet',
	}
	visibility: Visibility = { parts: {}, overlay: {}, overlayGlobal: true, ghost: false }

	constructor(canvas: HTMLCanvasElement, antialias: boolean) {
		this.renderer = new THREE.WebGLRenderer({
			canvas,
			antialias,
			alpha: true,
			preserveDrawingBuffer: false,
		})
		this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
		this.renderer.outputColorSpace = THREE.SRGBColorSpace
		this.root.rotation.x = Math.PI
		this.scene.add(this.root)
		this.setupLights()
		this.loop()
	}

	private setupLights(): void {
		for (const light of this.lights) this.scene.remove(light)
		const ambient = new THREE.AmbientLight(0xffffff, this.options.lighting ? 1.6 : 3.2)
		const key = new THREE.DirectionalLight(0xffffff, this.options.lighting ? 1.7 : 0)
		key.position.set(30, 60, 80)
		const fill = new THREE.DirectionalLight(0xc9b8ff, this.options.lighting ? 0.6 : 0)
		fill.position.set(-60, 20, -40)
		this.lights = [ambient, key, fill]
		for (const light of this.lights) this.scene.add(light)
	}

	setOptions(options: Partial<SceneOptions>): void {
		const lightingChanged =
			options.lighting !== undefined && options.lighting !== this.options.lighting
		this.options = { ...this.options, ...options }
		if (lightingChanged) this.setupLights()
		this.scene.background = this.options.background
			? new THREE.Color(this.options.background)
			: null
		this.updateGrass()
		this.updateMaterials()
		this.invalidate()
	}

	setVisibility(visibility: Visibility): void {
		this.visibility = visibility
		this.updateMaterials()
		this.invalidate()
	}

	private updateGrass(): void {
		if (this.options.grass && !this.grass && this.model) {
			const geometry = new THREE.PlaneGeometry(48, 48)
			const material = new THREE.MeshLambertMaterial({ map: grassTexture() })
			this.grass = new THREE.Mesh(geometry, material)
			this.grass.rotation.x = -Math.PI / 2
			this.grass.position.y = this.floorY() - 0.01
			this.scene.add(this.grass)
		} else if (!this.options.grass && this.grass) {
			this.scene.remove(this.grass)
			this.grass.geometry.dispose()
			;(this.grass.material as THREE.Material).dispose()
			this.grass = null
		}
	}

	private floorY(): number {
		if (!this.model) return -24
		let lowest = Infinity
		const box = new THREE.Box3()
		this.root.updateMatrixWorld(true)
		for (const view of this.views) {
			box.setFromObject(view.mesh)
			lowest = Math.min(lowest, box.min.y)
		}
		return Number.isFinite(lowest) ? lowest : -24
	}

	setModel(model: ModelDefinition, image: RgbaImage): void {
		this.clearModel()
		this.model = model
		this.setTexture(image)
		model.boxes.forEach((box, index) => {
			const pivot = new THREE.Group()
			pivot.position.set(...box.pivot)
			const baseRotation = new THREE.Euler(
				box.rotation[0] * DEG,
				box.rotation[1] * DEG,
				box.rotation[2] * DEG,
				'ZYX',
			)
			pivot.rotation.copy(baseRotation)
			const material = new THREE.MeshLambertMaterial({ map: this.texture, side: THREE.FrontSide })
			const mesh = new THREE.Mesh(buildBoxGeometry(box, model), material)
			mesh.userData.boxIndex = index
			pivot.add(mesh)
			this.root.add(pivot)
			this.views.push({ index, box, pivot, mesh, baseRotation })
		})
		this.root.position.y = 0
		this.root.updateMatrixWorld(true)
		const bounds = new THREE.Box3().setFromObject(this.root)
		const center = bounds.getCenter(new THREE.Vector3())
		this.root.position.sub(new THREE.Vector3(center.x, bounds.min.y, center.z))
		const size = bounds.getSize(new THREE.Vector3())
		this.defaultOrbit = {
			theta: 0.55,
			phi: 1.35,
			radius: Math.max(size.x, size.y, size.z) * 2.3 + 12,
			target: new THREE.Vector3(0, size.y / 2, 0),
		}
		this.resetCamera()
		if (this.grass) {
			this.scene.remove(this.grass)
			this.grass = null
		}
		this.updateGrass()
		this.updateMaterials()
		this.invalidate()
	}

	private defaultOrbit: OrbitState = {
		theta: 0.55,
		phi: 1.35,
		radius: 70,
		target: new THREE.Vector3(0, 16, 0),
	}

	resetCamera(): void {
		this.orbit = {
			theta: this.defaultOrbit.theta,
			phi: this.defaultOrbit.phi,
			radius: this.defaultOrbit.radius,
			target: this.defaultOrbit.target.clone(),
		}
		this.invalidate()
	}

	setTexture(image: RgbaImage): void {
		if (this.textureImage === image && this.texture) {
			this.texture.needsUpdate = true
			this.invalidate()
			return
		}
		const old = this.texture
		const data = new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength)
		const texture = new THREE.DataTexture(data, image.width, image.height, THREE.RGBAFormat)
		texture.magFilter = THREE.NearestFilter
		texture.minFilter = THREE.NearestFilter
		texture.generateMipmaps = false
		texture.flipY = false
		texture.colorSpace = THREE.SRGBColorSpace
		texture.needsUpdate = true
		this.texture = texture
		this.textureImage = image
		for (const view of this.views) {
			view.mesh.material.map = texture
			view.mesh.material.needsUpdate = true
		}
		old?.dispose()
		this.invalidate()
	}

	/** Call after the shared texture buffer changed in place. */
	textureChanged(): void {
		if (this.texture) this.texture.needsUpdate = true
		this.invalidate()
	}

	private isVisible(box: ModelBox): boolean {
		const partVisible = this.visibility.parts[box.part] !== false
		if (box.layer === 'base') return partVisible
		return (
			partVisible && this.visibility.overlayGlobal && this.visibility.overlay[box.part] !== false
		)
	}

	private updateMaterials(): void {
		const mode = this.options.transparency
		for (const view of this.views) {
			const material = view.mesh.material
			const visible = this.isVisible(view.box)
			const ghost = !visible && this.visibility.ghost
			view.mesh.visible = visible || ghost
			view.mesh.userData.pickable = visible
			const blended =
				view.box.layer === 'overlay' &&
				(mode === 'all' || (mode === 'helmet' && view.box.part === 'head'))
			material.transparent = ghost || blended
			material.opacity = ghost ? 0.16 : 1
			material.depthWrite = !ghost && !blended
			material.alphaTest =
				ghost || blended ? 0.01 : mode === 'off' && view.box.layer === 'base' ? 0 : 0.5
			material.needsUpdate = true
			view.mesh.renderOrder = view.box.layer === 'overlay' ? 2 : ghost ? 3 : 1
		}
	}

	resize(width: number, height: number): void {
		if (width <= 0 || height <= 0) return
		this.renderer.setSize(width, height, false)
		this.camera.aspect = width / height
		this.camera.updateProjectionMatrix()
		this.invalidate()
	}

	invalidate(): void {
		this.needsRender = true
	}

	private updateCamera(): void {
		const { theta, phi, radius, target } = this.orbit
		const p = new THREE.Vector3(
			radius * Math.sin(phi) * Math.sin(theta),
			radius * Math.cos(phi),
			radius * Math.sin(phi) * Math.cos(theta),
		)
		this.camera.position.copy(target).add(p)
		this.camera.lookAt(target)
	}

	rotateBy(dx: number, dy: number): void {
		this.orbit.theta -= dx * 0.008
		this.orbit.phi = Math.min(Math.PI - 0.05, Math.max(0.05, this.orbit.phi - dy * 0.008))
		this.invalidate()
	}

	panBy(dx: number, dy: number): void {
		const scale = this.orbit.radius / 600
		const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 0)
		const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 1)
		this.orbit.target.addScaledVector(right, -dx * scale).addScaledVector(up, dy * scale)
		this.invalidate()
	}

	zoomBy(factor: number): void {
		this.orbit.radius = Math.min(600, Math.max(8, this.orbit.radius * factor))
		this.invalidate()
	}

	setCursor(ndcX: number, ndcY: number): void {
		this.cursor.set(ndcX, ndcY)
		if (this.options.followCursor) this.invalidate()
	}

	private animatePose(time: number): void {
		const animate = this.options.animate && this.model?.category === 'player'
		const swing = animate ? Math.sin(time * 4) * 0.6 : 0
		for (const view of this.views) {
			const r = view.baseRotation
			let x = r.x
			let y = r.y
			if (view.box.part === 'rightArm' || view.box.part === 'leftLeg') x += swing
			if (view.box.part === 'leftArm' || view.box.part === 'rightLeg') x -= swing
			if (this.options.followCursor && view.box.part === 'head') {
				y += -this.cursor.x * 0.9
				x += this.cursor.y * 0.6
			}
			view.pivot.rotation.set(x, y, r.z, 'ZYX')
		}
	}

	private loop = (): void => {
		if (this.disposed) return
		this.frame = requestAnimationFrame(this.loop)
		const moving = this.options.animate || this.options.followCursor
		if (!this.needsRender && !moving) return
		this.needsRender = false
		this.animatePose(this.clock.getElapsedTime())
		this.updateCamera()
		this.renderer.render(this.scene, this.camera)
	}

	/** Raycasts at normalized device coordinates and returns the painted texel, honouring visibility. */
	pick(ndcX: number, ndcY: number, target: PaintTarget, image: RgbaImage): TexelHit | null {
		if (!this.model) return null
		this.animatePose(this.clock.getElapsedTime())
		this.updateCamera()
		this.root.updateMatrixWorld(true)
		this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera)
		const meshes = this.views.filter((v) => v.mesh.userData.pickable).map((v) => v.mesh)
		const hits = this.raycaster.intersectObjects(meshes, false)
		const scale = textureScale(this.model, image.width, image.height)
		for (const hit of hits) {
			const index = hit.object.userData.boxIndex as number
			const box = this.model.boxes[index]
			if (target === 'base' && box.layer !== 'base') continue
			if (target === 'overlay' && box.layer !== 'overlay') continue
			const face = FACE_NAMES[Math.floor((hit.faceIndex ?? 0) / 2)]
			const local = (hit.object as THREE.Mesh).worldToLocal(hit.point.clone())
			const [x, y] = facePointToTexel(
				box,
				face,
				localToFractions(box, local.toArray() as Vec3),
				scale,
			)
			if (target === 'auto' && box.layer === 'overlay') {
				const alpha = image.data[(y * image.width + x) * 4 + 3]
				if (alpha === 0) continue
			}
			return { x, y, box: index, face, layer: box.layer, part: box.part }
		}
		return null
	}

	/** Renders a PNG screenshot of the current view at the given size. */
	async screenshot(width: number, height: number, transparent: boolean): Promise<Blob> {
		const canvas = document.createElement('canvas')
		canvas.width = width
		canvas.height = height
		const renderer = new THREE.WebGLRenderer({
			canvas,
			antialias: true,
			alpha: true,
			preserveDrawingBuffer: true,
		})
		renderer.outputColorSpace = THREE.SRGBColorSpace
		const camera = this.camera.clone()
		camera.aspect = width / height
		camera.updateProjectionMatrix()
		const background = this.scene.background
		if (transparent) {
			this.scene.background = null
			renderer.setClearColor(0x000000, 0)
		}
		const grassVisible = this.grass?.visible
		if (transparent && this.grass) this.grass.visible = false
		renderer.render(this.scene, camera)
		this.scene.background = background
		if (this.grass && grassVisible !== undefined) this.grass.visible = grassVisible
		const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
		renderer.dispose()
		if (!blob) throw new Error('Screenshot failed')
		return blob
	}

	private clearModel(): void {
		for (const view of this.views) {
			view.mesh.geometry.dispose()
			view.mesh.material.dispose()
			this.root.remove(view.pivot)
		}
		this.views = []
	}

	dispose(): void {
		this.disposed = true
		cancelAnimationFrame(this.frame)
		this.clearModel()
		this.texture?.dispose()
		if (this.grass) {
			this.grass.geometry.dispose()
			;(this.grass.material as THREE.Material).dispose()
		}
		this.renderer.dispose()
	}
}
