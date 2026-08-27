<script setup lang="ts">
import { DownloadIcon, ServerIcon } from '@modrinth/assets'
import { NewModal } from '@modrinth/ui'
import { ref } from 'vue'

import LocalServerModal from '@/components/ui/LocalServerModal.vue'

const emit = defineEmits<{ createInstance: [] }>()
const modal = ref<InstanceType<typeof NewModal> | null>(null)
const serverModal = ref<InstanceType<typeof LocalServerModal> | null>(null)

function show() {
	modal.value?.show()
}

function createInstance() {
	modal.value?.hide()
	emit('createInstance')
}

function createServer() {
	modal.value?.hide()
	serverModal.value?.showCreate()
}

function openServers() {
	modal.value?.hide()
	serverModal.value?.show()
}

defineExpose({
	show,
	showServers: () => serverModal.value?.show(),
	showServerCreate: (sourceInstanceId = '') => serverModal.value?.showCreate(sourceInstanceId),
})
</script>

<template>
	<NewModal ref="modal" header="Создать" max-width="720px">
		<div class="create-hub">
			<p>Что вы хотите создать в EdenLauncher?</p>
			<div>
				<button @click="createInstance">
					<span><DownloadIcon /></span>
					<strong>Игровая сборка</strong>
					<small>Новая чистая сборка, модпак Modrinth или импорт из файла.</small>
				</button>
				<button @click="createServer">
					<span><ServerIcon /></span>
					<strong>Локальный сервер</strong>
					<small>Новый сервер или уже существующий сервер из папки на компьютере.</small>
				</button>
				<button class="create-hub__servers" @click="openServers">
					<span><ServerIcon /></span>
					<strong>Мои серверы</strong>
					<small>Открыть сохранённые серверы, консоль и управление контентом.</small>
				</button>
			</div>
		</div>
	</NewModal>
	<LocalServerModal ref="serverModal" />
</template>

<style scoped lang="scss">
.create-hub {
	padding: 1rem;
}
.create-hub > p {
	margin: 0 0 1rem;
	color: var(--color-text-tertiary);
}
.create-hub > div {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 0.8rem;
}
.create-hub button {
	display: flex;
	min-height: 13rem;
	flex-direction: column;
	align-items: flex-start;
	gap: 0.6rem;
	padding: 1.1rem;
	border: 1px solid var(--color-button-border);
	border-radius: 0.8rem;
	color: var(--color-text-primary);
	background: var(--surface-2);
	font: inherit;
	text-align: left;
	cursor: pointer;
}
.create-hub button:hover {
	border-color: var(--color-brand);
	transform: translateY(-1px);
}
.create-hub button > span {
	display: grid;
	width: 3.2rem;
	height: 3.2rem;
	place-items: center;
	border-radius: 0.7rem;
	color: var(--color-brand);
	background: var(--color-brand-highlight);
}
.create-hub svg {
	width: 1.6rem;
	height: 1.6rem;
}
.create-hub strong {
	font-size: 1.08rem;
}
.create-hub small {
	color: var(--color-text-tertiary);
	line-height: 1.45;
}

.create-hub__servers {
	grid-column: 1 / -1;
	min-height: 6rem !important;
}
@media (max-width: 620px) {
	.create-hub > div {
		grid-template-columns: 1fr;
	}
}
</style>
