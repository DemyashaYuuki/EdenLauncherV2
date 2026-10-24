<script setup lang="ts">
import { computed, ref } from 'vue'

import StudioDialog from '@/components/skin-studio/StudioDialog.vue'
import StudioIcon from '@/components/skin-studio/StudioIcon.vue'
import { toProject } from '@/skin-studio/engine/document'
import { isRemoteSkinSize } from '@/skin-studio/engine/image'
import { encodePng } from '@/skin-studio/engine/png'
import { PROJECT_EXTENSION, safeFileStem, serializeProject } from '@/skin-studio/engine/project'
import { blobBytes, copyPngToClipboard, saveBytes } from '@/skin-studio/files'
import { useStudioText } from '@/skin-studio/i18n'
import { useSkinStudio } from '@/skin-studio/store'

const props = defineProps<{
	open: boolean
	screenshot: (w: number, h: number, transparent: boolean) => Promise<Blob | null> | null
}>()
const emit = defineEmits<{ (event: 'close'): void; (event: 'notify', kind: 'error' | 'info', text: string): void }>()
const studio = useSkinStudio()
const t = useStudioText()

const kind = ref<'png' | 'project' | 'screenshot'>('png')
const transparent = ref(true)
const resolution = ref(1024)
const busy = ref(false)

const doc = computed(() => {
	void studio.revision
	return studio.active
})
const stem = computed(() => safeFileStem(doc.value?.name ?? 'skin'))
const remoteNote = computed(() => {
	const d = doc.value
	return d ? !isRemoteSkinSize(d.image.width, d.image.height) : false
})

async function exportFile(): Promise<void> {
	const d = doc.value
	if (!d) return
	busy.value = true
	try {
		let saved = false
		if (kind.value === 'png') {
			saved = await saveBytes(`${stem.value}.png`, [{ name: 'PNG', extensions: ['png'] }], await encodePng(d.image))
		} else if (kind.value === 'project') {
			saved = await saveBytes(
				`${stem.value}.${PROJECT_EXTENSION}`,
				[{ name: 'Eden Skin', extensions: [PROJECT_EXTENSION] }],
				await serializeProject(toProject(d)),
			)
		} else {
			const blob = await props.screenshot(resolution.value, resolution.value, transparent.value)
			if (!blob) throw new Error(t('canvas.webglError'))
			saved = await saveBytes(`${stem.value}-render.png`, [{ name: 'PNG', extensions: ['png'] }], await blobBytes(blob))
		}
		if (saved) {
			emit('notify', 'info', t('export.saved'))
			emit('close')
		}
	} catch (error) {
		emit('notify', 'error', t('export.failed', { message: (error as Error).message }))
	} finally {
		busy.value = false
	}
}

async function copyScreenshot(): Promise<void> {
	busy.value = true
	try {
		const blob = await props.screenshot(resolution.value, resolution.value, transparent.value)
		if (!blob) throw new Error(t('canvas.webglError'))
		await copyPngToClipboard(blob)
		emit('notify', 'info', t('export.copied'))
	} catch (error) {
		emit('notify', 'error', t('export.failed', { message: (error as Error).message }))
	} finally {
		busy.value = false
	}
}

</script>

<template>
	<StudioDialog :open="open" :title="t('export.title')" @close="emit('close')">
		<div class="studio-choice-grid" role="radiogroup">
			<button type="button" role="radio" class="studio-choice" :aria-checked="kind === 'png'" @click="kind = 'png'">
				<StudioIcon name="texture" /> {{ t('export.png') }}
				<small>{{ t('export.pngHint') }}</small>
			</button>
			<button type="button" role="radio" class="studio-choice" :aria-checked="kind === 'project'" @click="kind = 'project'">
				<StudioIcon name="save" /> {{ t('export.project') }}
				<small>{{ t('export.projectHint') }}</small>
			</button>
			<button type="button" role="radio" class="studio-choice" :aria-checked="kind === 'screenshot'" @click="kind = 'screenshot'">
				<StudioIcon name="camera" /> {{ t('export.screenshot') }}
				<small>{{ t('export.screenshotHint') }}</small>
			</button>
		</div>
		<template v-if="kind === 'screenshot'">
			<label class="studio-form-row">
				{{ t('export.resolution') }}
				<select v-model.number="resolution" class="studio-select">
					<option v-for="r in [512, 1024, 2048]" :key="r" :value="r">{{ r }} × {{ r }}</option>
				</select>
			</label>
			<label class="studio-export__check">
				<input v-model="transparent" type="checkbox" />
				{{ t('export.transparent') }}
			</label>
		</template>
		<p v-if="remoteNote" class="studio-note">{{ t('export.remoteNote') }}</p>
		<template #actions>
			<button v-if="kind === 'screenshot'" type="button" class="studio-btn" :disabled="busy" @click="copyScreenshot">
				{{ t('export.toClipboard') }}
			</button>
			<button type="button" class="studio-btn studio-btn--primary" :disabled="busy || !doc" @click="exportFile">
				{{ t('export.toFile') }}
			</button>
		</template>
	</StudioDialog>
</template>

<style scoped lang="scss">
.studio-export__check {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 13px;

	input {
		accent-color: var(--eden-accent);
	}
}
</style>
