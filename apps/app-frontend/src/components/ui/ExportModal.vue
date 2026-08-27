<script setup>
import { ServerIcon, XIcon } from '@modrinth/assets'
import {
	ButtonStyled,
	commonMessages,
	defineMessages,
	FileTreeSelect,
	injectNotificationManager,
	NewModal,
	StyledInput,
	useVIntl,
} from '@modrinth/ui'
import { save } from '@tauri-apps/plugin-dialog'
import { readDir, stat } from '@tauri-apps/plugin-fs'
import { ref } from 'vue'

import { PackageIcon } from '@/assets/icons'
import {
	export_instance_mrpack,
	get_full_path,
	get_pack_export_candidates,
} from '@/helpers/instance'
import { convertInstanceToServer } from '@/helpers/local-server'

const { addNotification, handleError } = injectNotificationManager()
const { formatMessage } = useVIntl()

const messages = defineMessages({
	header: { id: 'app.export-modal.header', defaultMessage: 'Export modpack' },
	modpackNameLabel: { id: 'app.export-modal.modpack-name-label', defaultMessage: 'Modpack name' },
	modpackNamePlaceholder: {
		id: 'app.export-modal.modpack-name-placeholder',
		defaultMessage: 'Modpack name',
	},
	versionNumberLabel: {
		id: 'app.export-modal.version-number-label',
		defaultMessage: 'Version number',
	},
	versionNumberPlaceholder: {
		id: 'app.export-modal.version-number-placeholder',
		defaultMessage: '1.0.0',
	},
	descriptionPlaceholder: {
		id: 'app.export-modal.description-placeholder',
		defaultMessage: 'Enter modpack description...',
	},
	exportButton: { id: 'app.export-modal.export-button', defaultMessage: 'Export' },
})

const props = defineProps({
	instance: {
		type: Object,
		required: true,
	},
})
const emit = defineEmits(['create-server'])
const exportType = ref('modpack')
const serverExportBusy = ref(false)

defineExpose({
	show: () => {
		resetExportState()
		exportType.value = 'modpack'
		exportModal.value.show()
		void initFiles().catch(handleError)
	},
})

const exportModal = ref(null)
const nameInput = ref(props.instance.name)
const exportDescription = ref('')
const versionInput = ref('1.0.0')
const files = ref([])
const selectedFilePaths = ref([])
const fileTreeKey = ref(0)
const filesLoadId = ref(0)
const instanceRoot = ref('')
const loadedDirectories = ref(new Set())

async function initFiles() {
	const loadId = ++filesLoadId.value
	const [filePaths, root] = await Promise.all([
		get_pack_export_candidates(props.instance.id),
		get_full_path(props.instance.id),
	])
	if (loadId !== filesLoadId.value) return

	instanceRoot.value = root
	const exportCandidates = await Promise.all(
		filePaths.map((path) => buildExportCandidateItem(root, path)),
	)
	if (loadId !== filesLoadId.value) return

	files.value = exportCandidates
	selectedFilePaths.value = files.value
		.filter((file) => !file.disabled && isDefaultSelectedExportCandidate(file.path))
		.map((file) => file.path)
}

const exportPack = async () => {
	const outputPath = await save({
		defaultPath: `${nameInput.value} ${versionInput.value}.mrpack`,
		filters: [
			{
				name: 'Modrinth Modpack',
				extensions: ['mrpack'],
			},
		],
	})

	if (outputPath) {
		export_instance_mrpack(
			props.instance.id,
			outputPath,
			selectedFilePaths.value,
			versionInput.value,
			exportDescription.value,
			nameInput.value,
		).catch((err) => handleError(err))
		exportModal.value.hide()
	}
}

const exportServerZip = async () => {
	const outputPath = await save({
		defaultPath: `${props.instance.name} — сервер.zip`,
		filters: [{ name: 'Серверная сборка ZIP', extensions: ['zip'] }],
	})
	if (!outputPath) return

	serverExportBusy.value = true
	try {
		const result = await convertInstanceToServer({
			instanceId: props.instance.id,
			exportPath: outputPath,
		})
		exportModal.value.hide()
		addNotification({
			type: 'success',
			title: 'Серверная сборка готова',
			text: `Скопировано модов: ${result.copied_mods}; исключено клиентских: ${result.excluded_mods}.`,
			autoCloseMs: 10_000,
		})
	} catch (error) {
		handleError(error)
	} finally {
		serverExportBusy.value = false
	}
}

