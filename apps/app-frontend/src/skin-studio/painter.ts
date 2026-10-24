import { useStudioText } from './i18n.ts'
import type { SkinDocument } from './engine/document.ts'
import type { Rgba } from './engine/image.ts'
import { type FaceName, faceRegion, mirrorTexel, type Rect, regionsAt, regionsInPixels, textureFaceFor } from './engine/model.ts'
import { capturePattern, floodFill, isStrokeTool, maskFromPattern, pickColor, Stroke } from './engine/paint.ts'
import { useSkinStudio } from './store.ts'

export interface TexelTarget {
	x: number
	y: number
	box?: number
	face?: FaceName
}

export interface PointerIntent {
	secondary: boolean
	invert: boolean
	sample: boolean
	lockFace: boolean
}

function scaledRect(doc: SkinDocument, box: number, face: FaceName): Rect {
	const b = doc.model.boxes[box]
	const r = faceRegion(b, textureFaceFor(b, face))
	const sx = doc.image.width / doc.model.textureWidth
	const sy = doc.image.height / doc.model.textureHeight
	return { x: Math.round(r.x * sx), y: Math.round(r.y * sy), w: Math.round(r.w * sx), h: Math.round(r.h * sy) }
}

/**
 * Turns texel-level pointer input from either view into strokes and one-shot tool actions,
 * applying selection, hidden-part protection and per-face clipping. Every completed stroke is
 * committed as one history entry.
 */
