<script setup lang="ts">
import { type Component, computed } from 'vue'

const icons = import.meta.glob<Component>('@/assets/eden/skin-studio/icons/*.svg', {
	query: '?component',
	import: 'default',
	eager: true,
})

const byName: Record<string, Component> = Object.fromEntries(
	Object.entries(icons).map(([path, component]) => [
		path.slice(path.lastIndexOf('/') + 1, -'.svg'.length),
		component,
	]),
)

const props = withDefaults(defineProps<{ name: string; size?: number }>(), { size: 18 })
const icon = computed(() => byName[props.name])
</script>

<template>
	<component
		:is="icon"
		v-if="icon"
		class="studio-icon"
		:width="size"
		:height="size"
		aria-hidden="true"
		focusable="false"
	/>
</template>

<style scoped>
.studio-icon {
	flex: 0 0 auto;
}
</style>
