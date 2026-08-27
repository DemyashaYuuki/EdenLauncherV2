<script setup lang="ts">
import {
	BookOpenIcon,
	CheckIcon,
	CopyIcon,
	FolderOpenIcon,
	MemoryStickIcon,
	PlayIcon,
	PlusIcon,
	RefreshCwIcon,
	SendIcon,
	ServerIcon,
	StopCircleIcon,
	TrashIcon,
} from '@modrinth/assets'
import { NewModal } from '@modrinth/ui'
import { convertFileSrc } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { openPath } from '@tauri-apps/plugin-opener'
import { computed, nextTick, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import defaultServerIcon from '@/assets/server-default.svg'
import { get as getInstance } from '@/helpers/instance'
import { get_max_memory } from '@/helpers/jre.js'
import {
	addServerContent,
	createLocalServer,
	forceStopLocalServer,
	getLocalServerStatus,
	listLocalServers,
	type LocalServerProfile,
	type LocalServerStatus,
	onLocalServerConsole,
	onLocalServerProgress,
	onLocalServerState,
	prepareLocalServer,
	removeLocalServer,
	sendLocalServerCommand,
	type ServerCore,
	startLocalServer,
	stopLocalServer,
} from '@/helpers/local-server'

type WizardStep = 'servers' | 'choice' | 'config' | 'preparing' | 'console'
type ConsoleLine = { id: number; stream: 'stdout' | 'stderr' | 'system'; text: string }

const router = useRouter()
const modal = ref<InstanceType<typeof NewModal> | null>(null)
const step = ref<WizardStep>('servers')
const creationMode = ref<'new' | 'existing'>('new')
const profiles = ref<LocalServerProfile[]>([])
const activeProfile = ref<LocalServerProfile | null>(null)
const status = ref<LocalServerStatus | null>(null)
const maxMemoryMb = ref(8192)
const busy = ref(false)
const errorMessage = ref('')
const progress = ref(0)
const progressMessage = ref('Готовимся…')
const consoleLines = ref<ConsoleLine[]>([])
const consoleCommand = ref('')
const consoleElement = ref<HTMLElement | null>(null)
const serverReady = ref(false)
const copiedAddress = ref(false)
const coreFilter = ref<'all' | ServerCore>('all')
let consoleLineId = 0

const form = ref({
	name: 'Новый сервер',
	directory: '',
	core: 'fabric' as ServerCore,
	gameVersion: '1.21.11',
	loaderVersion: '',
	memoryMb: 4096,
	port: 25565,
	offlineMode: true,
	iconPath: '',
	coreJar: '',
	sourceInstanceId: '',
})

const coreOptions: { value: ServerCore; label: string; content: string; hint: string }[] = [
	{ value: 'fabric', label: 'Fabric', content: 'Моды', hint: 'Лёгкое модифицированное ядро' },
	{ value: 'forge', label: 'Forge', content: 'Моды', hint: 'Требуется выбрать готовый server.jar' },
	{
		value: 'neoforge',
		label: 'NeoForge',
		content: 'Моды',
		hint: 'Требуется выбрать готовый server.jar',
	},
	{ value: 'paper', label: 'Paper', content: 'Плагины', hint: 'Быстрое ядро Bukkit/Paper' },
	{
		value: 'purpur',
		label: 'Purpur',
		content: 'Плагины',
		hint: 'Paper с расширенными настройками',
	},
	{ value: 'vanilla', label: 'Vanilla', content: 'Датапаки', hint: 'Официальное ядро Mojang' },
]

const selectedCore = computed(() => coreOptions.find((core) => core.value === form.value.core)!)
const sortedProfiles = computed(() =>
	profiles.value
		.filter((profile) => coreFilter.value === 'all' || profile.core === coreFilter.value)
		.slice()
		.sort((a, b) => a.core.localeCompare(b.core) || a.name.localeCompare(b.name, 'ru')),
)
const memoryGb = computed(() =>
	(form.value.memoryMb / 1024).toLocaleString('ru-RU', { maximumFractionDigits: 1 }),
)
const isRunning = computed(() => status.value?.running ?? false)
const connectAddress = computed(
	() =>
		status.value?.connect_address ?? `localhost:${activeProfile.value?.port ?? form.value.port}`,
)

function imageSource(path: string | null) {
	return path ? convertFileSrc(path) : defaultServerIcon
}

function resetForm() {
	form.value = {
		name: 'Новый сервер',
		directory: '',
		core: 'fabric',
		gameVersion: '1.21.11',
		loaderVersion: '',
		memoryMb: 4096,
		port: 25565,
		offlineMode: true,
		iconPath: '',
		coreJar: '',
		sourceInstanceId: '',
	}
}

function addConsoleLine(stream: ConsoleLine['stream'], text: string) {
	consoleLines.value.push({ id: ++consoleLineId, stream, text })
	if (consoleLines.value.length > 1200) consoleLines.value.splice(0, 200)
	if (/Done \(|For help, type/i.test(text)) serverReady.value = true
	void nextTick(() => {
		if (consoleElement.value) consoleElement.value.scrollTop = consoleElement.value.scrollHeight
	})
}

async function refreshProfiles() {
	profiles.value = await listLocalServers()
}

async function show() {
	errorMessage.value = ''
	step.value = 'servers'
	modal.value?.show()
	try {
		await refreshProfiles()
		const totalMemoryKib = Number(await get_max_memory())
		maxMemoryMb.value = Math.max(
			2048,
			Math.min(65536, Math.floor(((totalMemoryKib / 1024) * 0.75) / 512) * 512),
		)
	} catch (error) {
		errorMessage.value = error instanceof Error ? error.message : String(error)
	}
}

function showCreate(sourceInstanceId = '') {
	void show().then(async () => {
		resetForm()
		form.value.sourceInstanceId = sourceInstanceId
		if (sourceInstanceId) {
			const source = await getInstance(sourceInstanceId).catch(() => null)
			if (source) {
				form.value.name = `${source.name} — сервер`
				form.value.gameVersion = source.game_version
				form.value.core = validSourceCore(source.loader)
				form.value.loaderVersion = source.loader_version ?? ''
			}
		}
		step.value = 'choice'
	})
}

defineExpose({ show, showCreate })

function validSourceCore(loader: string): ServerCore {
	return coreOptions.some((core) => core.value === loader) ? (loader as ServerCore) : 'fabric'
}

function chooseMode(mode: 'new' | 'existing') {
	creationMode.value = mode
	form.value.directory = ''
	step.value = 'config'
}

async function selectDirectory() {
	const directory = await open({
		directory: true,
		multiple: false,
		title: 'Выберите папку сервера',
	})
	if (typeof directory === 'string') form.value.directory = directory
}

async function selectIcon() {
	const path = await open({
		multiple: false,
		filters: [{ name: 'Изображение', extensions: ['png', 'jpg', 'jpeg', 'webp', 'ico'] }],
		title: 'Выберите иконку сервера',
	})
	if (typeof path === 'string') form.value.iconPath = path
}

async function selectCoreJar() {
	const path = await open({
		multiple: false,
		filters: [{ name: 'Java Archive', extensions: ['jar'] }],
		title: 'Выберите запускаемый файл ядра',
	})
	if (typeof path === 'string') form.value.coreJar = path
}

async function saveServer() {
	if (!form.value.name.trim()) return (errorMessage.value = 'Введите название сервера.')
	if (creationMode.value === 'existing' && !form.value.directory) {
		return (errorMessage.value = 'Выберите папку существующего сервера.')
	}
	if (['forge', 'neoforge'].includes(form.value.core) && !form.value.coreJar) {
		return (errorMessage.value = 'Для Forge/NeoForge выберите запускаемый файл ядра .jar.')
	}
	busy.value = true
	errorMessage.value = ''
	try {
		activeProfile.value = await createLocalServer({
			...form.value,
			directory: form.value.directory || null,
			loaderVersion: form.value.loaderVersion || null,
			iconPath: form.value.iconPath || null,
			coreJar: form.value.coreJar || null,
			sourceInstanceId: form.value.sourceInstanceId || null,
		})
		await refreshProfiles()
		await prepareAndStart()
	} catch (error) {
		errorMessage.value = error instanceof Error ? error.message : String(error)
	} finally {
		busy.value = false
	}
}

async function openProfile(profile: LocalServerProfile) {
	activeProfile.value = profile
	form.value.core = profile.core
	errorMessage.value = ''
	status.value = await getLocalServerStatus(profile.id)
	step.value = status.value.running ? 'console' : 'console'
}

async function prepareAndStart() {
	if (!activeProfile.value) return
	busy.value = true
	errorMessage.value = ''
	serverReady.value = false
	step.value = 'preparing'
	progress.value = 2
	try {
		status.value = await prepareLocalServer(activeProfile.value.id)
		activeProfile.value = status.value.profile
		consoleLines.value = []
		if (status.value.copied_mods || status.value.excluded_mods) {
			addConsoleLine(
				'system',
				`Серверных модов: ${status.value.copied_mods}. Исключено клиентских: ${status.value.excluded_mods}.`,
			)
		}
		status.value = await startLocalServer(activeProfile.value!.id)
		addConsoleLine('system', `Сервер запускается на ${connectAddress.value}.`)
		step.value = 'console'
		await refreshProfiles()
	} catch (error) {
		errorMessage.value = error instanceof Error ? error.message : String(error)
		step.value = activeProfile.value ? 'console' : 'config'
	} finally {
		busy.value = false
	}
}

async function startPreparedServer() {
	if (!activeProfile.value) return
	busy.value = true
	errorMessage.value = ''
	try {
		if (!status.value?.prepared) return await prepareAndStart()
		status.value = await startLocalServer(activeProfile.value.id)
		addConsoleLine('system', `Сервер запускается на ${connectAddress.value}.`)
	} catch (error) {
		errorMessage.value = error instanceof Error ? error.message : String(error)
	} finally {
		busy.value = false
	}
}

async function addContent() {
	if (!activeProfile.value) return
	const paths = await open({
		multiple: true,
		filters: [{ name: selectedCore.value.content, extensions: ['jar', 'zip'] }],
		title: `Добавить: ${selectedCore.value.content.toLocaleLowerCase()}`,
	})
	if (!paths) return
	const values = Array.isArray(paths) ? paths : [paths]
	try {
		const count = await addServerContent(activeProfile.value.id, values)
		addConsoleLine('system', `Добавлено файлов: ${count}.`)
	} catch (error) {
		errorMessage.value = error instanceof Error ? error.message : String(error)
	}
}

function browseContent() {
	if (!activeProfile.value) return
	const projectType = ['paper', 'purpur'].includes(activeProfile.value.core)
		? 'plugin'
		: activeProfile.value.core === 'vanilla'
			? 'datapack'
			: 'mod'
	void router.push({
		path: `/browse/${projectType}`,
		query:
			projectType === 'datapack'
				? { v: activeProfile.value.game_version }
				: { g: activeProfile.value.core, v: activeProfile.value.game_version },
	})
	modal.value?.hide()
}

async function forgetProfile(profile: LocalServerProfile) {
	try {
		await removeLocalServer(profile.id)
		await refreshProfiles()
	} catch (error) {
		errorMessage.value = error instanceof Error ? error.message : String(error)
	}
}

async function sendCommand() {
	const command = consoleCommand.value.trim()
	if (!command || !isRunning.value) return
	consoleCommand.value = ''
	try {
		await sendLocalServerCommand(command)
		addConsoleLine('system', `> ${command}`)
	} catch (error) {
		addConsoleLine('stderr', error instanceof Error ? error.message : String(error))
	}
}

async function stopServer(force = false) {
	if (!isRunning.value) return
	busy.value = true
	try {
		if (force) await forceStopLocalServer()
		else await stopLocalServer()
		addConsoleLine(
			'system',
			force ? 'Принудительно завершаем процесс…' : 'Сохраняем мир и останавливаем сервер…',
		)
	} finally {
		busy.value = false
	}
}

async function copyAddress() {
	await navigator.clipboard.writeText(connectAddress.value)
	copiedAddress.value = true
	window.setTimeout(() => (copiedAddress.value = false), 1600)
}

const unlistenProgress = await onLocalServerProgress((event) => {
	progress.value = event.progress
	progressMessage.value = event.message
})
const unlistenConsole = await onLocalServerConsole((event) =>
	addConsoleLine(event.stream, event.line),
)
const unlistenState = await onLocalServerState((event) => {
	if (status.value && (!event.profile_id || event.profile_id === activeProfile.value?.id)) {
		status.value.running = event.running
		status.value.pid = event.pid
	}
	if (!event.running) {
		serverReady.value = false
		addConsoleLine(
			'system',
			event.exit_code == null
				? 'Сервер остановлен.'
				: `Сервер завершён с кодом ${event.exit_code}.`,
		)
	}
})

onUnmounted(() => {
	unlistenProgress()
	unlistenConsole()
	unlistenState()
})
</script>

<template>
	<NewModal ref="modal" header="Серверы EdenLauncher" max-width="980px">
		<div class="server-manager">
			<header class="server-steps">
				<button :class="{ active: step === 'servers' }" @click="step = 'servers'">
					Мои серверы
				</button>
				<span>/</span>
				<strong v-if="step === 'choice' || step === 'config'">Создание сервера</strong>
				<strong v-else-if="step === 'preparing'">Подготовка</strong>
				<strong v-else-if="step === 'console'">{{ activeProfile?.name }}</strong>
			</header>

			<p v-if="errorMessage" class="server-error">{{ errorMessage }}</p>

			<section v-if="step === 'servers'" class="server-list-page">
				<div class="server-page-title">
					<div>
						<h2>Локальные серверы</h2>
						<p>Профили, ядра, контент и консоль в одном месте.</p>
					</div>
					<button class="primary" @click="showCreate()"><PlusIcon /> Создать сервер</button>
				</div>
				<div v-if="profiles.length" class="core-filter">
					<button :class="{ active: coreFilter === 'all' }" @click="coreFilter = 'all'">
						Все ядра
					</button>
					<button
						v-for="core in coreOptions"
						:key="core.value"
						:class="{ active: coreFilter === core.value }"
						@click="coreFilter = core.value"
					>
						{{ core.label }}
					</button>
				</div>
				<div v-if="profiles.length" class="server-grid">
					<article
						v-for="profile in sortedProfiles"
						:key="profile.id"
						@click="openProfile(profile)"
					>
						<img :src="imageSource(profile.icon_path)" alt="" />
						<div>
							<strong>{{ profile.name }}</strong
							><span>{{ profile.core.toUpperCase() }} · {{ profile.game_version }}</span
							><small>localhost:{{ profile.port }}</small>
						</div>
						<button title="Убрать из списка, не удаляя файлы" @click.stop="forgetProfile(profile)">
							<TrashIcon />
						</button>
					</article>
				</div>
				<div v-else class="server-empty">
					<img :src="defaultServerIcon" alt="" />
					<h3>Серверов пока нет</h3>
					<p>Создайте новый или подключите папку существующего сервера.</p>
				</div>
			</section>

			<section v-else-if="step === 'choice'" class="server-choice">
				<div class="server-page-title">
					<div>
						<h2>Как создать сервер?</h2>
						<p>Выберите источник, настройки можно изменить на следующем шаге.</p>
					</div>
				</div>
				<div class="choice-grid">
					<button @click="chooseMode('new')">
						<span><ServerIcon /></span><strong>Новый сервер</strong
						><small>Ядро, версия, ОЗУ, порт, offline mode и иконка.</small>
					</button>
					<button @click="chooseMode('existing')">
						<span><FolderOpenIcon /></span><strong>Сервер из папки</strong
						><small>Подключить существующие мир, ядро и настройки.</small>
					</button>
				</div>
			</section>

			<section v-else-if="step === 'config'" class="server-config">
				<div class="server-config-title">
					<img :src="imageSource(form.iconPath || null)" alt="" />
					<div>
						<h2>{{ creationMode === 'new' ? 'Новый сервер' : 'Подключение папки' }}</h2>
						<p>Поля отмечены понятными подсказками — настройки можно оставить рекомендуемыми.</p>
					</div>
				</div>
				<div class="server-form-grid">
					<label class="wide"
						><span>Название</span
						><input v-model="form.name" maxlength="64" placeholder="Мой сервер"
					/></label>
					<label
						><span>Ядро</span
						><select v-model="form.core">
							<option v-for="core in coreOptions" :key="core.value" :value="core.value">
								{{ core.label }} — {{ core.content }}
							</option></select
						><small>{{ selectedCore.hint }}</small></label
					>
					<label
						><span>Версия Minecraft</span><input v-model="form.gameVersion" placeholder="1.21.11"
					/></label>
					<label v-if="form.core === 'fabric'"
						><span>Fabric Loader</span
						><input v-model="form.loaderVersion" placeholder="Автоматически" /><small
							>Оставьте пустым для последней стабильной версии.</small
						></label
					>
					<label
						><span>Порт</span
						><input v-model.number="form.port" type="number" min="1024" max="65535"
					/></label>
					<label class="wide memory"
						><span
							><MemoryStickIcon /> Оперативная память <b>{{ memoryGb }} ГБ</b></span
						><input
							v-model.number="form.memoryMb"
							type="range"
							min="1024"
							:max="maxMemoryMb"
							step="512"
						/><small>Не выделяйте серверу всю память компьютера.</small></label
					>
					<label class="toggle wide"
						><input v-model="form.offlineMode" type="checkbox" /><span
							><strong>Offline mode</strong
							><small
								>Разрешает вход с офлайн-аккаунтов. Включайте только для доверенных игроков.</small
							></span
						></label
					>
					<div v-if="creationMode === 'existing'" class="file-field wide">
						<span>Папка сервера</span
						><button @click="selectDirectory">
							<FolderOpenIcon /> {{ form.directory || 'Выбрать папку' }}
						</button>
					</div>
					<div class="file-field">
						<span>Иконка</span
						><button @click="selectIcon">
							<PlusIcon /> {{ form.iconPath ? 'Изменить' : 'Выбрать' }}
						</button>
					</div>
					<div
						v-if="['forge', 'neoforge'].includes(form.core) || creationMode === 'existing'"
						class="file-field"
					>
						<span>Файл ядра .jar</span
						><button @click="selectCoreJar">
							<FolderOpenIcon /> {{ form.coreJar ? 'Выбрано' : 'Выбрать' }}
						</button>
					</div>
				</div>
				<div class="server-actions">
					<button @click="step = 'choice'">Назад</button
					><button class="primary" :disabled="busy" @click="saveServer">
						<PlayIcon /> Создать и подготовить
					</button>
				</div>
			</section>

			<section v-else-if="step === 'preparing'" class="server-preparing">
				<RefreshCwIcon class="animate-spin" />
				<h2>Подготавливаем сервер</h2>
				<p>{{ progressMessage }}</p>
				<div><span :style="{ width: `${progress}%` }"></span></div>
				<strong>{{ progress }}%</strong>
			</section>

			<section v-else class="server-console-page">
				<div class="server-profile-head">
					<img :src="imageSource(activeProfile?.icon_path ?? null)" alt="" />
					<div>
						<h2>{{ activeProfile?.name }}</h2>
						<p>
							{{ activeProfile?.core.toUpperCase() }} · {{ activeProfile?.game_version }} ·
							{{ connectAddress }}
						</p>
					</div>
					<span :class="{ online: isRunning }">{{
						isRunning ? (serverReady ? 'Онлайн' : 'Запускается') : 'Остановлен'
					}}</span>
				</div>
				<div class="server-toolbar">
					<button @click="copyAddress">
						<CheckIcon v-if="copiedAddress" /><CopyIcon v-else /> Адрес
					</button>
					<button @click="openPath(activeProfile!.directory)"><FolderOpenIcon /> Папка</button>
					<button @click="addContent">
						<PlusIcon /> Добавить {{ selectedCore.content.toLocaleLowerCase() }}
					</button>
					<button @click="browseContent">Modrinth: {{ selectedCore.content }}</button>
					<button v-if="isRunning" class="danger" :disabled="busy" @click="stopServer(false)">
						<StopCircleIcon /> Остановить
					</button>
					<button v-else class="primary" :disabled="busy" @click="startPreparedServer">
						<PlayIcon /> Запустить
					</button>
				</div>
				<div ref="consoleElement" class="server-console">
					<div v-if="!consoleLines.length" class="console-empty">
						Консоль сервера появится здесь.
					</div>
					<div v-for="line in consoleLines" :key="line.id" :class="`console-${line.stream}`">
						{{ line.text }}
					</div>
				</div>
				<form class="console-command" @submit.prevent="sendCommand">
					<span>&gt;</span
					><input
						v-model="consoleCommand"
						:disabled="!isRunning"
						placeholder="Команда сервера, например: list"
					/><button :disabled="!isRunning || !consoleCommand.trim()"><SendIcon /></button>
				</form>
				<div class="connection-guide">
					<BookOpenIcon />
					<div>
						<strong>Как подключиться</strong
						><span
							>На этом ПК: <code>{{ connectAddress }}</code
							>. В локальной сети: <code>IPv4_КОМПЬЮТЕРА:{{ activeProfile?.port }}</code
							>.</span
						>
					</div>
				</div>
				<button v-if="isRunning" class="force-stop" @click="stopServer(true)">
					Сервер завис? Завершить процесс принудительно
				</button>
			</section>
		</div>
	</NewModal>
</template>

<style scoped lang="scss">
.server-manager {
	display: flex;
	min-height: 34rem;
	flex-direction: column;
	padding: 1rem;
	color: var(--color-text-default);
}
.server-steps {
	display: flex;
	align-items: center;
	gap: 0.6rem;
	margin-bottom: 1rem;
	color: var(--color-text-tertiary);
}
.server-steps button {
	padding: 0;
	border: 0;
	color: inherit;
	background: none;
	cursor: pointer;
}
.server-steps button.active,
.server-steps strong {
	color: var(--color-text-primary);
}
.server-error {
	margin: 0 0 0.75rem;
	padding: 0.7rem;
	border: 1px solid color-mix(in srgb, #ef4444 50%, transparent);
	border-radius: 0.6rem;
	color: #fecaca;
	background: color-mix(in srgb, #7f1d1d 30%, transparent);
}
.server-page-title {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
}
.server-page-title h2,
.server-config-title h2,
.server-profile-head h2 {
	margin: 0;
	color: var(--color-text-primary);
}
.server-page-title p,
.server-config-title p,
.server-profile-head p {
	margin: 0.25rem 0 0;
	color: var(--color-text-tertiary);
}
button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 0.45rem;
	min-height: 2.4rem;
	padding: 0.5rem 0.8rem;
	border: 1px solid var(--color-button-border);
	border-radius: 0.55rem;
	color: var(--color-text-primary);
	background: var(--color-button-bg);
	font: inherit;
	cursor: pointer;
}
button:hover {
	border-color: var(--color-brand);
}
button:disabled {
	cursor: not-allowed;
	opacity: 0.55;
}
button svg {
	width: 1rem;
	height: 1rem;
}
.primary {
	border-color: var(--color-brand);
	color: var(--color-accent-contrast);
	background: var(--color-brand);
}
.danger {
	color: #fecaca;
	background: #7f1d1d;
}
.server-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 0.75rem;
	margin-top: 1rem;
}
.server-grid article {
	display: grid;
	grid-template-columns: 3.6rem 1fr auto;
	align-items: center;
	gap: 0.75rem;
	padding: 0.75rem;
	border: 1px solid var(--color-button-border);
	border-radius: 0.75rem;
	background: var(--surface-2);
	cursor: pointer;
}
.server-grid article:hover {
	border-color: var(--color-brand);
}
.server-grid img {
	width: 3.6rem;
	height: 3.6rem;
	border-radius: 0.7rem;
	object-fit: cover;
}
.server-grid article > div {
	display: flex;
	min-width: 0;
	flex-direction: column;
}
.server-grid span,
.server-grid small {
	color: var(--color-text-tertiary);
}
.server-grid article > button {
	padding: 0.45rem;
}
.core-filter {
	display: flex;
	flex-wrap: wrap;
	gap: 0.35rem;
	margin-top: 0.85rem;
}
.core-filter button {
	min-height: 1.9rem;
	padding: 0.25rem 0.55rem;
	border-radius: 999px;
	font-size: 0.75rem;
}
.core-filter button.active {
	border-color: var(--color-brand);
	color: var(--color-brand);
	background: var(--color-brand-highlight);
}
.server-empty {
	display: grid;
	min-height: 25rem;
	place-content: center;
	justify-items: center;
	text-align: center;
}
.server-empty img {
	width: 5.5rem;
	height: 5.5rem;
}
.server-empty h3 {
	margin: 0.8rem 0 0.25rem;
}
.server-empty p {
	margin: 0;
	color: var(--color-text-tertiary);
}
.choice-grid {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 1rem;
	margin-top: 1.4rem;
}
.choice-grid > button {
	display: flex;
	min-height: 14rem;
	flex-direction: column;
	align-items: flex-start;
	padding: 1.3rem;
	text-align: left;
}
.choice-grid > button > span {
	display: grid;
	width: 3.4rem;
	height: 3.4rem;
	place-items: center;
	border-radius: 0.8rem;
	color: var(--color-brand);
	background: var(--color-brand-highlight);
}
.choice-grid svg {
	width: 1.7rem;
	height: 1.7rem;
}
.choice-grid strong {
	font-size: 1.2rem;
}
.choice-grid small {
	color: var(--color-text-tertiary);
}
.server-config-title,
.server-profile-head {
	display: flex;
	align-items: center;
	gap: 0.8rem;
}
.server-config-title img,
.server-profile-head img {
	width: 4rem;
	height: 4rem;
	border-radius: 0.8rem;
	object-fit: cover;
}
.server-form-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 0.9rem;
	margin-top: 1rem;
}
.server-form-grid label,
.file-field {
	display: flex;
	min-width: 0;
	flex-direction: column;
	gap: 0.35rem;
}
.server-form-grid label > span,
.file-field > span {
	font-weight: 700;
	color: var(--color-text-primary);
}
.server-form-grid input:not([type='checkbox']):not([type='range']),
.server-form-grid select {
	box-sizing: border-box;
	width: 100%;
	height: 2.5rem;
	padding: 0.45rem 0.65rem;
	border: 1px solid var(--color-button-border);
	border-radius: 0.5rem;
	color: var(--color-text-primary);
	background: var(--surface-2);
}
.server-form-grid small {
	color: var(--color-text-tertiary);
}
.wide {
	grid-column: 1/-1;
}
.memory > span {
	display: flex;
	align-items: center;
	gap: 0.4rem;
}
.memory > span b {
	margin-left: auto;
	color: var(--color-brand);
}
.toggle {
	flex-direction: row !important;
	align-items: center;
	padding: 0.7rem;
	border: 1px solid var(--color-button-border);
	border-radius: 0.6rem;
	background: var(--surface-2);
}
.toggle > span {
	display: flex;
	flex-direction: column;
}
.toggle input {
	width: 1.1rem;
	height: 1.1rem;
}
.file-field button {
	overflow: hidden;
	justify-content: flex-start;
	white-space: nowrap;
	text-overflow: ellipsis;
}
.server-actions {
	display: flex;
	justify-content: space-between;
	margin-top: 1rem;
}
.server-preparing {
	display: grid;
	min-height: 27rem;
	place-content: center;
	justify-items: center;
	text-align: center;
}
.server-preparing > svg {
	width: 3rem;
	height: 3rem;
	color: var(--color-brand);
}
.server-preparing h2 {
	margin: 1rem 0 0.2rem;
}
.server-preparing p {
	margin: 0.2rem;
	color: var(--color-text-tertiary);
}
.server-preparing > div {
	width: min(28rem, 65vw);
	height: 0.5rem;
	overflow: hidden;
	margin: 1rem;
	border-radius: 999px;
	background: var(--surface-4);
}
.server-preparing > div span {
	display: block;
	height: 100%;
	background: var(--color-brand);
	transition: width 0.2s;
}
.server-profile-head > div {
	flex: 1;
}
.server-profile-head > span {
	padding: 0.3rem 0.55rem;
	border-radius: 999px;
	color: var(--color-text-tertiary);
	background: var(--surface-4);
}
.server-profile-head > span.online {
	color: #dcfce7;
	background: #166534;
}
.server-toolbar {
	display: flex;
	flex-wrap: wrap;
	gap: 0.45rem;
	margin: 1rem 0;
}
.server-toolbar .danger,
.server-toolbar .primary {
	margin-left: auto;
}
.server-console {
	height: 18rem;
	overflow: auto;
	padding: 0.75rem;
	border: 1px solid #263548;
	border-radius: 0.5rem;
	color: #d6e2ef;
	background: #07111d;
	font:
		12px/1.55 ui-monospace,
		Consolas,
		monospace;
}
.console-stderr {
	color: #fca5a5;
}
.console-system {
	color: #c084fc;
}
.console-empty {
	display: grid;
	height: 100%;
	place-items: center;
	color: #64748b;
}
.console-command {
	display: flex;
	align-items: center;
	margin-top: 0.45rem;
	border: 1px solid var(--color-button-border);
	border-radius: 0.5rem;
	background: var(--surface-2);
}
.console-command > span {
	padding-left: 0.65rem;
	color: var(--color-brand);
}
.console-command input {
	min-width: 0;
	flex: 1;
	padding: 0.65rem;
	border: 0;
	outline: 0;
	color: var(--color-text-primary);
	background: transparent;
}
.console-command button {
	border: 0;
	background: transparent;
}
.connection-guide {
	display: flex;
	gap: 0.65rem;
	margin-top: 0.8rem;
	padding: 0.8rem;
	border: 1px solid var(--color-button-border);
	border-radius: 0.6rem;
	background: var(--surface-2);
}
.connection-guide > svg {
	width: 1.25rem;
	color: var(--color-brand);
}
.connection-guide > div {
	display: flex;
	flex-direction: column;
}
.connection-guide code {
	color: var(--color-brand);
}
.force-stop {
	align-self: flex-start;
	margin-top: 0.5rem;
	border: 0;
	color: var(--color-text-tertiary);
	background: none;
	font-size: 0.75rem;
}
@media (max-width: 760px) {
	.server-grid,
	.choice-grid,
	.server-form-grid {
		grid-template-columns: 1fr;
	}
	.wide {
		grid-column: auto;
	}
	.server-toolbar .danger,
	.server-toolbar .primary {
		margin-left: 0;
	}
}
</style>
