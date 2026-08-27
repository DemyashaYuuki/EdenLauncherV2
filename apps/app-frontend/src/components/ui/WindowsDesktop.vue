<script setup lang="ts">
import {
	CompassIcon,
	LibraryIcon,
	PlusIcon,
	ServerIcon,
	SettingsIcon,
	ShirtIcon,
} from '@modrinth/assets'
import { convertFileSrc } from '@tauri-apps/api/core'

import edenLogo from '@/assets/edenworld-logo.jpg'
import type { GameInstance } from '@/helpers/types'

defineProps<{ instances: GameInstance[] }>()
const emit = defineEmits<{
	navigate: [path: string]
	create: []
	servers: []
	settings: []
}>()

function instanceIcon(path: string) {
	return path.startsWith('http') || path.startsWith('data:') ? path : convertFileSrc(path)
}
</script>

<template>
	<div class="windows-desktop">
		<div class="desktop-shortcuts">
			<button @dblclick="emit('navigate', '/')">
				<img :src="edenLogo" alt="" /><span>EdenWorld</span>
			</button>
			<button @dblclick="emit('navigate', '/browse/modpack')">
				<CompassIcon /><span>Каталог</span>
			</button>
			<button @dblclick="emit('navigate', '/library')">
				<LibraryIcon /><span>Библиотека</span>
			</button>
			<button @dblclick="emit('navigate', '/skins')"><ShirtIcon /><span>Скины</span></button>
			<button @dblclick="emit('servers')"><ServerIcon /><span>Серверы</span></button>
			<button @dblclick="emit('create')"><PlusIcon /><span>Создать</span></button>
			<button @dblclick="emit('settings')"><SettingsIcon /><span>Параметры</span></button>
			<button
				v-for="instance in instances.slice(0, 12)"
				:key="instance.id"
				@dblclick="emit('navigate', `/instance/${instance.id}`)"
			>
				<img v-if="instance.icon_path" :src="instanceIcon(instance.icon_path)" alt="" />
				<LibraryIcon v-else />
				<span>{{ instance.name }}</span>
			</button>
		</div>
		<div class="desktop-watermark">
			<strong>EdenLauncher</strong><span>Windows 10 Edition</span>
		</div>
	</div>
</template>

<style scoped lang="scss">
.windows-desktop {
	position: absolute;
	inset: 0;
	overflow: auto;
	padding: 1rem;
	color: #fff;
	text-shadow: 0 1px 3px #000;
	user-select: none;
}
.desktop-shortcuts {
	display: grid;
	width: max-content;
	grid-auto-flow: column;
	grid-template-rows: repeat(6, 6.2rem);
	gap: 0.35rem;
}
.desktop-shortcuts button {
	display: flex;
	width: 6.2rem;
	height: 6.2rem;
	flex-direction: column;
	align-items: center;
	gap: 0.25rem;
	padding: 0.35rem;
	border: 1px solid transparent;
	color: #fff;
	background: transparent;
	font:
		12px 'Segoe UI',
		sans-serif;
	text-shadow: 0 1px 3px #000;
	cursor: default;
}
.desktop-shortcuts button:hover {
	border-color: rgba(255, 255, 255, 0.38);
	background: rgba(25, 125, 220, 0.25);
}
.desktop-shortcuts img,
.desktop-shortcuts svg {
	width: 2.8rem;
	height: 2.8rem;
	border-radius: 0.2rem;
	object-fit: cover;
	filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.4));
}
.desktop-shortcuts span {
	display: -webkit-box;
	overflow: hidden;
	text-align: center;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
}
.desktop-watermark {
	position: fixed;
	right: 1.5rem;
	bottom: 4.2rem;
	display: flex;
	flex-direction: column;
	align-items: flex-end;
	opacity: 0.45;
}
.desktop-watermark strong {
	font-size: 1.35rem;
}
.desktop-watermark span {
	font-size: 0.78rem;
}
</style>
