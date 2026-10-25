<script setup lang="ts">
import { getCurrentWindow } from '@tauri-apps/api/window'
import { onBeforeUnmount, onMounted, ref } from 'vue'

import { useStudioText } from '@/skin-studio/i18n'
import { useSkinStudio } from '@/skin-studio/store'

import StudioDialog from './StudioDialog.vue'

const studio = useSkinStudio()
const t = useStudioText()
const open = ref(false)
const saving = ref(false)
const error = ref('')
let allowClose = false
let unlisten: (() => void) | undefined
let disposed = false

onMounted(async () => {
	const stop = await getCurrentWindow().onCloseRequested((event) => {
		if (allowClose || studio.dirtyDocuments.length === 0) return
		event.preventDefault()
		open.value = true
	})
	if (disposed) stop()
	else unlisten = stop
})
onBeforeUnmount(() => {
	disposed = true
	unlisten?.()
})

async function finish(save: boolean): Promise<void> {
	if (saving.value) return
	saving.value = true
	error.value = ''
	try {
		if (save) {
			await studio.saveAll()
			if (studio.dirtyDocuments.length) throw new Error(t('footer.unsaved'))
		} else {
			for (const doc of [...studio.dirtyDocuments]) studio.closeDocument(doc.id)
		}
		allowClose = true
		await getCurrentWindow().close()
	} catch (reason) {
		allowClose = false
		error.value = String(reason)
	} finally {
		saving.value = false
	}
}
</script>

<template>
	<StudioDialog :open="open" :title="t('unsaved.title')" :closable="!saving" @close="open = false">
		<p>
			{{ t('unsaved.body', { name: studio.dirtyDocuments.map((doc) => doc.name).join(', ') }) }}
		</p>
		<p v-if="error" role="alert">{{ error }}</p>
		<template #actions>
			<button type="button" :disabled="saving" @click="open = false">
				{{ t('action.cancel') }}
			</button>
			<button type="button" :disabled="saving" @click="finish(false)">
				{{ t('action.discard') }}
			</button>
			<button type="button" :disabled="saving" @click="finish(true)">
				{{ t('unsaved.save') }}
			</button>
		</template>
	</StudioDialog>
</template>

<style scoped>
button {
	min-height: 36px;
	padding: 7px 13px;
	border: 1px solid var(--eden-border);
	border-radius: 9px;
	color: var(--eden-text);
	background: var(--eden-surface-raised);
	font: inherit;
	cursor: pointer;
}
button:focus-visible {
	outline: 2px solid var(--eden-accent);
	outline-offset: 2px;
}
button:last-child {
	color: var(--eden-on-accent);
	background: var(--eden-accent);
}
button:disabled {
	opacity: 0.5;
	cursor: wait;
}
</style>