function createServerFromPack() {
	exportModal.value.hide()
	emit('create-server', props.instance.id)
}

function resetExportState() {
	nameInput.value = props.instance.name
	exportDescription.value = ''
	versionInput.value = '1.0.0'
	files.value = []
	selectedFilePaths.value = []
	fileTreeKey.value += 1
	instanceRoot.value = ''
	loadedDirectories.value = new Set()
}

async function loadExportDirectory(path) {
	if (!path || !instanceRoot.value || loadedDirectories.value.has(path)) return

	const loadId = filesLoadId.value
	loadedDirectories.value.add(path)

	try {
		const entries = await readDir(`${instanceRoot.value}/${path}`)
		const childItems = await Promise.all(
			entries.map((entry) => buildExportDirectoryChildItem(instanceRoot.value, path, entry)),
		)
		if (loadId !== filesLoadId.value) return

		appendExportItems(childItems)
	} catch {
		loadedDirectories.value.delete(path)
	}
}

async function buildExportCandidateItem(instanceRoot, path) {
	try {
		const entries = await readDir(`${instanceRoot}/${path}`)
		const metadata = await getExportCandidateMetadata(instanceRoot, path)
		return {
			path,
			type: 'directory',
			disabled: isExportCandidateDisabled(path),
			modified: metadata.modified,
			count: entries.length,
		}
	} catch {
		return buildExportFileItem(instanceRoot, path)
	}
}

async function buildExportDirectoryChildItem(instanceRoot, parentPath, entry) {
	const path = `${parentPath}/${entry.name}`
	if (entry.isDirectory) {
		const metadata = await getExportCandidateMetadata(instanceRoot, path)
		return {
			path,
			type: 'directory',
			disabled: isExportCandidateDisabled(path),
			modified: metadata.modified,
		}
	}

	return buildExportFileItem(instanceRoot, path)
}

async function buildExportFileItem(instanceRoot, path) {
	const metadata = await getExportCandidateMetadata(instanceRoot, path)
	return {
		path,
		type: 'file',
		disabled: isExportCandidateDisabled(path),
		size: metadata.size,
		modified: metadata.modified,
	}
}

function appendExportItems(items) {
	const nextFiles = new Map(files.value.map((file) => [normalizeExportPath(file.path), file]))
	for (const item of items) {
		nextFiles.set(normalizeExportPath(item.path), item)
	}
	files.value = [...nextFiles.values()]
}

async function getExportCandidateMetadata(instanceRoot, path) {
	try {
		const metadata = await stat(`${instanceRoot}/${path}`)
		return {
			size: metadata.size,
			modified: metadata.mtime ? Math.floor(metadata.mtime.getTime() / 1000) : undefined,
		}
	} catch {
		return {}
	}
}

function normalizeExportPath(path) {
	return path.replaceAll('\\', '/').split('/').filter(Boolean).join('/')
}

function isDefaultSelectedExportCandidate(path) {
	return (
		path.startsWith('mods') ||
		path.startsWith('datapacks') ||
		path.startsWith('resourcepacks') ||
		path.startsWith('shaderpacks') ||
		path.startsWith('config')
	)
}

function isExportCandidateDisabled(path) {
	return (
		path === 'profile.json' ||
		path.startsWith('modrinth_logs') ||
		path.startsWith('.fabric') ||
		path.startsWith('__MACOSX')
	)
}
</script>

