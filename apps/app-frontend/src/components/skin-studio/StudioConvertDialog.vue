<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import StudioDialog from '@/components/skin-studio/StudioDialog.vue'
import StudioThumb from '@/components/skin-studio/StudioThumb.vue'
import {
	convertArmWidth,
	convertLegacyToModern,
	convertModernToLegacy,
	cropOrExtend,
	matchesModelAspect,
	resizeNearest,
	type RgbaImage,
} from '@/skin-studio/engine/image'
import { builtinModel, type ModelDefinition } from '@/skin-studio/engine/model'
import { type StudioKey, useStudioText } from '@/skin-studio/i18n'
import { useSkinStudio } from '@/skin-studio/store'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ (event: 'close'): void }>()
const studio = useSkinStudio()
const t = useStudioText()

type Operation = 'legacyToModern' | 'modernToLegacy' | 'classicToSlim' | 'slimToClassic' | 'scale' | 'crop'

const operation = ref<Operation | null>(null)
const factor = ref(1)

const doc = computed(() => {
	void studio.revision
	return studio.active
})

const available = computed<Operation[]>(() => {
	const d = doc.value
	if (!d) return []
	const ops: Operation[] = []
	const square = d.image.width === d.image.height
	if (d.image.width === d.image.height * 2) ops.push('legacyToModern')
	if (square && d.model.category === 'player') {
		ops.push('modernToLegacy')
		ops.push(d.model.playerVariant === 'slim' ? 'slimToClassic' : 'classicToSlim')
	}
	ops.push('scale', 'crop')
	return ops
})

watch(
	() => available.value,
	(ops) => {
		if (!operation.value || !ops.includes(operation.value)) operation.value = ops[0] ?? null
	},
	{ immediate: true },
)

const factors = computed(() => {
	const d = doc.value
	if (!d) return []
	const out: number[] = []
	for (const f of [0.25, 0.5, 1, 2, 4, 8, 16]) {
		const w = d.model.textureWidth * f * (d.image.width / d.model.textureWidth)
		const h = d.model.textureHeight * f * (d.image.height / d.model.textureHeight)
		if (w >= d.model.textureWidth && w <= 4096 && h <= 4096 && Number.isInteger(w) && Number.isInteger(h)) out.push(f)
	}
	return out
})

const mismatch = computed(() => {
	const d = doc.value
	return d ? !matchesModelAspect(d.image.width, d.image.height, d.model.textureWidth, d.model.textureHeight) : false
})

function compute(): { image: RgbaImage; model: ModelDefinition } | null {
	const d = doc.value
	const op = operation.value
	if (!d || !op) return null
	switch (op) {
		case 'legacyToModern':
			return { image: convertLegacyToModern(d.image), model: builtinModel('player-classic') as ModelDefinition }
		case 'modernToLegacy':
			return { image: convertModernToLegacy(d.image), model: builtinModel('player-legacy') as ModelDefinition }
		case 'classicToSlim':
			return { image: convertArmWidth(d.image, 4, 3), model: builtinModel('player-slim') as ModelDefinition }
		case 'slimToClassic':
			return { image: convertArmWidth(d.image, 3, 4), model: builtinModel('player-classic') as ModelDefinition }
		case 'scale': {
			const w = Math.round(d.image.width * factor.value)
			const h = Math.round(d.image.height * factor.value)
			return { image: resizeNearest(d.image, w, h), model: d.model }
		}
		case 'crop': {
			const s = Math.max(1, Math.round((d.image.width / d.model.textureWidth) * factor.value))
			return { image: cropOrExtend(d.image, d.model.textureWidth * s, d.model.textureHeight * s), model: d.model }
		}
	}
}

const preview = computed(() => {
	void factor.value
	void operation.value
	try {
		return compute()
	} catch {
		return null
	}
})

function apply(): void {
	const result = compute()
	if (!result || !operation.value) return
	studio.replace(t(`convert.${operation.value}` as StudioKey), result.image, result.model)
	emit('close')
}
</script>

<template>
	<StudioDialog :open="open" :title="t('convert.title')" width="620px" @close="emit('close')">
		<p v-if="mismatch" class="studio-note studio-note--error">{{ t('convert.mismatch') }}</p>
		<div class="studio-choice-grid" role="radiogroup">
			<button
				v-for="op in available"
				:key="op"
				type="button"
				role="radio"
				class="studio-choice"
				:aria-checked="operation === op"
				@click="operation = op"
			>
				{{ t(`convert.${op}` as StudioKey) }}
			</button>
		</div>
		<label v-if="operation === 'scale' || operation === 'crop'" class="studio-form-row">
			{{ t('convert.resize') }}
			<select v-model.number="factor" class="studio-select">
				<option v-for="f in factors" :key="f" :value="f">
					×{{ f }} → {{ Math.round((doc?.image.width ?? 0) * f) }} × {{ Math.round((doc?.image.height ?? 0) * f) }}
				</option>
			</select>
		</label>
		<div class="studio-convert__preview">
			<figure>
				<StudioThumb :image="doc?.image ?? null" :version="studio.revision" />
				<figcaption>{{ doc?.image.width }} × {{ doc?.image.height }}</figcaption>
			</figure>
			<span aria-hidden="true">→</span>
			<figure>
				<StudioThumb :image="preview?.image ?? null" />
				<figcaption>{{ t('convert.preview') }}: {{ preview?.image.width }} × {{ preview?.image.height }}</figcaption>
			</figure>
		</div>
		<p v-if="operation === 'modernToLegacy'" class="studio-note studio-note--error">{{ t('convert.lossy') }}</p>
		<p class="studio-note">{{ t('convert.note') }}</p>
		<template #actions>
			<button type="button" class="studio-btn" @click="emit('close')">{{ t('action.cancel') }}</button>
			<button type="button" class="studio-btn studio-btn--primary" :disabled="!preview" @click="apply">{{ t('convert.apply') }}</button>
		</template>
	</StudioDialog>
</template>

<style scoped lang="scss">
.studio-convert__preview {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 18px;
	color: var(--eden-text-secondary);

	figure {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		margin: 0;
	}

	figure > :first-child {
		width: 160px;
		height: 160px;
		padding: 8px;
		border-radius: 9px;
		background: var(--eden-canvas);
	}

	figcaption {
		font-size: 11px;
	}
}
</style>
