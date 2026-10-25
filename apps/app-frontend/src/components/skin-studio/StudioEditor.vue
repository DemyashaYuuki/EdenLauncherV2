<script setup lang="ts">
import { computed, ref } from 'vue'

import StudioApplyBar from '@/components/skin-studio/StudioApplyBar.vue'
import StudioCanvas2D from '@/components/skin-studio/StudioCanvas2D.vue'
import StudioDock from '@/components/skin-studio/StudioDock.vue'
import StudioInspector from '@/components/skin-studio/StudioInspector.vue'
import StudioToolRail from '@/components/skin-studio/StudioToolRail.vue'
import StudioViewport3D from '@/components/skin-studio/StudioViewport3D.vue'
import { isDirty } from '@/skin-studio/engine/document'
import { type StudioKey, useStudioText } from '@/skin-studio/i18n'
import { useSkinStudio, type ViewMode } from '@/skin-studio/store'

defineProps<{ themeBackground: string; savingPng: boolean }>()
const emit = defineEmits<{
	(
		event:
			| 'new'
			| 'models'
			| 'convert'
			| 'screenshot'
			| 'popout'
			| 'apply-microsoft'
			| 'apply-ely'
			| 'export-png'
			| 'server-help',
	): void
	(event: 'close', id: string): void
	(event: 'prompt', title: string, value: string, done: (value: string | null) => void): void
	(event: 'notify', kind: 'error' | 'info', text: string): void
}>()

const studio = useSkinStudio()
const t = useStudioText()
const view3d = ref<InstanceType<typeof StudioViewport3D> | null>(null)
const view2d = ref<InstanceType<typeof StudioCanvas2D> | null>(null)

const doc = computed(() => {
	void studio.revision
	return studio.active
})
const dirty = computed(() => (doc.value ? isDirty(doc.value) : false))

const modes: { id: ViewMode; label: StudioKey }[] = [
	{ id: '3d', label: 'canvas.mode.3d' },
	{ id: '2d', label: 'canvas.mode.2d' },
	{ id: 'split', label: 'canvas.mode.split' },
]

const toolStatus = computed(() =>
	t('status.tool', {
		tool: t(`tool.${studio.tool}` as StudioKey),
		size: studio.settings.brushSize,
		opacity: Math.round(studio.settings.opacity * 100),
	}),
)

const hoverStatus = computed(() => {
	const h = studio.hover
	if (!h) return t('status.noHover')
	const partKey = `part.${h.part}` as StudioKey
	const part = t(partKey) === partKey ? h.part : t(partKey)
	const face = t(`face.${h.face}` as StudioKey)
	return h.layer === 'overlay'
		? t('status.hoverLayer', { part, layer: t('layer.overlay'), face })
		: t('status.hover', { part, face })
})

defineExpose({
	resetCamera: () => view3d.value?.resetCamera(),
	zoom: (direction: 1 | -1) => {
		if (studio.prefs.viewMode === '2d') view2d.value?.zoomBy(direction)
		else view3d.value?.zoomBy(direction)
	},
	screenshot: (w: number, h: number, transparent: boolean) =>
		view3d.value?.screenshot(w, h, transparent) ?? null,
})
</script>

<template>
	<div class="studio-editor">
		<div class="studio-workspace">
			<StudioDock
				@new="emit('new')"
				@close="(id) => emit('close', id)"
				@models="emit('models')"
				@convert="emit('convert')"
			/>
			<StudioToolRail />
			<div class="studio-center">
				<div class="studio-center__bar">
					<span class="studio-center__name">
						{{ doc?.name ?? t('canvas.empty') }}
						<span v-if="dirty" class="studio-center__dirty" :aria-label="t('footer.unsaved')"
							>●</span
						>
					</span>
					<div
						class="studio-segmented"
						role="radiogroup"
						:aria-label="t('shortcut.view.toggleMode')"
					>
						<button
							v-for="mode in modes"
							:key="mode.id"
							type="button"
							role="radio"
							:aria-checked="studio.prefs.viewMode === mode.id"
							:class="{ active: studio.prefs.viewMode === mode.id }"
							@click="studio.prefs.viewMode = mode.id"
						>
							{{ t(mode.label) }}
						</button>
					</div>
					<span class="studio-center__size">{{
						doc ? `${doc.image.width} × ${doc.image.height}` : ''
					}}</span>
				</div>
				<div
					v-if="doc"
					class="studio-canvases"
					:class="`studio-canvases--${studio.prefs.viewMode}`"
				>
					<div v-show="studio.prefs.viewMode !== '2d'" class="studio-viewport">
						<span class="studio-viewport__label">{{ t('canvas.view3d') }}</span>
						<StudioViewport3D
							ref="view3d"
							:theme-background="themeBackground"
							@screenshot="emit('screenshot')"
							@popout="emit('popout')"
						/>
						<span class="studio-viewport__label studio-viewport__label--bottom">
							{{ t('canvas.info3d', { model: doc.model.name }) }}
						</span>
					</div>
					<div v-show="studio.prefs.viewMode !== '3d'" class="studio-viewport">
						<span class="studio-viewport__label">{{ t('canvas.view2d') }}</span>
						<StudioCanvas2D ref="view2d" />
						<span class="studio-viewport__label studio-viewport__label--bottom">
							{{ t('canvas.info2d', { w: doc.image.width, h: doc.image.height }) }}
						</span>
					</div>
				</div>
				<div v-else class="studio-canvases studio-canvases--empty">
					<button type="button" class="studio-center__new" @click="emit('new')">
						＋ {{ t('action.new') }}
					</button>
				</div>
				<div class="studio-center__status" aria-live="polite">
					<span>{{ toolStatus }}</span>
					<span>{{ hoverStatus }}</span>
				</div>
			</div>
			<StudioInspector
				@prompt="(title, value, done) => emit('prompt', title, value, done)"
				@notify="(kind, text) => emit('notify', kind, text)"
			/>
		</div>
		<StudioApplyBar
			:saving-png="savingPng"
			@apply-microsoft="emit('apply-microsoft')"
			@apply-ely="emit('apply-ely')"
			@export-png="emit('export-png')"
			@server-help="emit('server-help')"
		/>
	</div>
