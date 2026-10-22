<script setup lang="ts">
// Hexagonal EW mark. Strokes follow the current text colour so every palette can tint it.
withDefaults(defineProps<{ size?: number | string; title?: string }>(), {
	size: 40,
	title: undefined,
})
</script>

<template>
	<svg
		class="eden-mark"
		:width="size"
		:height="size"
		:style="{ width: `${size}px`, height: `${size}px` }"
		viewBox="0 0 64 64"
		:role="title ? 'img' : undefined"
		:aria-hidden="title ? undefined : 'true'"
		:aria-label="title"
	>
		<path
			d="m32 3 26 15v28L32 61 6 46V18Z"
			fill="var(--eden-mark-fill, transparent)"
			stroke="currentColor"
			stroke-width="2.6"
			stroke-linejoin="round"
		/>
		<path
			d="M15 23h12m-12 0v18m0-9h10m-10 9h12m5-18 4 18 5-13 5 13 4-18"
			fill="none"
			stroke="currentColor"
			stroke-width="3"
			stroke-linecap="square"
			stroke-linejoin="miter"
		/>
	</svg>
</template>

<style scoped>
.eden-mark {
	display: block;
	flex: 0 0 auto;
	color: var(--eden-accent-text, #bc9bff);
}
</style>
