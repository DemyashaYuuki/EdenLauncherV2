<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { hsvToRgb, parseHex, rgbToHsv, toHex } from '@/skin-studio/engine/color'
import type { Rgba } from '@/skin-studio/engine/image'
import { useStudioText } from '@/skin-studio/i18n'

const props = defineProps<{ modelValue: Rgba }>()
const emit = defineEmits<{ (event: 'update:modelValue', value: Rgba): void }>()
const t = useStudioText()

const hsv = ref(rgbToHsv(props.modelValue[0], props.modelValue[1], props.modelValue[2]))
const hexText = ref(toHex(props.modelValue))

watch(
	() => props.modelValue,
	(value) => {
		const current = hsvToRgb(hsv.value.h, hsv.value.s, hsv.value.v)
		if (current[0] !== value[0] || current[1] !== value[1] || current[2] !== value[2]) {
			const next = rgbToHsv(value[0], value[1], value[2])
			hsv.value = { h: next.s === 0 ? hsv.value.h : next.h, s: next.s, v: next.v }
		}
		hexText.value = toHex(value)
	},
)

function emitHsv(alpha = props.modelValue[3]): void {
	const [r, g, b] = hsvToRgb(hsv.value.h, hsv.value.s, hsv.value.v)
	emit('update:modelValue', [r, g, b, alpha])
}

const planeColor = computed(() => {
	const [r, g, b] = hsvToRgb(hsv.value.h, 1, 1)
	return `rgb(${r}, ${g}, ${b})`
})

const solid = computed(
	() => `rgb(${props.modelValue[0]}, ${props.modelValue[1]}, ${props.modelValue[2]})`,
)

function track(event: PointerEvent, update: (fx: number, fy: number) => void): void {
	const target = event.currentTarget as HTMLElement
	const rect = target.getBoundingClientRect()
	target.setPointerCapture(event.pointerId)
	const apply = (e: PointerEvent) => {
		update(
			Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
			Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
		)
	}
	apply(event)
	const move = (e: PointerEvent) => apply(e)
	const up = () => {
		target.removeEventListener('pointermove', move)
		target.removeEventListener('pointerup', up)
		target.removeEventListener('pointercancel', up)
	}
	target.addEventListener('pointermove', move)
	target.addEventListener('pointerup', up)
	target.addEventListener('pointercancel', up)
}

function onPlane(event: PointerEvent): void {
	track(event, (fx, fy) => {
		hsv.value = { ...hsv.value, s: fx, v: 1 - fy }
		emitHsv()
	})
}

function onHue(event: PointerEvent): void {
	track(event, (fx) => {
		hsv.value = { ...hsv.value, h: fx * 359.9 }
		emitHsv()
	})
}

function onAlpha(event: PointerEvent): void {
	track(event, (fx) => emitHsv(Math.round(fx * 255)))
}

function planeKey(event: KeyboardEvent): void {
	const step = event.shiftKey ? 0.1 : 0.02
	let { s, v } = hsv.value
	if (event.key === 'ArrowLeft') s -= step
	else if (event.key === 'ArrowRight') s += step
	else if (event.key === 'ArrowUp') v += step
	else if (event.key === 'ArrowDown') v -= step
	else return
	event.preventDefault()
	hsv.value = { ...hsv.value, s: Math.min(1, Math.max(0, s)), v: Math.min(1, Math.max(0, v)) }
	emitHsv()
}

function sliderKey(event: KeyboardEvent, kind: 'hue' | 'alpha'): void {
	const dir =
		event.key === 'ArrowRight' || event.key === 'ArrowUp'
			? 1
			: event.key === 'ArrowLeft' || event.key === 'ArrowDown'
				? -1
				: 0
	if (!dir) return
	event.preventDefault()
	if (kind === 'hue') {
		hsv.value = { ...hsv.value, h: (hsv.value.h + dir * (event.shiftKey ? 15 : 2) + 360) % 360 }
		emitHsv()
	} else {
		emitHsv(Math.min(255, Math.max(0, props.modelValue[3] + dir * (event.shiftKey ? 16 : 1))))
	}
}

function commitHex(): void {
	const parsed = parseHex(hexText.value)
	if (parsed) emit('update:modelValue', parsed)
	else hexText.value = toHex(props.modelValue)
}

function setChannel(index: number, value: string): void {
	const n = Math.min(255, Math.max(0, Math.round(Number(value))))
	if (!Number.isFinite(n)) return
	const next = [...props.modelValue] as Rgba
	next[index] = n
	emit('update:modelValue', next)
}
</script>