</template>

<style scoped lang="scss">
.studio-editor {
	display: flex;
	min-height: 0;
	flex: 1;
	flex-direction: column;
	gap: 12px;
}

.studio-workspace {
	display: grid;
	min-height: 260px;
	flex: 1;
	grid-template-columns: 216px 48px minmax(360px, 1fr) 258px;
	grid-template-rows: minmax(0, 1fr);
	overflow: hidden;
	border: 1px solid var(--eden-border);
	border-radius: 14px;
	background: var(--eden-surface);
}

.studio-center {
	display: flex;
	min-width: 0;
	min-height: 0;
	flex-direction: column;
	background: var(--eden-canvas);
}

.studio-center__bar {
	display: flex;
	height: 48px;
	flex: 0 0 auto;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 8px 13px;
	border-bottom: 1px solid var(--eden-border);
	color: var(--eden-text-secondary);
	font-size: 11px;
}

.studio-center__name {
	overflow: hidden;
	color: var(--eden-text);
	text-overflow: ellipsis;
	white-space: nowrap;
}

.studio-center__dirty {
	margin-left: 6px;
	color: var(--eden-success);
}

.studio-segmented {
	display: flex;
	padding: 3px;
	border: 1px solid var(--eden-border);
	border-radius: 8px;
	background: var(--eden-surface);

	button {
		min-height: 26px;
		padding: 3px 10px;
		border: 0;
		border-radius: 5px;
		color: var(--eden-text-secondary);
		background: transparent;
		font-size: 11px;
		cursor: pointer;

		&.active {
			color: var(--eden-text);
			background: var(--eden-surface-raised);
		}

		&:focus-visible {
			outline: 2px solid var(--eden-accent);
		}
	}
}

.studio-canvases {
	display: grid;
	min-height: 0;
	flex: 1;
	grid-template-columns: 1fr;

	&--split {
		grid-template-columns: 1.1fr 0.9fr;
	}

	&--empty {
		place-items: center;
	}
}

.studio-viewport {
	position: relative;
	min-width: 0;
	min-height: 0;
	overflow: hidden;
	background: radial-gradient(ellipse at 50% 45%, rgba(53, 46, 73, 0.22), transparent 70%);

	& + & {
		border-left: 1px solid var(--eden-border);
	}
}

.studio-viewport__label {
	position: absolute;
	z-index: 1;
	top: 14px;
	left: 14px;
	color: var(--eden-text-secondary);
	font-size: 10px;
	letter-spacing: 1px;
	text-transform: uppercase;
	pointer-events: none;

	&--bottom {
		top: auto;
		bottom: 16px;
		letter-spacing: 0;
		text-transform: none;
	}
}

.studio-center__new {
	min-height: 44px;
	padding: 10px 20px;
	border: 1px dashed var(--eden-border);
	border-radius: 12px;
	color: var(--eden-accent);
	background: transparent;
	font-size: 14px;
	cursor: pointer;
}

.studio-center__status {
	display: flex;
	height: 32px;
	flex: 0 0 auto;
	align-items: center;
	justify-content: space-between;
	padding: 6px 13px;
	border-top: 1px solid var(--eden-border);
	color: var(--eden-text-secondary);
	font-size: 10px;
}

@media (max-width: 1250px) {
	.studio-workspace {
		grid-template-columns: 184px 46px minmax(320px, 1fr) 232px;
	}

	.studio-canvases--split {
		grid-template-columns: 1fr 1fr;
	}
}
</style>
