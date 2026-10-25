<script setup lang="ts">
import { openUrl } from '@tauri-apps/plugin-opener'
import { computed } from 'vue'

import StudioDialog from '@/components/skin-studio/StudioDialog.vue'
import { remoteVariant } from '@/skin-studio/engine/model'
import { SKINSRESTORER_UPLOAD_PAGE } from '@/skin-studio/engine/providers'
import { useStudioText } from '@/skin-studio/i18n'
import { useSkinStudio } from '@/skin-studio/store'

defineProps<{ open: boolean; saving: boolean }>()
const emit = defineEmits<{
	(event: 'close' | 'save'): void
	(event: 'notify', kind: 'error' | 'info', text: string): void
}>()
const studio = useSkinStudio()
const t = useStudioText()
const model = computed(() => {
	void studio.revision
	return studio.active ? remoteVariant(studio.active.model) : null
})
const standardSkin = computed(() => {
	void studio.revision
	const d = studio.active
	return d && model.value && d.image.width === 64 && [32, 64].includes(d.image.height)
})

async function openUpload(): Promise<void> {
	try {
		await openUrl(SKINSRESTORER_UPLOAD_PAGE)
	} catch (error) {
		emit('notify', 'error', t('error.generic', { message: String(error) }))
	}
}
</script>

<template>
	<StudioDialog :open="open" :title="t('manual.guideTitle')" width="660px" @close="emit('close')">
		<p class="studio-note">{{ t('manual.paused') }}</p>
		<p v-if="studio.active && !standardSkin" class="studio-note studio-note--error" role="alert">
			{{ t('manual.unsupported') }}
		</p>
		<ol class="studio-upload__steps">
			<li>{{ t('manual.step1') }}</li>
			<li>{{ t('manual.step2') }}</li>
			<li>
				{{ t('manual.step3') }}
				<strong v-if="standardSkin">{{
					t('manual.model', { model: model === 'slim' ? 'Slim' : 'Classic' })
				}}</strong>
				{{ t('manual.cape') }}
			</li>
			<li>{{ t('manual.step4') }}</li>
			<li>{{ t('manual.step5') }}</li>
		</ol>
		<p>{{ t('manual.permissions') }}</p>
		<p>{{ t('manual.project') }}</p>
		<p class="studio-upload__privacy">{{ t('manual.privacy') }}</p>
		<template #actions>
			<button type="button" class="studio-btn" @click="openUpload">
				{{ t('manual.openSite') }}
			</button>
			<button
				type="button"
				class="studio-btn studio-btn--primary"
				:disabled="saving || !studio.active"
				@click="emit('save')"
			>
				{{ saving ? '…' : t('manual.savePng') }}
			</button>
		</template>
	</StudioDialog>
</template>

<style scoped>
.studio-upload__steps {
	display: flex;
	flex-direction: column;
	gap: 12px;
	margin: 0;
	padding-left: 24px;
	color: var(--eden-text-secondary);
	font-size: 13px;
	line-height: 1.6;
}
.studio-upload__steps strong {
	display: block;
	color: var(--eden-text);
}
.studio-upload__privacy {
	font-size: 11px !important;
}
</style>
