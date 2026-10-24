<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'

import type { RgbaImage } from '@/skin-studio/engine/image'

const props = defineProps<{ image: RgbaImage | null; version?: number; label?: string }>()
const canvas = ref<HTMLCanvasElement | null>(null)

function draw(): void {
	const c = canvas.value
	const image = props.image
	if (!c || !image) return
	c.width = image.width
	c.height = image.height
	const ctx = c.getContext('2d')
	if (!ctx) return
	const data = ctx.createImageData(image.width, image.height)
	data.data.set(image.data)
	ctx.putImageData(data, 0, 0)
}

watch(() => [props.image, props.version], draw)
onMounted(draw)
</script>

<template>
	<canvas ref="canvas" class="studio-thumb" :aria-label="label" role="img" />
</template>

<style scoped>
.studio-thumb {
	display: block;
	width: 100%;
	height: 100%;
	object-fit: contain;
	image-rendering: pixelated;
}
</style>
