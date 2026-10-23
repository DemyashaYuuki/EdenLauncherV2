<script setup lang="ts">
/**
 * Body of an EdenLauncher settings tab. The tab title and description are shown by the
 * settings dialog header, so here they are only kept for assistive technology.
 */
defineProps<{
	description: string
	title: string
}>()
</script>

<template>
	<div class="flex min-w-0 flex-col gap-5">
		<p class="sr-only">{{ title }}. {{ description }}</p>
		<div v-if="$slots.actions" class="flex justify-end">
			<slot name="actions" />
		</div>

		<main>
			<slot />
		</main>

		<footer v-if="$slots.footer" class="px-1 text-sm text-secondary">
			<slot name="footer" />
		</footer>
	</div>
</template>
