<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

import StudioIcon from '@/components/skin-studio/StudioIcon.vue'
import { useStudioText } from '@/skin-studio/i18n'

const props = withDefaults(
	defineProps<{ open: boolean; title: string; eyebrow?: string; width?: string; closable?: boolean }>(),
	{ eyebrow: 'Skin Studio', width: '540px', closable: true },
)
const emit = defineEmits<{ (event: 'close'): void }>()
const t = useStudioText()
const dialog = ref<HTMLDialogElement | null>(null)
const titleId = `studio-dialog-${Math.random().toString(36).slice(2)}`

watch(
	() => props.open,
	async (open) => {
		await nextTick()
		const el = dialog.value
		if (!el) return
		if (open && !el.open) el.showModal()
		else if (!open && el.open) el.close()
	},
	{ immediate: true },
)

function onCancel(event: Event): void {
	event.preventDefault()
	if (props.closable) emit('close')
}

function onBackdrop(event: MouseEvent): void {
	if (event.target === dialog.value && props.closable) emit('close')
}

onBeforeUnmount(() => {
	if (dialog.value?.open) dialog.value.close()
})
</script>

<template>
	<dialog
		ref="dialog"
		class="studio-dialog"
		:style="{ width: `min(${width}, calc(100vw - 48px))` }"
		:aria-labelledby="titleId"
		@cancel="onCancel"
		@mousedown="onBackdrop"
	>
		<div v-if="open" class="studio-dialog__body">
			<header>
				<div>
					<div class="studio-dialog__eyebrow">{{ eyebrow }}</div>
					<h2 :id="titleId">{{ title }}</h2>
				</div>
				<button v-if="closable" type="button" class="studio-dialog__close" :aria-label="t('action.close')" @click="emit('close')">
					<StudioIcon name="close" :size="16" />
				</button>
			</header>
			<slot />
			<footer v-if="$slots.actions" class="studio-dialog__actions">
				<slot name="actions" />
			</footer>
		</div>
	</dialog>
</template>

<style scoped lang="scss">
.studio-dialog {
	max-height: calc(100vh - 48px);
	padding: 0;
	overflow: auto;
	border: 1px solid var(--eden-border);
	border-radius: 18px;
	color: var(--eden-text);
	background: var(--eden-surface);
	box-shadow: 0 30px 150px rgba(0, 0, 0, 0.6);

	&::backdrop {
		background: rgba(5, 3, 9, 0.72);
		backdrop-filter: blur(5px);
	}
}

.studio-dialog__body {
	display: flex;
	flex-direction: column;
	gap: 14px;
	padding: 26px 28px;

	header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
	}

	h2 {
		margin: 8px 0 0;
		font-size: 22px;
		letter-spacing: -0.4px;
	}

	:deep(p) {
		margin: 0;
		color: var(--eden-text-secondary);
		font-size: 13px;
		line-height: 1.6;
	}
}

.studio-dialog__eyebrow {
	color: var(--eden-accent);
	font-size: 10px;
	font-weight: 700;
	letter-spacing: 1.9px;
	text-transform: uppercase;
}

.studio-dialog__close {
	display: grid;
	width: 32px;
	height: 32px;
	place-items: center;
	padding: 0;
	border: 1px solid var(--eden-border);
	border-radius: 9px;
	color: var(--eden-text-secondary);
	background: transparent;
	cursor: pointer;

	&:focus-visible {
		outline: 2px solid var(--eden-accent);
		outline-offset: 2px;
	}
}

.studio-dialog__actions {
	display: flex;
	flex-wrap: wrap;
	justify-content: flex-end;
	gap: 8px;
	margin-top: 8px;
}

@media (prefers-reduced-motion: reduce) {
	.studio-dialog::backdrop {
		backdrop-filter: none;
	}
}
</style>