<template>
	<div class="studio-color">
		<div
			class="studio-color__plane"
			role="slider"
			tabindex="0"
			:aria-label="t('inspector.saturationValue')"
			:aria-valuetext="`${Math.round(hsv.s * 100)}%, ${Math.round(hsv.v * 100)}%`"
			:style="{ '--plane': planeColor }"
			@pointerdown="onPlane"
			@keydown="planeKey"
		>
			<span
				class="studio-color__knob"
				:style="{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: solid }"
			/>
		</div>
		<div
			class="studio-color__hue"
			role="slider"
			tabindex="0"
			:aria-label="t('inspector.hue')"
			aria-valuemin="0"
			aria-valuemax="360"
			:aria-valuenow="Math.round(hsv.h)"
			@pointerdown="onHue"
			@keydown="(e) => sliderKey(e, 'hue')"
		>
			<span class="studio-color__thumb" :style="{ left: `${(hsv.h / 360) * 100}%` }" />
		</div>
		<div
			class="studio-color__alpha"
			role="slider"
			tabindex="0"
			:aria-label="t('inspector.alpha')"
			aria-valuemin="0"
			aria-valuemax="255"
			:aria-valuenow="modelValue[3]"
			:style="{ '--solid': solid }"
			@pointerdown="onAlpha"
			@keydown="(e) => sliderKey(e, 'alpha')"
		>
			<span class="studio-color__thumb" :style="{ left: `${(modelValue[3] / 255) * 100}%` }" />
		</div>
		<label class="studio-color__hex">
			<span
				class="studio-color__swatch"
				:style="{
					background: `rgba(${modelValue[0]}, ${modelValue[1]}, ${modelValue[2]}, ${modelValue[3] / 255})`,
				}"
			/>
			<span class="sr-only">HEX</span>
			<input
				v-model="hexText"
				type="text"
				spellcheck="false"
				maxlength="9"
				@change="commitHex"
				@keydown.enter="commitHex"
			/>
		</label>
		<div class="studio-color__rgba">
			<label v-for="(channel, index) in ['R', 'G', 'B', 'A']" :key="channel">
				<span>{{ channel }}</span>
				<input
					type="number"
					min="0"
					max="255"
					:value="modelValue[index]"
					@change="setChannel(index, ($event.target as HTMLInputElement).value)"
				/>
			</label>
		</div>
	</div>
</template>

<style scoped lang="scss">
.studio-color {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.studio-color__plane {
	position: relative;
	height: 132px;
	border-radius: 9px;
	background: linear-gradient(0deg, #000, transparent), linear-gradient(90deg, #fff, var(--plane));
	cursor: crosshair;
	touch-action: none;

	&:focus-visible {
		outline: 2px solid var(--eden-accent);
		outline-offset: 2px;
	}
}

.studio-color__knob {
	position: absolute;
	width: 14px;
	height: 14px;
	border: 2px solid #fff;
	border-radius: 50%;
	box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6);
	transform: translate(-50%, -50%);
	pointer-events: none;
}

.studio-color__hue,
.studio-color__alpha {
	position: relative;
	height: 10px;
	border-radius: 8px;
	cursor: pointer;
	touch-action: none;

	&:focus-visible {
		outline: 2px solid var(--eden-accent);
		outline-offset: 3px;
	}
}

.studio-color__hue {
	background: linear-gradient(90deg, red, #ff0, #0f0, #0ff, #00f, #f0f, red);
}

.studio-color__alpha {
	background:
		linear-gradient(90deg, transparent, var(--solid)),
		repeating-conic-gradient(#3a3446 0 25%, #5a5368 0 50%) 0 0 / 8px 8px;
}

.studio-color__thumb {
	position: absolute;
	top: 50%;
	width: 12px;
	height: 14px;
	border: 2px solid #fff;
	border-radius: 4px;
	box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6);
	transform: translate(-50%, -50%);
	pointer-events: none;
}

.studio-color__hex {
	display: flex;
	align-items: center;
	gap: 8px;

	input {
		flex: 1;
		min-width: 0;
		min-height: 30px;
		padding: 4px 8px;
		border: 1px solid var(--eden-border);
		border-radius: 7px;
		color: var(--eden-text);
		background: var(--eden-canvas);
		font:
			12px ui-monospace,
			monospace;
	}
}

.studio-color__swatch {
	width: 30px;
	height: 30px;
	border: 2px solid rgba(255, 255, 255, 0.3);
	border-radius: 7px;
}

.studio-color__rgba {
	display: grid;
	grid-template-columns: repeat(4, 1fr);
	gap: 5px;

	label {
		display: flex;
		flex-direction: column;
		gap: 3px;
		color: var(--eden-text-secondary);
		font-size: 10px;
		text-align: center;
	}

	input {
		width: 100%;
		min-height: 28px;
		padding: 3px 2px;
		border: 1px solid var(--eden-border);
		border-radius: 6px;
		color: var(--eden-text);
		background: var(--eden-canvas);
		font-size: 11px;
		text-align: center;
		-moz-appearance: textfield;

		&::-webkit-inner-spin-button {
			display: none;
		}
	}
}
</style>
