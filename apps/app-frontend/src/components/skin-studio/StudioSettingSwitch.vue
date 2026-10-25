<script setup lang="ts">
import { useId } from 'vue'

import { useStudioText } from '@/skin-studio/i18n'

const props = defineProps<{ modelValue: boolean; label: string; hint: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const hintId = useId()
const t = useStudioText()
</script>

<template>
	<button
		type="button"
		role="switch"
		class="studio-setting-switch"
		:class="{ 'studio-setting-switch--on': modelValue }"
		:aria-label="label"
		:aria-describedby="hintId"
		:aria-checked="modelValue"
		@click="emit('update:modelValue', !props.modelValue)"
	>
		<span class="studio-setting-switch__copy">
			<strong>{{ label }}</strong>
			<span :id="hintId">{{ hint }}</span>
		</span>
		<span class="studio-setting-switch__state" aria-hidden="true">
			<span class="studio-setting-switch__track"></span>
			<span>{{ t(modelValue ? 'settings.enabled' : 'settings.disabled') }}</span>
		</span>
	</button>
</template>

<style scoped lang="scss">
.studio-setting-switch {
	display: flex;
	width: 100%;
	min-height: 82px;
	align-items: center;
	justify-content: space-between;
	gap: 16px;
	padding: 14px;
	border: 1px solid var(--eden-border);
	border-radius: 12px;
	color: var(--eden-text);
	background: var(--eden-canvas);
	font: inherit;
	text-align: left;
	cursor: pointer;

	&:hover {
		border-color: var(--eden-accent);
	}

	&:focus-visible {
		outline: 2px solid var(--eden-accent);
		outline-offset: 3px;
	}
}

.studio-setting-switch__copy {
	display: flex;
	min-width: 0;
	flex-direction: column;
	gap: 5px;

	strong {
		font-size: 13px;
		font-weight: 650;
	}

	> span {
		color: var(--eden-text-secondary);
		font-size: 12px;
		line-height: 1.4;
	}
}

.studio-setting-switch__state {
	display: flex;
	min-width: 76px;
	flex: 0 0 auto;
	flex-direction: column;
	align-items: center;
	gap: 6px;
	color: var(--eden-text-secondary);
	font-size: 11px;
}

.studio-setting-switch__track {
	position: relative;
	width: 38px;
	height: 22px;
	border: 1px solid var(--eden-border);
	border-radius: 20px;
	background: var(--eden-surface-raised);

	&::after {
		content: '';
		position: absolute;
		top: 3px;
		left: 3px;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--eden-text-secondary);
		transition: transform 140ms ease;
	}
}

.studio-setting-switch--on .studio-setting-switch__track {
	border-color: var(--eden-accent);
	background: var(--eden-accent);

	&::after {
		background: var(--eden-on-accent, #100d19);
		transform: translateX(16px);
	}
}

@media (prefers-reduced-motion: reduce) {
	.studio-setting-switch__track::after {
		transition: none;
	}
}
</style>
