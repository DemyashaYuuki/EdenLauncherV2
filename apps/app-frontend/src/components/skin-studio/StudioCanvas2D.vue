<script setup lang="ts">
import { useResizeObserver } from '@vueuse/core'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import StudioIcon from '@/components/skin-studio/StudioIcon.vue'
import { useStudioText } from '@/skin-studio/i18n'
import { regionsInPixels } from '@/skin-studio/engine/model'
import { usePainter } from '@/skin-studio/painter'
import { useSkinStudio } from '@/skin-studio/store'

const studio = useSkinStudio()
const t = useStudioText()
const painter = usePainter()

const host = ref<HTMLDivElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const size = ref({ width: 0, height: 0 })
const zoom = ref(0)
const pan = ref({ x: 0, y: 0 })
let panning: { x: number; y: number; px: number; py: number } | null = null
let imageCanvas: HTMLCanvasElement | null = null
let imageBuffer: ImageData | null = null
let lastDoc: unknown = null
let frame = 0

const doc = computed(() => {
	void studio.revision
	return studio.active
})

useResizeObserver(host, (entries) => {
	const rect = entries[0].contentRect
	size.value = { width: Math.floor(rect.width), height: Math.floor(rect.height) }
	schedule()
})

function fitZoom(): number {
	const d = doc.value
	if (!d) return 1
	const margin = 48
	return Math.max(1, Math.floor(Math.min((size.value.width - margin) / d.image.width, (size.value.height - margin) / d.image.height)))
}

const effectiveZoom = computed(() => (zoom.value > 0 ? zoom.value : fitZoom()))

function origin() {
	const d = doc.value
	if (!d) return { x: 0, y: 0 }
	const z = effectiveZoom.value
	return {
		x: Math.floor((size.value.width - d.image.width * z) / 2 + pan.value.x),
		y: Math.floor((size.value.height - d.image.height * z) / 2 + pan.value.y),
	}
}

function syncImage(): void {
	const d = doc.value
	if (!d) return
	if (!imageCanvas || imageCanvas.width !== d.image.width || imageCanvas.height !== d.image.height) {
		imageCanvas = document.createElement('canvas')
		imageCanvas.width = d.image.width
		imageCanvas.height = d.image.height
		imageBuffer = null
	}
	const context = imageCanvas.getContext('2d')
	if (!context) return
	if (!imageBuffer || imageBuffer.width !== d.image.width) imageBuffer = context.createImageData(d.image.width, d.image.height)
	imageBuffer.data.set(d.image.data)
	context.putImageData(imageBuffer, 0, 0)
}

function cssVar(name: string, fallback: string): string {
	const value = getComputedStyle(host.value ?? document.documentElement).getPropertyValue(name).trim()
	return value || fallback
}

