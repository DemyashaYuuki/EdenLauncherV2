<script setup lang="ts">
import StudioIcon from '@/components/skin-studio/StudioIcon.vue'
import type { ToolId } from '@/skin-studio/engine/paint'
import type { ShortcutAction } from '@/skin-studio/engine/shortcuts'
import { type StudioKey, useStudioText } from '@/skin-studio/i18n'
import { useSkinStudio } from '@/skin-studio/store'

const studio = useSkinStudio()
const t = useStudioText()

const tools: { id: ToolId; icon: string }[] = [
	{ id: 'pencil', icon: 'pencil' },
	{ id: 'eraser', icon: 'eraser' },
	{ id: 'dropper', icon: 'picker' },
	{ id: 'fill', icon: 'fill' },
	{ id: 'noise', icon: 'noise' },
	{ id: 'dodgeBurn', icon: 'dodge' },
	{ id: 'darkenLighten', icon: 'burn' },
	{ id: 'stamp', icon: 'stamp' },
	{ id: 'select', icon: 'select' },
	{ id: 'camera', icon: 'orbit' },
]

function shortcut(id: ToolId): string {
	return studio.shortcuts[`tool.${id}` as ShortcutAction] ?? ''
}

function tip(id: ToolId): string {
	const key = shortcut(id)
	return `${t(`tool.${id}` as StudioKey)}${key ? ` (${key})` : ''} — ${t(`tool.hint.${id}` as StudioKey)}`
}
</script>

<template>
	<div class="studio-rail" role="toolbar" aria-orientation="vertical" :aria-label="t('inspector.brush')">
		<button
			v-for="tool in tools"
			:key="tool.id"
			v-tooltip.right="tip(tool.id)"
			type="button"
			class="studio-rail__button"
			:class="{ active: studio.tool === tool.id }"
			:aria-pressed="studio.tool === tool.id"
			:aria-label="t(`tool.${tool.id}` as StudioKey)"
			:aria-keyshortcuts="shortcut(tool.id) || undefined"
			@click="studio.tool = tool.id"
		>
			<StudioIcon :name="tool.icon" :size="18" />
		</button>
		<span class="studio-rail__divider" />
		<button
			v-tooltip.right="`${t('tool.mirror')} (${studio.shortcuts['brush.mirror']})`"
			type="button"
			class="studio-rail__button"
			:class="{ active: studio.settings.mirror }"
			:aria-pressed="studio.settings.mirror"
			:aria-label="t('tool.mirror')"
			@click="studio.settings.mirror = !studio.settings.mirror"
		>
			<StudioIcon name="mirror" :size="18" />
		</button>
	</div>
</template>

<style scoped lang="scss">
.studio-rail {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 4px;
	padding: 10px 4px;
	overflow-y: auto;
	border-right: 1px solid var(--eden-border);
}

.studio-rail__button {
	display: grid;
	width: 40px;
	height: 40px;
	flex: 0 0 auto;
	place-items: center;
	padding: 0;
	border: 1px solid transparent;
	border-radius: 9px;
	color: var(--eden-text-secondary);
	background: transparent;
	cursor: pointer;
	transition:
		background-color 140ms ease,
		border-color 140ms ease;

	&:hover {
		color: var(--eden-text);
		background: var(--eden-surface-raised);
	}

	&.active {
		border-color: var(--eden-border);
		color: var(--eden-accent);
		background: var(--eden-surface-raised);
	}

	&:focus-visible {
		outline: 2px solid var(--eden-accent);
		outline-offset: 2px;
	}
}

.studio-rail__divider {
	width: 24px;
	height: 1px;
	margin: 4px 0;
	background: var(--eden-border);
}

@media (prefers-reduced-motion: reduce) {
	.studio-rail__button {
		transition: none;
	}
}
</style>