<template>
	<NewModal
		ref="exportModal"
		:header="formatMessage(messages.header)"
		scrollable
		width="46rem"
		max-width="calc(100vw - 2rem)"
	>
		<div class="export-type-tabs">
			<button :class="{ active: exportType === 'modpack' }" @click="exportType = 'modpack'">
				<PackageIcon /> Клиентская сборка
			</button>
			<button :class="{ active: exportType === 'server' }" @click="exportType = 'server'">
				<ServerIcon /> Серверная сборка
			</button>
		</div>
		<div v-if="exportType === 'modpack'" class="flex flex-col gap-4">
			<div class="grid grid-cols-2 gap-4">
				<div class="labeled_input w-full">
					<p class="text-contrast font-semibold">{{ formatMessage(messages.modpackNameLabel) }}</p>
					<StyledInput
						v-model="nameInput"
						type="text"
						:placeholder="formatMessage(messages.modpackNamePlaceholder)"
						clearable
						wrapper-class="w-full"
					/>
				</div>
				<div class="labeled_input w-full">
					<p class="text-contrast font-semibold">
						{{ formatMessage(messages.versionNumberLabel) }}
					</p>
					<StyledInput
						v-model="versionInput"
						type="text"
						:placeholder="formatMessage(messages.versionNumberPlaceholder)"
						clearable
						wrapper-class="w-full"
					/>
				</div>
			</div>
			<div class="flex flex-col gap-2 min-w-0">
				<p class="m-0 text-contrast font-semibold">
					{{ formatMessage(commonMessages.descriptionLabel) }}
				</p>
				<StyledInput
					v-model="exportDescription"
					multiline
					:placeholder="formatMessage(messages.descriptionPlaceholder)"
					wrapper-class="w-full"
				/>
			</div>
			<FileTreeSelect
				:key="fileTreeKey"
				v-model="selectedFilePaths"
				class="min-w-0"
				:items="files"
				@navigate="loadExportDirectory"
			/>
		</div>
		<div v-else class="server-pack-export">
			<ServerIcon />
			<div>
				<h3>Сделать сервер из «{{ instance.name }}»</h3>
				<p>
					EdenLauncher проверит метаданные JAR-файлов, удалит только клиентские моды, перенесёт
					конфигурацию и оставит серверный контент.
				</p>
			</div>
			<button class="server-pack-option" @click="createServerFromPack">
				<strong>Создать сервер в лаунчере</strong>
				<span>Открыть полный мастер ядра, ОЗУ, порта и offline mode.</span>
			</button>
			<button class="server-pack-option" :disabled="serverExportBusy" @click="exportServerZip">
				<strong>{{ serverExportBusy ? 'Создаём ZIP…' : 'Экспортировать в .zip' }}</strong>
				<span>Готовая серверная часть для переноса на другой компьютер или хостинг.</span>
			</button>
		</div>
		<template #actions>
			<div class="flex items-center justify-end gap-2">
				<ButtonStyled type="outlined">
					<button @click="exportModal.hide">
						<XIcon />
						{{ formatMessage(commonMessages.cancelButton) }}
					</button>
				</ButtonStyled>
				<ButtonStyled v-if="exportType === 'modpack'" color="brand">
					<button @click="exportPack">
						<PackageIcon />
						{{ formatMessage(messages.exportButton) }}
					</button>
				</ButtonStyled>
			</div>
		</template>
	</NewModal>
</template>

<style scoped lang="scss">
.export-type-tabs {
	display: flex;
	gap: 0.35rem;
	margin-bottom: 1rem;
	padding: 0.25rem;
	border-radius: 0.65rem;
	background: var(--surface-2);
}
.export-type-tabs button {
	display: flex;
	flex: 1;
	align-items: center;
	justify-content: center;
	gap: 0.45rem;
	padding: 0.6rem;
	border: 0;
	border-radius: 0.5rem;
	color: var(--color-text-tertiary);
	background: transparent;
	font: inherit;
	font-weight: 700;
	cursor: pointer;
}
.export-type-tabs button.active {
	color: var(--color-brand);
	background: var(--color-brand-highlight);
}
.export-type-tabs svg {
	width: 1rem;
}
.server-pack-export {
	display: grid;
	min-height: 23rem;
	grid-template-columns: 3.5rem 1fr;
	align-content: center;
	gap: 0.75rem;
	padding: 1rem;
}
.server-pack-export > svg {
	width: 2.5rem;
	height: 2.5rem;
	color: var(--color-brand);
}
.server-pack-export h3 {
	margin: 0;
	color: var(--color-text-primary);
}
.server-pack-export p {
	max-width: 34rem;
	margin: 0.35rem 0 1rem;
	color: var(--color-text-tertiary);
	line-height: 1.45;
}
.server-pack-option {
	grid-column: 1/-1;
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 0.2rem;
	padding: 0.8rem;
	border: 1px solid var(--color-button-border);
	border-radius: 0.65rem;
	color: var(--color-text-primary);
	background: var(--surface-2);
	font: inherit;
	text-align: left;
	cursor: pointer;
}
.server-pack-option:hover {
	border-color: var(--color-brand);
}
.server-pack-option span {
	color: var(--color-text-tertiary);
	font-size: 0.8rem;
}
</style>