function draw(): void {
	frame = 0
	const c = canvas.value
	const d = doc.value
	if (!c) return
	const dpr = Math.min(2, window.devicePixelRatio || 1)
	c.width = Math.max(1, Math.floor(size.value.width * dpr))
	c.height = Math.max(1, Math.floor(size.value.height * dpr))
	const ctx = c.getContext('2d')
	if (!ctx) return
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
	ctx.clearRect(0, 0, size.value.width, size.value.height)
	if (!d) return
	if (lastDoc !== d.image) lastDoc = d.image
	syncImage()
	const z = effectiveZoom.value
	const o = origin()
	const w = d.image.width * z
	const h = d.image.height * z
	if (studio.prefs.alphaChecker) {
		const cell = Math.max(4, z * (d.image.width > 64 ? d.image.width / 64 : 1) * 2)
		ctx.fillStyle = '#26222e'
		ctx.fillRect(o.x, o.y, w, h)
		ctx.fillStyle = '#302a39'
		for (let y = 0; y < h; y += cell) {
			for (let x = (Math.floor(y / cell) % 2) * cell; x < w; x += cell * 2) {
				ctx.fillRect(o.x + x, o.y + y, Math.min(cell, w - x), Math.min(cell, h - y))
			}
		}
	}
	ctx.imageSmoothingEnabled = false
	if (imageCanvas) ctx.drawImage(imageCanvas, o.x, o.y, w, h)
	const regions = regionsInPixels(d.model, d.image.width, d.image.height)
	if (studio.prefs.grid && z >= 4) {
		ctx.strokeStyle = `rgba(185, 170, 220, ${studio.prefs.gridOpacity * 0.45})`
		ctx.lineWidth = 1
		ctx.beginPath()
		for (let x = 0; x <= d.image.width; x++) {
			ctx.moveTo(o.x + x * z + 0.5, o.y)
			ctx.lineTo(o.x + x * z + 0.5, o.y + h)
		}
		for (let y = 0; y <= d.image.height; y++) {
			ctx.moveTo(o.x, o.y + y * z + 0.5)
			ctx.lineTo(o.x + w, o.y + y * z + 0.5)
		}
		ctx.stroke()
	}
	if (studio.prefs.grid) {
		ctx.strokeStyle = `rgba(181, 154, 255, ${Math.min(1, studio.prefs.gridOpacity + 0.25)})`
		ctx.lineWidth = 1
		for (const region of regions) {
			const r = region.rect
			ctx.strokeRect(o.x + r.x * z + 0.5, o.y + r.y * z + 0.5, r.w * z - 1, r.h * z - 1)
		}
	}
	if (studio.prefs.protectHidden) {
		ctx.fillStyle = 'rgba(10, 8, 16, 0.62)'
		for (const region of regions) {
			const box = d.model.boxes[region.box]
			const visible =
				studio.visibility.parts[box.part] !== false &&
				(box.layer === 'base' || (studio.visibility.overlayGlobal && studio.visibility.overlay[box.part] !== false))
			if (visible) continue
			const r = region.rect
			ctx.fillRect(o.x + r.x * z, o.y + r.y * z, r.w * z, r.h * z)
		}
	}
	if (studio.prefs.regions && z >= 4) {
		ctx.font = `${Math.max(9, Math.min(12, z * 1.6))}px Segoe UI, sans-serif`
		ctx.fillStyle = cssVar('--eden-text-secondary', '#b8abc8')
		for (const region of regions) {
			if (region.face !== 'front') continue
			const box = d.model.boxes[region.box]
			ctx.fillText(box.name, o.x + region.rect.x * z + 3, o.y + region.rect.y * z + 12)
		}
	}
	if (studio.selection) {
		const s = studio.selection
		ctx.setLineDash([4, 3])
		ctx.strokeStyle = '#80e1cb'
		ctx.lineWidth = 1.5
		ctx.strokeRect(o.x + s.x * z + 0.5, o.y + s.y * z + 0.5, s.w * z - 1, s.h * z - 1)
		ctx.setLineDash([])
	}
	if (hoverTexel.value) {
		const [x, y] = hoverTexel.value
		const n = studio.tool === 'fill' || studio.tool === 'dropper' ? 1 : studio.settings.brushSize
		const start = Math.floor(n / 2)
		ctx.strokeStyle = 'rgba(255,255,255,0.9)'
		ctx.lineWidth = 1
		ctx.strokeRect(o.x + (x - start) * z + 0.5, o.y + (y - start) * z + 0.5, n * z - 1, n * z - 1)
	}
}

function schedule(): void {
	if (!frame) frame = requestAnimationFrame(draw)
}

const hoverTexel = ref<[number, number] | null>(null)

function texelAt(event: PointerEvent | WheelEvent): [number, number] | null {
	const d = doc.value
	const c = canvas.value
	if (!d || !c) return null
	const rect = c.getBoundingClientRect()
	const z = effectiveZoom.value
	const o = origin()
	const x = Math.floor((event.clientX - rect.left - o.x) / z)
	const y = Math.floor((event.clientY - rect.top - o.y) / z)
	if (x < 0 || y < 0 || x >= d.image.width || y >= d.image.height) return null
	return [x, y]
}

function onPointerDown(event: PointerEvent): void {
	const c = canvas.value
	if (!c) return
	c.focus()
	if (event.button === 1 || (event.button === 0 && (studio.tool === 'camera' || event.altKey && studio.tool !== 'stamp'))) {
		panning = { x: event.clientX, y: event.clientY, px: pan.value.x, py: pan.value.y }
		c.setPointerCapture(event.pointerId)
		return
	}
	if (event.button !== 0 && event.button !== 2) return
	const texel = texelAt(event)
	if (!texel) return
	const started = painter.begin(
		{ x: texel[0], y: texel[1] },
		{
			secondary: event.button === 2 || event.shiftKey,
			invert: event.shiftKey,
			sample: event.altKey,
			lockFace: event.ctrlKey,
		},
		'2d',
	)
	if (started) c.setPointerCapture(event.pointerId)
	schedule()
}

