<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

import { validateModel } from '../engine/project.ts'
import { useStudioText } from '../i18n.ts'
import { StudioScene } from '../render/scene.ts'
import { isDocumentMessage, PREVIEW_CHANNEL, type PreviewMessage } from './protocol.ts'

const t = useStudioText()
const canvas = ref<HTMLCanvasElement | null>(null)
const name = ref('')
const waiting = ref(true)
let scene: StudioScene | null = null
let channel: BroadcastChannel | null = null
let drag: { x: number; y: number; pan: boolean } | null = null
let lastModelKey = ''

function resize(): void {
	if (!scene || !canvas.value) return
	scene.resize(window.innerWidth, window.innerHeight)
}

function onMessage(event: MessageEvent<PreviewMessage>): void {
	if (!scene || !isDocumentMessage(event.data)) return
	const data = event.data
	let model
	try {
		model = validateModel(data.model)
	} catch {
		return
	}
	const image = { width: data.width, height: data.height, data: new Uint8ClampedArray(data.pixels) }
	const key = JSON.stringify([model.id, model.boxes.length, data.width, data.height])
	if (key !== lastModelKey) {
		scene.setModel(model, image)
		lastModelKey = key
	} else {
		scene.setTexture(image)
	}
	scene.setVisibility(data.visibility)
	scene.setOptions({ transparency: data.transparency })
	name.value = data.name.slice(0, 80)
	document.title = t('preview.title', { name: name.value })
	waiting.value = false
}

function onDown(event: PointerEvent): void {
	drag = { x: event.clientX, y: event.clientY, pan: event.button !== 0 }
	canvas.value?.setPointerCapture(event.pointerId)
}

function onMove(event: PointerEvent): void {
	if (!drag || !scene) return
	const dx = event.clientX - drag.x
	const dy = event.clientY - drag.y
	drag.x = event.clientX
	drag.y = event.clientY
	if (drag.pan) scene.panBy(dx, dy)
	else scene.rotateBy(dx, dy)
}

function onUp(): void {
	drag = null
}

function onWheel(event: WheelEvent): void {
	event.preventDefault()
	scene?.zoomBy(event.deltaY > 0 ? 1.1 : 1 / 1.1)
}

onMounted(() => {
	if (!canvas.value) return
	scene = new StudioScene(canvas.value, true)
	scene.setOptions({ background: '#100d19', lighting: true })
	resize()
	window.addEventListener('resize', resize)
	channel = new BroadcastChannel(PREVIEW_CHANNEL)
	channel.onmessage = onMessage
	channel.postMessage({ type: 'hello' } satisfies PreviewMessage)
})

onBeforeUnmount(() => {
	window.removeEventListener('resize', resize)
	channel?.close()
	scene?.dispose()
})
</script>

<template>
	<main class="preview-app">
		<canvas
			ref="canvas"
			class="preview-app__canvas"
			:aria-label="t('canvas.view3d')"
			@pointerdown="onDown"
			@pointermove="onMove"
			@pointerup="onUp"
			@pointercancel="onUp"
			@wheel="onWheel"
			@contextmenu.prevent
		/>
		<p v-if="waiting" class="preview-app__waiting">{{ t('preview.waiting') }}</p>
	</main>
</template>

<style>
html,
body {
	margin: 0;
	height: 100%;
	overflow: hidden;
	background: #100d19;
}
</style>

<style scoped>
.preview-app {
	position: fixed;
	inset: 0;
	font-family: 'Segoe UI Variable', 'Segoe UI', sans-serif;
}

.preview-app__canvas {
	display: block;
	width: 100%;
	height: 100%;
	touch-action: none;
}

.preview-app__waiting {
	position: absolute;
	inset: 45% 0 auto;
	margin: 0;
	color: #b8abc8;
	text-align: center;
}
</style>
