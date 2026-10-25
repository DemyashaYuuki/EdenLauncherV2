<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import { computed } from 'vue'

import wordmarkAnimated from '@/assets/eden/error-fx/error-wordmark-animated.webp'
import wordmarkStill from '@/assets/eden/error-fx/error-wordmark-glitch.svg?url'
import grainTexture from '@/assets/eden/error-fx/grain.png'
import interferenceAnimated from '@/assets/eden/error-fx/interference-animated.webp'
import interferenceStill from '@/assets/eden/error-fx/interference-still.png'
import { useTheming } from '@/store/state'

/**
 * Decorative Error / Signal layers: scanlines, grain, rare interference and the ERROR wordmark.
 * They never take pointer events or focus and sit below dialogs.
 */
const themeStore = useTheming()
defineProps<{ editorActive?: boolean }>()
const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
const roomForWordmark = useMediaQuery('(min-width: 1100px) and (min-height: 640px)')

const still = computed(() => prefersReducedMotion.value || !themeStore.advancedRendering)
const interference = computed(() => (still.value ? interferenceStill : interferenceAnimated))
const wordmark = computed(() => (still.value ? wordmarkStill : wordmarkAnimated))
</script>

<template>
	<div v-if="themeStore.errorFxActive" class="eden-error-fx" :class="{ 'eden-error-fx--studio': editorActive }" aria-hidden="true">
		<div class="eden-error-fx__scanlines"></div>
		<div class="eden-error-fx__grain" :style="{ backgroundImage: `url(${grainTexture})` }"></div>
		<img class="eden-error-fx__interference" :src="interference" alt="" draggable="false" />
		<img
			v-if="roomForWordmark"
			class="eden-error-fx__wordmark"
			:src="wordmark"
			alt=""
			draggable="false"
		/>
	</div>
</template>

<style scoped lang="scss">
.eden-error-fx {
	position: fixed;
	z-index: 12;
	inset: 0;
	overflow: hidden;
	pointer-events: none;
	user-select: none;
}

.eden-error-fx > * {
	position: absolute;
	pointer-events: none;
}

.eden-error-fx--studio {
	bottom: auto;
	height: calc(var(--eden-titlebar-height, 48px) + 100px);
}

.eden-error-fx__scanlines {
	inset: 0;
	background: repeating-linear-gradient(
		0deg,
		rgba(242, 240, 234, 0.035) 0,
		rgba(242, 240, 234, 0.035) 1px,
		transparent 1px,
		transparent 6px
	);
}

.eden-error-fx__grain {
	inset: 0;
	background-position: center;
	background-size: cover;
	opacity: 0.7;
}

.eden-error-fx__interference {
	inset: 0;
	width: 100%;
	height: 100%;
	object-fit: cover;
	opacity: 0.9;
}

.eden-error-fx__wordmark {
	top: calc(var(--eden-titlebar-height) + 20px);
	right: calc(var(--eden-page-padding-x) + 64px);
	width: 260px;
	height: 65px;
}
</style>
