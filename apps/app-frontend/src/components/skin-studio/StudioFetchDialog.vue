<script setup lang="ts">
import { fetch } from '@tauri-apps/plugin-http'
import { ref, watch } from 'vue'

import StudioDialog from '@/components/skin-studio/StudioDialog.vue'
import {
	LookupError,
	type LookupProvider,
	parseElyTextures,
	parseMojangUuid,
	parseSessionProfile,
	profileLookupUrl,
	sessionProfileUrl,
	type TextureInfo,
	validateNickname,
} from '@/skin-studio/engine/providers'
import { useStudioText } from '@/skin-studio/i18n'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
	(event: 'close'): void
	(event: 'fetched', name: string, bytes: Uint8Array, slim: boolean): void
}>()
const t = useStudioText()

const provider = ref<LookupProvider>('mojang')
const name = ref('')
const busy = ref(false)
const error = ref<string | null>(null)

const MAX_JSON = 64 * 1024
const MAX_PNG = 2 * 1024 * 1024

watch(
	() => props.open,
	(open) => {
		if (open) {
			error.value = null
			busy.value = false
		}
	},
)

async function getJson(url: string): Promise<unknown | null> {
	const response = await fetch(url, { method: 'GET', maxRedirections: 0, connectTimeout: 15_000 })
	if (response.status === 204 || response.status === 404) return null
	if (response.status === 429) throw new LookupError('rate-limited', 'Rate limited')
	if (!response.ok) throw new LookupError('response', `HTTP ${response.status}`)
	const text = await response.text()
	if (text.length > MAX_JSON) throw new LookupError('response', 'Response too large')
	return text ? JSON.parse(text) : null
}

async function getPng(url: string): Promise<Uint8Array> {
	const response = await fetch(url, { method: 'GET', maxRedirections: 0, connectTimeout: 15_000 })
	if (!response.ok) throw new LookupError('response', `HTTP ${response.status}`)
	const bytes = new Uint8Array(await response.arrayBuffer())
	if (bytes.length > MAX_PNG) throw new LookupError('response', 'Texture too large')
	return bytes
}

async function lookup(): Promise<void> {
	error.value = null
	let nickname: string
	try {
		nickname = validateNickname(provider.value, name.value)
	} catch {
		error.value = t('fetch.invalid')
		return
	}
	busy.value = true
	try {
		let info: TextureInfo
		if (provider.value === 'mojang') {
			const profile = await getJson(profileLookupUrl('mojang', nickname))
			if (!profile) throw new LookupError('not-found', 'not found')
			const session = await getJson(sessionProfileUrl(parseMojangUuid(profile)))
			if (!session) throw new LookupError('not-found', 'not found')
			info = parseSessionProfile(session)
		} else {
			const textures = await getJson(profileLookupUrl('ely', nickname))
			if (!textures) throw new LookupError('not-found', 'not found')
			info = parseElyTextures(textures)
		}
		emit('fetched', nickname, await getPng(info.url), info.slim)
	} catch (e) {
		error.value =
			e instanceof LookupError && e.code === 'not-found'
				? t('fetch.notFound')
				: t('fetch.error', { message: (e as Error).message })
	} finally {
		busy.value = false
	}
}
</script>

<template>
	<StudioDialog :open="open" :title="t('fetch.title')" @close="emit('close')">
		<p>{{ t('fetch.body') }}</p>
		<form class="studio-fetch" @submit.prevent="lookup">
			<label class="studio-form-row">
				{{ t('fetch.provider') }}
				<select v-model="provider" class="studio-select">
					<option value="mojang">{{ t('fetch.provider.mojang') }}</option>
					<option value="ely">{{ t('fetch.provider.ely') }}</option>
				</select>
			</label>
			<label class="studio-form-row">
				{{ t('fetch.name') }}
				<input v-model="name" class="studio-input" type="text" maxlength="32" autocomplete="off" spellcheck="false" required />
			</label>
			<p v-if="error" class="studio-note studio-note--error" role="alert">{{ error }}</p>
			<div class="studio-fetch__actions">
				<button type="button" class="studio-btn" @click="emit('close')">{{ t('action.cancel') }}</button>
				<button type="submit" class="studio-btn studio-btn--primary" :disabled="busy">
					<span v-if="busy" class="studio-spinner" aria-hidden="true" />
					{{ t('fetch.go') }}
				</button>
			</div>
		</form>
	</StudioDialog>
</template>

<style scoped lang="scss">
.studio-fetch {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.studio-fetch__actions {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
}
</style>
