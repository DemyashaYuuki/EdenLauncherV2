<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import StudioDialog from '@/components/skin-studio/StudioDialog.vue'
import { BUILTIN_MODELS, type ModelDefinition } from '@/skin-studio/engine/model'
import { useStudioText } from '@/skin-studio/i18n'

export type NewTemplate = 'blank' | 'ranger' | 'operator'

const props = defineProps<{ open: boolean; customModel?: ModelDefinition | null }>()
const emit = defineEmits<{
	(event: 'close' | 'models'): void
	(
		event: 'create',
		options: { name: string; model: ModelDefinition; scale: number; template: NewTemplate },
	): void
}>()
const t = useStudioText()

const name = ref('')
const modelId = ref('player-classic')
const scale = ref(1)
const template = ref<NewTemplate>('blank')

watch(
	() => props.open,
	(open) => {
		if (!open) return
		name.value = t('new.defaultName')
		scale.value = 1
		template.value = 'blank'
		if (props.customModel) modelId.value = props.customModel.id
	},
)

const models = computed(() =>
	props.customModel ? [...BUILTIN_MODELS, props.customModel] : BUILTIN_MODELS,
)
const model = computed(() => models.value.find((m) => m.id === modelId.value) ?? BUILTIN_MODELS[0])
const scales = computed(() => {
	const out: number[] = []
	for (
		let s = 1;
		model.value.textureWidth * s <= 4096 && model.value.textureHeight * s <= 4096;
		s *= 2
	)
		out.push(s)
	return out
})
const templatesAllowed = computed(() => model.value.id === 'player-classic' && scale.value === 1)

watch(templatesAllowed, (allowed) => {
	if (!allowed) template.value = 'blank'
})

function create(): void {
	const clean = name.value.trim() || t('new.defaultName')
	emit('create', {
		name: clean.slice(0, 80),
		model: model.value,
		scale: scale.value,
		template: template.value,
	})
}
</script>

<template>
	<StudioDialog :open="open" :title="t('new.title')" @close="emit('close')">
		<form class="studio-new" @submit.prevent="create">
			<label class="studio-form-row">
				{{ t('new.name') }}
				<input v-model="name" class="studio-input" type="text" maxlength="80" required />
			</label>
			<fieldset class="studio-form-row">
				<legend>{{ t('new.model') }}</legend>
				<div class="studio-choice-grid" role="radiogroup">
					<button
						v-for="m in models"
						:key="m.id"
						type="button"
						role="radio"
						class="studio-choice"
						:aria-checked="modelId === m.id"
						@click="modelId = m.id"
					>
						{{ m.name }}
						<small>{{ m.textureWidth }} × {{ m.textureHeight }}</small>
					</button>
					<button type="button" class="studio-choice" @click="emit('models')">
						{{ t('dock.otherModel') }}
						<small>{{ t('dock.modelLibrary') }}</small>
					</button>
				</div>
			</fieldset>
			<label class="studio-form-row">
				{{ t('new.size') }}
				<select v-model.number="scale" class="studio-select">
					<option v-for="s in scales" :key="s" :value="s">
						{{ model.textureWidth * s }} × {{ model.textureHeight * s }}{{ s > 1 ? ' (HD)' : '' }}
					</option>
				</select>
			</label>
			<fieldset class="studio-form-row">
				<legend>{{ t('new.template') }}</legend>
				<div class="studio-choice-grid" role="radiogroup">
					<button
						type="button"
						role="radio"
						class="studio-choice"
						:aria-checked="template === 'blank'"
						@click="template = 'blank'"
					>
						{{ t('new.template.blank') }}
					</button>
					<button
						type="button"
						role="radio"
						class="studio-choice"
						:aria-checked="template === 'ranger'"
						:disabled="!templatesAllowed"
						@click="template = 'ranger'"
					>
						{{ t('new.template.ranger') }}
					</button>
					<button
						type="button"
						role="radio"
						class="studio-choice"
						:aria-checked="template === 'operator'"
						:disabled="!templatesAllowed"
						@click="template = 'operator'"
					>
						{{ t('new.template.operator') }}
					</button>
				</div>
			</fieldset>
			<p v-if="scale > 1" class="studio-note">{{ t('export.remoteNote') }}</p>
			<div class="studio-new__actions">
				<button type="button" class="studio-btn" @click="emit('close')">
					{{ t('action.cancel') }}
				</button>
				<button type="submit" class="studio-btn studio-btn--primary">{{ t('new.start') }}</button>
			</div>
		</form>
	</StudioDialog>
</template>

<style scoped lang="scss">
.studio-new {
	display: flex;
	flex-direction: column;
	gap: 14px;

	fieldset {
		margin: 0;
		padding: 0;
		border: 0;
	}

	legend {
		margin-bottom: 6px;
	}
}

.studio-new__actions {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
}
</style>
