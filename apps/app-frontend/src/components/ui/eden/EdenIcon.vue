<script setup lang="ts">
// Unified EdenLauncher icon set: 24 × 24 grid, 1.65 px stroke, colour from currentColor.
import { type Component, computed } from 'vue'

const icons = import.meta.glob<Component>('@/assets/eden/icons/*.svg', {
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

type EdenIconName =
	| 'arrow'
	| 'bell'
	| 'code'
	| 'disk'
	| 'edit'
	| 'eye'
	| 'glitch'
	| 'java'
	| 'key'
	| 'language'
	| 'link'
	| 'lock'
	| 'logout'
	| 'memory'
	| 'network'
	| 'rewind'
	| 'sliders'
	| 'trash'
	| 'upload'
	| 'bolt'
	| 'check'
	| 'chevron'
	| 'chevrondown'
	| 'clock'
	| 'close'
	| 'compass'
	| 'copy'
	| 'download'
	| 'external'
	| 'folder'
	| 'globe'
	| 'grid'
	| 'heart'
	| 'home'
	| 'image'
	| 'info'
	| 'library'
	| 'maximize'
	| 'minimize'
	| 'monitor'
	| 'moon'
	| 'more'
	| 'pause'
	| 'play'
	| 'plus'
	| 'refresh'
	| 'search'
	| 'server'
	| 'settings'
	| 'shield'
	| 'shirt'
	| 'studio'
	| 'sun'
	| 'user'
	| 'users'
	| 'volume'
	| 'warning'
	| 'wifi'

const props = withDefaults(defineProps<{ name: EdenIconName; size?: number }>(), { size: 20 })
const icon = computed(() => byName[props.name])
</script>

<template>
	<component
		:is="icon"
		v-if="icon"
		class="eden-icon"
		:width="size"
		:height="size"
		:style="{ width: `${size}px`, height: `${size}px` }"
		aria-hidden="true"
		focusable="false"
	/>
</template>

<style scoped>
.eden-icon {
	display: block;
	flex: 0 0 auto;
}
</style>
