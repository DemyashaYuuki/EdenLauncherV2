<script setup lang="ts">
import { useResizeObserver } from '@vueuse/core'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'

import StudioIcon from '@/components/skin-studio/StudioIcon.vue'
import { useStudioText } from '@/skin-studio/i18n'
import { usePainter } from '@/skin-studio/painter'
import { StudioScene } from '@/skin-studio/render/scene'
import { useSkinStudio } from '@/skin-studio/store'

const props = defineProps<{ themeBackground: string }>()
const emit = defineEmits<{ (event: 'screenshot' | 'popout'): void }>()

const studio = useSkinStudio()
const t = useStudioText()
const painter = usePainter()

const host = ref<HTMLDivElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const scene = shallowRef<StudioScene | null>(null)
const failed = ref(false)
let drag: { mode: 'orbit' | 'pan'; x: number; y: number } | null = null
let lastNdc: [number, number] = [0, 0]
let currentImage: unknown = null
let currentModel: unknown = null
let currentAntialias: boolean | null = null

const doc = computed(() => {
	void studio.revision
	return studio.active
})

function createScene(): void {
	if (!canvas.value) return
	scene.value?.dispose()
	try {
		scene.value = new StudioScene(canvas.value, studio.prefs.multisampling)
		currentAntialias = studio.prefs.multisampling
		failed.value = false
	} catch {
		scene.value = null
		failed.value = true
		return
	}
	currentImage = null
	currentModel = null
	applyOptions()
	syncDocument()
	const rect = host.value?.getBoundingClientRect()
	if (rect) scene.value.resize(rect.width, rect.height)
}

function applyOptions(): void {
	scene.value?.setOptions({
		background:
			studio.prefs.backgroundMode === 'color'
				? studio.prefs.backgroundColor
				: props.themeBackground,
		grass: studio.prefs.grass,
		lighting: studio.prefs.lighting,
		animate: studio.prefs.animate,
		followCursor: studio.prefs.followCursor,
		transparency: studio.prefs.transparency,
	})
}

function syncDocument(): void {
	const s = scene.value
	const d = doc.value
	if (!s || !d) return
	if (currentModel !== d.model) {
		s.setModel(d.model, d.image)
		currentModel = d.model
		currentImage = d.image
	} else if (currentImage !== d.image) {
		s.setTexture(d.image)
		currentImage = d.image
	} else {
		s.textureChanged()
	}
	s.setVisibility({
		parts: { ...studio.visibility.parts },
		overlay: { ...studio.visibility.overlay },
		overlayGlobal: studio.visibility.overlayGlobal,
		ghost: studio.visibility.ghost,
	})
}

useResizeObserver(host, (entries) => {
	const rect = entries[0].contentRect
	scene.value?.resize(rect.width, rect.height)
})

function ndc(event: PointerEvent | MouseEvent): [number, number] {
	const rect = canvas.value?.getBoundingClientRect()
	if (!rect) return [0, 0]
	return [
		((event.clientX - rect.left) / rect.width) * 2 - 1,
		-((event.clientY - rect.top) / rect.height) * 2 + 1,
	]
}

function pickAt(event: PointerEvent) {
	const s = scene.value
	const d = doc.value
	if (!s || !d) return null
	const [x, y] = ndc(event)
	return s.pick(x, y, studio.prefs.paintTarget, d.image)
}

function onPointerDown(event: PointerEvent): void {
	const c = canvas.value
	if (!c || !scene.value) return
	c.focus()
	if (
		event.button === 2 ||
		event.button === 1 ||
		(event.button === 0 && studio.tool === 'camera')
	) {
		drag = {
			mode: event.button === 1 || (event.button === 2 && event.shiftKey) ? 'pan' : 'orbit',
			x: event.clientX,
			y: event.clientY,
		}
		c.setPointerCapture(event.pointerId)
		return
	}
	if (event.button !== 0) return
	const hit = pickAt(event)
	if (!hit) {
		drag = { mode: 'orbit', x: event.clientX, y: event.clientY }
		c.setPointerCapture(event.pointerId)
		return
	}
	lastNdc = ndc(event)
	const started = painter.begin(
		{ x: hit.x, y: hit.y, box: hit.box, face: hit.face },
		{
			secondary: event.shiftKey,
			invert: event.shiftKey,
			sample: event.altKey,
			lockFace: event.ctrlKey,
		},
		'3d',
	)
	if (started) c.setPointerCapture(event.pointerId)
}

function paintAlong(event: PointerEvent): void {
	const [x1, y1] = ndc(event)
	const [x0, y0] = lastNdc
	const rect = canvas.value?.getBoundingClientRect()
	const pixels = rect ? Math.hypot(((x1 - x0) * rect.width) / 2, ((y1 - y0) * rect.height) / 2) : 1
	const steps = Math.min(64, Math.max(1, Math.ceil(pixels / 3)))
	const s = scene.value
	const d = doc.value
	if (!s || !d) return
	for (let i = 1; i <= steps; i++) {
		const k = i / steps
		const hit = s.pick(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, studio.prefs.paintTarget, d.image)
		if (hit) painter.move({ x: hit.x, y: hit.y, box: hit.box, face: hit.face }, '3d')
	}
	lastNdc = [x1, y1]
}

