<script setup lang="ts">
// Taskbar search for the Windows 10 mode: finds launcher sections and installed instances.
import { computed, ref } from 'vue'

import EdenIcon from '@/components/ui/eden/EdenIcon.vue'
import type { GameInstance } from '@/helpers/types'

const props = defineProps<{ instances: GameInstance[] }>()
const emit = defineEmits<{ open: [path: string] }>()

const query = ref('')
const open = ref(false)
const highlighted = ref(0)

const sections = [
	{ title: 'EdenWorld', hint: 'Главная', path: '/' },
	{ title: 'Библиотека', hint: 'Раздел', path: '/library' },
	{ title: 'Каталог', hint: 'Раздел', path: '/browse/modpack' },
	{ title: 'Скины', hint: 'Раздел', path: '/skins' },
	{ title: 'Друзья', hint: 'Раздел', path: '/friends' },
	{ title: 'Загрузки', hint: 'Раздел', path: '/downloads' },
]

const results = computed(() => {
	const needle = query.value.trim().toLocaleLowerCase()
	if (!needle) return []
	const instanceResults = props.instances.map((instance) => ({
		title: instance.name,
		hint: `Сборка · ${instance.game_version}`,
		path: `/instance/${encodeURIComponent(instance.id)}`,
	}))
	return [...sections, ...instanceResults]
		.filter((item) => item.title.toLocaleLowerCase().includes(needle))
		.slice(0, 7)
})

function choose(path: string) {
	emit('open', path)
	query.value = ''
	open.value = false
}

function onKeydown(event: KeyboardEvent) {
	if (event.key === 'ArrowDown') {
		event.preventDefault()
		highlighted.value = Math.min(results.value.length - 1, highlighted.value + 1)
	} else if (event.key === 'ArrowUp') {
		event.preventDefault()
		highlighted.value = Math.max(0, highlighted.value - 1)
	} else if (event.key === 'Enter') {
		const target = results.value[highlighted.value]
		if (target) choose(target.path)
	} else if (event.key === 'Escape') {
		query.value = ''
		open.value = false
	}
}
</script>

<template>
	<div class="taskbar-search" @focusin="open = true" @focusout="open = false">
		<label class="taskbar-search__field">
			<EdenIcon name="search" :size="18" />
			<input
				v-model="query"
				type="search"
				placeholder="Поиск в EdenLauncher"
				aria-label="Поиск разделов и сборок"
				role="combobox"
				:aria-expanded="open && results.length > 0"
				aria-controls="taskbar-search-results"
				@input="highlighted = 0"
				@keydown="onKeydown"
			/>
		</label>
		<ul
			v-if="open && query.trim()"
			id="taskbar-search-results"
			class="taskbar-search__results"
			role="listbox"
		>
			<li v-if="results.length === 0" class="taskbar-search__empty">Ничего не найдено</li>
			<li
				v-for="(item, index) in results"
				:key="item.path"
				role="option"
				:aria-selected="index === highlighted"
				:class="{ active: index === highlighted }"
				@mousedown.prevent="choose(item.path)"
			>
				<strong>{{ item.title }}</strong>
				<span>{{ item.hint }}</span>
			</li>
		</ul>
	</div>
</template>

<style scoped lang="scss">
.taskbar-search {
	position: relative;
	display: flex;
	order: 1;
	width: clamp(180px, 22vw, 290px);
	align-items: center;
	padding: 6px 8px 6px 4px;
}

.taskbar-search__field {
	display: flex;
	width: 100%;
	height: 36px;
	box-sizing: border-box;
	align-items: center;
	gap: 10px;
	padding: 0 12px;
	color: #aaa8bc;
	background: rgba(255, 255, 255, 0.07);
	cursor: text;

	&:focus-within {
		outline: 2px solid var(--eden-focus);
		outline-offset: -2px;
	}

	input {
		width: 100%;
		min-height: 0;
		padding: 0;
		border: 0;
		outline: none;
		color: #f5f3fa;
		background: transparent;
		box-shadow: none !important;
		font: inherit;
		font-size: 13px;

		&::placeholder {
			color: #aaa8bc;
			opacity: 1;
		}
	}
}

.taskbar-search__results {
	position: absolute;
	bottom: 52px;
	left: 4px;
	width: 320px;
	margin: 0;
	padding: 6px;
	border: 1px solid #32313f;
	color: #f5f3fa;
	background: #111119;
	box-shadow: 0 -10px 30px rgba(0, 0, 0, 0.45);
	list-style: none;

	li {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 8px 10px;
		cursor: pointer;

		&.active,
		&:hover {
			background: rgba(188, 155, 255, 0.14);
		}
	}

	strong {
		font-size: 13px;
		font-weight: 600;
	}

	span {
		color: #aaa8bc;
		font-size: 11px;
	}
}

.taskbar-search__empty {
	color: #aaa8bc;
	cursor: default !important;
	font-size: 13px;
}
</style>