export function usePainter() {
	const studio = useSkinStudio()
	const t = useStudioText()
	let stroke: Stroke | null = null
	let strokeClip: Rect | undefined
	let selectStart: [number, number] | null = null
	let regionCache: { doc: SkinDocument; version: string; regions: ReturnType<typeof regionsInPixels> } | null =
		null

	function regions(doc: SkinDocument) {
		const key = `${doc.model.id}:${doc.image.width}x${doc.image.height}`
		if (!regionCache || regionCache.doc !== doc || regionCache.version !== key) {
			regionCache = { doc, version: key, regions: regionsInPixels(doc.model, doc.image.width, doc.image.height) }
		}
		return regionCache.regions
	}

	function hiddenAt(doc: SkinDocument, x: number, y: number): boolean {
		const hits = regionsAt(regions(doc), x, y)
		if (hits.length === 0) return false
		return hits.every((hit) => {
			const box = doc.model.boxes[hit.box]
			const partVisible = studio.visibility.parts[box.part] !== false
			if (box.layer === 'base') return !partVisible
			return !partVisible || !studio.visibility.overlayGlobal || studio.visibility.overlay[box.part] === false
		})
	}

	function allowedFor(doc: SkinDocument, fromView: '2d' | '3d') {
		const selection = studio.selection
		const protect = fromView === '2d' && studio.prefs.protectHidden
		return (x: number, y: number) => {
			if (selection && (x < selection.x || y < selection.y || x >= selection.x + selection.w || y >= selection.y + selection.h)) {
				return false
			}
			if (protect && hiddenAt(doc, x, y)) return false
			return true
		}
	}

	function updateHover(doc: SkinDocument, target: TexelTarget | null): void {
		if (!target) {
			studio.hover = null
			return
		}
		let box = target.box
		let face = target.face
		if (box === undefined || face === undefined) {
			const hit = regionsAt(regions(doc), target.x, target.y)[0]
			if (!hit) {
				studio.hover = null
				return
			}
			box = hit.box
			face = hit.face
		}
		const b = doc.model.boxes[box]
		studio.hover = { part: b.part, face, layer: b.layer }
	}

	function color(intent: PointerIntent): Rgba {
		return intent.secondary ? studio.secondary : studio.primary
	}

	function begin(target: TexelTarget, intent: PointerIntent, view: '2d' | '3d'): boolean {
		const doc = studio.active
		if (!doc) return false
		const tool = studio.tool
		if (tool === 'camera') return false
		if (tool === 'dropper') {
			const picked = pickColor(doc.image, target.x, target.y)
			if (picked) {
				if (intent.secondary) studio.secondary = picked
				else studio.primary = picked
			}
			return false
		}
		if (tool === 'select') {
			if (view !== '2d') return false
			selectStart = [target.x, target.y]
			studio.selection = { x: target.x, y: target.y, w: 1, h: 1 }
			return true
		}
		if (tool === 'stamp' && intent.sample) {
			const sampled = capturePattern(doc.image, target.x, target.y, studio.settings.brushSize)
			studio.pattern = sampled
			studio.settings.customBrush = maskFromPattern(sampled)
			return false
		}
		if (tool === 'fill') {
			let lockRegions: Rect[] | null = null
			const lock = intent.lockFace ? 'face' : studio.settings.fillLock
			if (lock !== 'none') {
				const hit =
					target.box !== undefined && target.face !== undefined
						? { box: target.box, face: target.face }
						: regionsAt(regions(doc), target.x, target.y)[0]
				if (hit) {
					lockRegions =
						lock === 'face'
							? [scaledRect(doc, hit.box, hit.face)]
							: regions(doc)
									.filter((r) => r.box === hit.box)
									.map((r) => r.rect)
				}
			}
			const patch = floodFill({
				image: doc.image,
				x: target.x,
				y: target.y,
				color: color(intent),
				tolerance: studio.settings.fillTolerance,
				mode: studio.settings.fillMode,
				opacity: studio.settings.opacity,
				regions: lockRegions,
				allowed: allowedFor(doc, view),
			})
			studio.commit(t('tool.fill'), patch)
			return false
		}
		if (!isStrokeTool(tool)) return false
		if (tool === 'stamp' && !studio.pattern) return false
		const docRegions = regions(doc)
		stroke = new Stroke({
			image: doc.image,
			tool,
			color: color(intent),
			settings: { ...studio.settings, invert: intent.invert },
			allowed: allowedFor(doc, view),
			mirror: (x, y) => mirrorTexel(doc.model, doc.image.width, doc.image.height, docRegions, x, y),
			pattern: studio.pattern,
		})
		strokeClip =
			view === '3d' && target.box !== undefined && target.face !== undefined
				? scaledRect(doc, target.box, target.face)
				: undefined
		stroke.lineTo(target.x, target.y, strokeClip)
		studio.touch()
		return true
	}

	function move(target: TexelTarget, view: '2d' | '3d'): void {
		const doc = studio.active
		if (!doc) return
		if (selectStart && studio.tool === 'select') {
			const [x0, y0] = selectStart
			const x = Math.min(x0, target.x)
			const y = Math.min(y0, target.y)
			studio.selection = { x, y, w: Math.abs(target.x - x0) + 1, h: Math.abs(target.y - y0) + 1 }
			return
		}
		if (!stroke) return
		if (view === '3d') {
			const clip =
				target.box !== undefined && target.face !== undefined ? scaledRect(doc, target.box, target.face) : undefined
			const sameFace =
				clip && strokeClip && clip.x === strokeClip.x && clip.y === strokeClip.y && clip.w === strokeClip.w
			if (!sameFace) {
				stroke.moveTo(target.x, target.y)
				strokeClip = clip
				stroke.dab(target.x, target.y, clip)
			} else {
				stroke.lineTo(target.x, target.y, clip)
			}
		} else {
			stroke.lineTo(target.x, target.y)
		}
		studio.touch()
	}

	function end(): void {
		if (selectStart) {
			selectStart = null
			return
		}
		if (!stroke) return
		const finished = stroke
		stroke = null
		strokeClip = undefined
		studio.commit(t(`tool.${finished.options.tool}` as 'tool.pencil'), finished.finish())
	}

	function cancel(): void {
		selectStart = null
		if (!stroke) return
		stroke.cancel()
		stroke = null
		studio.touch()
	}

	return { begin, move, end, cancel, updateHover, get active() {
		return stroke !== null || selectStart !== null
	} }
}
