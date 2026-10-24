<script setup lang="ts">
import { computed, ref } from 'vue'

import StudioDialog from '@/components/skin-studio/StudioDialog.vue'
import { type ModelCategory, type ModelDefinition } from '@/skin-studio/engine/model'
import { importTcn, techneToModel } from '@/skin-studio/engine/tcn'
import { pickFiles } from '@/skin-studio/files'
import { type StudioKey, useStudioText } from '@/skin-studio/i18n'

defineProps<{ open: boolean }>()
const emit = defineEmits<{
	(event: 'close'): void
	(event: 'choose', model: ModelDefinition): void
	(event: 'notify', kind: 'error' | 'info', text: string): void
}>()
const t = useStudioText()

const sources = import.meta.glob<string>('@/assets/eden/skin-studio/models/*/*.xml', {
	query: '?raw',
	import: 'default',
})

const CATEGORY_MAP: Record<string, ModelCategory> = {
	Players: 'player',
	Mobs: 'mob',
	Entities: 'entity',
	Blocks: 'block',
	Items: 'item',
}

const entries = computed(() =>
	Object.keys(sources)
		.map((path) => {
			const parts = path.split('/')
			const folder = parts[parts.length - 2]
			return { path, folder, name: parts[parts.length - 1].replace(/\.xml$/, ''), category: CATEGORY_MAP[folder] ?? 'custom' }
		})
		.sort((a, b) => a.folder.localeCompare(b.folder) || a.name.localeCompare(b.name)),
)

const categories = computed(() => [...new Set(entries.value.map((e) => e.category))])
const category = ref<ModelCategory>('mob')
const loading = ref<string | null>(null)

async function choose(entry: { path: string; name: string; category: ModelCategory }): Promise<void> {
	loading.value = entry.path
	try {
		const xml = await sources[entry.path]()
		const { model } = techneToModel(xml, { id: `mcskin3d-${entry.category}-${entry.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, category: entry.category })
		emit('choose', { ...model, name: entry.name })
	} catch (error) {
		emit('notify', 'error', t('error.generic', { message: (error as Error).message }))
	} finally {
		loading.value = null
	}
}

async function importModel(): Promise<void> {
	try {
		const [file] = await pickFiles([{ name: 'Techne', extensions: ['tcn', 'xml'] }], false)
		if (!file) return
		const imported = file.name.toLowerCase().endsWith('.tcn')
			? await importTcn(file.bytes)
			: techneToModel(new TextDecoder().decode(file.bytes))
		if (imported.warnings.length) {
			emit('notify', 'info', t('model.importWarnings', { details: imported.warnings.join(', ') }))
		}
		emit('choose', imported.model)
	} catch (error) {
		emit('notify', 'error', t('error.generic', { message: (error as Error).message }))
	}
}
</script>

<template>
	<StudioDialog :open="open" :title="t('dock.modelLibrary')" width="720px" @close="emit('close')">
		<div class="studio-models">
			<div class="studio-models__tabs" role="tablist">
				<button
					v-for="c in categories"
					:key="c"
					type="button"
					role="tab"
					class="studio-btn studio-btn--small"
					:aria-selected="category === c"
					:class="{ 'studio-btn--primary': category === c }"
					@click="category = c"
				>
					{{ t(`model.category.${c}` as StudioKey) }}
				</button>
			</div>
			<div class="studio-choice-grid">
				<button
					v-for="entry in entries.filter((e) => e.category === category)"
					:key="entry.path"
					type="button"
					class="studio-choice"
					:disabled="loading !== null"
					@click="choose(entry)"
				>
					{{ entry.name }}
					<small>{{ loading === entry.path ? '…' : entry.folder }}</small>
				</button>
			</div>
			<p class="studio-note">{{ t('model.notPlayer') }}</p>
			<p class="studio-models__credit">{{ t('model.attribution') }}</p>
		</div>
		<template #actions>
			<button type="button" class="studio-btn" @click="importModel">{{ t('model.importTcn') }}</button>
			<button type="button" class="studio-btn" @click="emit('close')">{{ t('action.close') }}</button>
		</template>
	</StudioDialog>
</template>

<style scoped lang="scss">
.studio-models {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.studio-models__tabs {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.studio-models__credit {
	font-size: 11px !important;
}
</style>