function onPointerMove(event: PointerEvent): void {
	if (panning) {
		pan.value = { x: panning.px + event.clientX - panning.x, y: panning.py + event.clientY - panning.y }
		schedule()
		return
	}
	const texel = texelAt(event)
	hoverTexel.value = texel
	const d = doc.value
	if (d) painter.updateHover(d, texel ? { x: texel[0], y: texel[1] } : null)
	if (texel && painter.active) {
		const events = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [event]
		for (const e of events.length ? events : [event]) {
			const p = texelAt(e)
			if (p) painter.move({ x: p[0], y: p[1] }, '2d')
		}
	}
	schedule()
}

function onPointerUp(event: PointerEvent): void {
	if (panning) {
		panning = null
	} else {
		painter.end()
	}
	if (canvas.value?.hasPointerCapture(event.pointerId)) canvas.value.releasePointerCapture(event.pointerId)
	schedule()
}

function onPointerCancel(): void {
	panning = null
	painter.cancel()
	schedule()
}

function onWheel(event: WheelEvent): void {
	event.preventDefault()
	const current = effectiveZoom.value
	const next = Math.max(1, Math.min(64, event.deltaY < 0 ? current + Math.max(1, Math.round(current * 0.15)) : current - Math.max(1, Math.round(current * 0.15))))
	zoom.value = next
	schedule()
}

function zoomBy(direction: 1 | -1): void {
	const current = effectiveZoom.value
	zoom.value = Math.max(1, Math.min(64, current + direction * Math.max(1, Math.round(current * 0.2))))
	schedule()
}

function fit(): void {
	zoom.value = 0
	pan.value = { x: 0, y: 0 }
	schedule()
}

function onLeave(): void {
	hoverTexel.value = null
	schedule()
}

watch(
	() => [studio.revision, studio.prefs.grid, studio.prefs.gridOpacity, studio.prefs.alphaChecker, studio.prefs.regions, studio.prefs.protectHidden, studio.selection, studio.visibility],
	schedule,
	{ deep: true },
)

watch(
	() => studio.activeId,
	() => fit(),
)

onMounted(schedule)
onBeforeUnmount(() => {
	if (frame) cancelAnimationFrame(frame)
})

defineExpose({ zoomBy, fit })
</script>

<template>
	<div ref="host" class="studio-canvas2d">
		<canvas
			ref="canvas"
			class="studio-canvas2d__surface"
			tabindex="0"
			:aria-label="t('canvas.view2d')"
			@pointerdown="onPointerDown"
			@pointermove="onPointerMove"
			@pointerup="onPointerUp"
			@pointercancel="onPointerCancel"
			@pointerleave="onLeave"
			@wheel="onWheel"
			@contextmenu.prevent
		/>
		<div class="studio-canvas2d__tools">
			<button v-tooltip="t('canvas.zoomOut')" type="button" :aria-label="t('canvas.zoomOut')" @click="zoomBy(-1)">−</button>
			<button v-tooltip="t('canvas.fit')" type="button" :aria-label="t('canvas.fit')" @click="fit">
				<StudioIcon name="grid" :size="15" />
			</button>
			<button v-tooltip="t('canvas.zoomIn')" type="button" :aria-label="t('canvas.zoomIn')" @click="zoomBy(1)">+</button>
		</div>
	</div>
</template>

<style scoped lang="scss">
.studio-canvas2d {
	position: relative;
	width: 100%;
	height: 100%;
	min-height: 0;
	overflow: hidden;
}

.studio-canvas2d__surface {
	display: block;
	width: 100%;
	height: 100%;
	cursor: crosshair;
	touch-action: none;
	outline: none;

	&:focus-visible {
		box-shadow: inset 0 0 0 2px var(--eden-accent);
	}
}

.studio-canvas2d__tools {
	position: absolute;
	right: 12px;
	bottom: 12px;
	display: flex;
	gap: 4px;

	button {
		display: grid;
		width: 29px;
		height: 29px;
		place-items: center;
		padding: 0;
		border: 1px solid var(--eden-border);
		border-radius: 8px;
		color: var(--eden-text);
		background: var(--eden-surface);
		cursor: pointer;

		&:hover {
			border-color: var(--eden-accent);
		}

		&:focus-visible {
			outline: 2px solid var(--eden-accent);
			outline-offset: 2px;
		}
	}
}
</style>
