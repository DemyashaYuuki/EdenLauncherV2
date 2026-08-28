<script setup lang="ts">
import { fetch } from '@tauri-apps/plugin-http'
import { ref, watch } from 'vue'

import steveSkin from '@/assets/skins/steve.png'

const props = defineProps<{ name: string; uuid?: string }>()

const imageUrl = ref('')
const source = ref<'official' | 'ely' | 'steve'>('steve')
let lookupId = 0

function elyHeadUrl() {
	return `https://skinsystem.ely.by/skins/${encodeURIComponent(props.name)}.png`
}

async function resolveHead() {
	const currentLookup = ++lookupId
	imageUrl.value = ''
	source.value = 'steve'

	try {
		const response = await fetch(
			`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(props.name)}`,
		)
		if (!response.ok) throw new Error(`Mojang profile: HTTP ${response.status}`)
		const profile = (await response.json()) as { id?: string }
		if (!profile.id) throw new Error('Mojang profile does not contain a UUID')
		if (currentLookup !== lookupId) return
		source.value = 'official'
		imageUrl.value = `https://mc-heads.net/avatar/${encodeURIComponent(profile.id)}/64`
	} catch {
		if (currentLookup !== lookupId) return
		source.value = 'ely'
		imageUrl.value = elyHeadUrl()
	}
}

function useFallback() {
	if (source.value === 'official') {
		source.value = 'ely'
		imageUrl.value = elyHeadUrl()
		return
	}
	source.value = 'steve'
	imageUrl.value = ''
}

watch(() => [props.name, props.uuid], resolveHead, { immediate: true })
</script>

<template>
	<span class="player-head" :title="`${name}: ${source}`">
		<img
			v-if="imageUrl && source === 'official'"
			class="player-head__remote"
			:src="imageUrl"
			alt=""
			@error="useFallback"
		/>
		<template v-else>
			<img
				class="player-head__skin player-head__skin--face"
				:src="imageUrl || steveSkin"
				alt=""
				@error="useFallback"
			/>
			<img
				class="player-head__skin player-head__skin--hat"
				:src="imageUrl || steveSkin"
				alt=""
				@error="useFallback"
			/>
		</template>
	</span>
</template>

<style scoped>
.player-head {
	position: relative;
	display: block;
	flex: 0 0 auto;
	overflow: hidden;
	background: #6b8e56;
	image-rendering: pixelated;
}

.player-head__remote {
	display: block;
	width: 100%;
	height: 100%;
	object-fit: cover;
	image-rendering: pixelated;
}

.player-head__skin {
	position: absolute;
	width: 800%;
	height: 800%;
	max-width: none;
	image-rendering: pixelated;
}

.player-head__skin--face {
	top: -100%;
	left: -100%;
}

.player-head__skin--hat {
	top: -100%;
	left: -500%;
}
</style>