function onPointerMove(event: PointerEvent): void {
	const s = scene.value
	if (!s) return
	const [nx, ny] = ndc(event)
	s.setCursor(nx, ny)
	if (drag) {
		const dx = event.clientX - drag.x
		const dy = event.clientY - drag.y
		drag.x = event.clientX
		drag.y = event.clientY
		if (drag.mode === 'orbit') s.rotateBy(dx, dy)
		else s.panBy(dx, dy)
		return
	}
	if (painter.active) {
		paintAlong(event)
		return
	}
	const d = doc.value
	const hit = pickAt(event)
	if (d) painter.updateHover(d, hit ? { x: hit.x, y: hit.y, box: hit.box, face: hit.face } : null)
}

function onPointerUp(event: PointerEvent): void {
	if (drag) drag = null
	else painter.end()
	if (canvas.value?.hasPointerCapture(event.pointerId))
		canvas.value.releasePointerCapture(event.pointerId)
}

function onPointerCancel(): void {
	drag = null
	painter.cancel()
}

function onWheel(event: WheelEvent): void {
	event.preventDefault()
	scene.value?.zoomBy(event.deltaY > 0 ? 1.1 : 1 / 1.1)
}

function onKeyDown(event: KeyboardEvent): void {
	const s = scene.value
	if (!s) return
	const step = 24
	if (event.key === 'ArrowLeft') s.rotateBy(-step, 0)
	else if (event.key === 'ArrowRight') s.rotateBy(step, 0)
	else if (event.key === 'ArrowUp') s.rotateBy(0, -step)
	else if (event.key === 'ArrowDown') s.rotateBy(0, step)
	else return
	event.preventDefault()
}

function resetCamera(): void {
	scene.value?.resetCamera()
}

function zoomBy(direction: 1 | -1): void {
	scene.value?.zoomBy(direction > 0 ? 1 / 1.2 : 1.2)
}

async function screenshot(
	width: number,
	height: number,
	transparent: boolean,
): Promise<Blob | null> {
	return scene.value ? scene.value.screenshot(width, height, transparent) : null
}

watch(
	() => studio.revision,
	() => syncDocument(),
)
watch(
	() => studio.activeId,
	() => {
		drag = null
		painter.cancel()
	},
)
watch(
	() => ({
		...studio.visibility,
		parts: { ...studio.visibility.parts },
		overlay: { ...studio.visibility.overlay },
	}),
	() => syncDocument(),
	{ deep: true },
)
watch(
	() => [
		studio.prefs.backgroundMode,
		studio.prefs.backgroundColor,
		studio.prefs.grass,
		studio.prefs.lighting,
		studio.prefs.animate,
		studio.prefs.followCursor,
		studio.prefs.transparency,
		props.themeBackground,
	],
	applyOptions,
)
watch(
	() => studio.prefs.multisampling,
	(value) => {
		if (value !== currentAntialias) createScene()
	},
)

onMounted(createScene)
onBeforeUnmount(() => {
	painter.cancel()
	scene.value?.dispose()
})

defineExpose({ resetCamera, zoomBy, screenshot })
</script>

<template>
	<div ref="host" class="studio-view3d">
		<canvas
			ref="canvas"
			class="studio-view3d__surface"
			tabindex="0"
			:aria-label="t('canvas.view3d')"
			@pointerdown="onPointerDown"
			@pointermove="onPointerMove"
			@pointerup="onPointerUp"
			@pointercancel="onPointerCancel"
			@wheel="onWheel"
			@keydown="onKeyDown"
			@contextmenu.prevent
		/>
		<p v-if="failed" class="studio-view3d__error" role="alert">{{ t('canvas.webglError') }}</p>
		<div class="studio-view3d__tools">
			<button
				v-tooltip="t('canvas.resetCamera')"
				type="button"
				:aria-label="t('canvas.resetCamera')"
				@click="resetCamera"
			>
				<StudioIcon name="refresh" :size="15" />
			</button>
			<button
				v-tooltip="t('canvas.screenshot')"
				type="button"
				:aria-label="t('canvas.screenshot')"
				@click="emit('screenshot')"
			>
				<StudioIcon name="camera" :size="15" />
			</button>
			<button
				v-tooltip="t('canvas.popout')"
				type="button"
				:aria-label="t('canvas.popout')"
				@click="emit('popout')"
			>
				<StudioIcon name="split" :size="15" />
			</button>
		</div>
	</div>
</template>

<style scoped lang="scss">
.studio-view3d {
	position: relative;
	width: 100%;
	height: 100%;
	min-height: 0;
	overflow: hidden;
}

.studio-view3d__surface {
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

.studio-view3d__error {
	position: absolute;
	inset: 40% 24px auto;
	margin: 0;
	color: var(--eden-error);
	text-align: center;
}

.studio-view3d__tools {
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
