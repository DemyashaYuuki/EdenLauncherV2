<script setup lang="ts">
import {
	BookOpenIcon,
	CheckIcon,
	CopyIcon,
	CpuIcon,
	FolderOpenIcon,
	MemoryStickIcon,
	PlayIcon,
	RefreshCwIcon,
	SendIcon,
	ServerIcon,
	StopCircleIcon,
} from '@modrinth/assets'
import { NewModal } from '@modrinth/ui'
import { openPath } from '@tauri-apps/plugin-opener'
import { computed, nextTick, onUnmounted, ref } from 'vue'

import { downloadAndInstallEdenWorld, type EdenWorldInstallProgress } from '@/helpers/edenworld'
import { get_max_memory } from '@/helpers/jre.js'
import { list } from '@/helpers/instance'
import {
	forceStopLocalServer,
	getLocalServerStatus,
	onLocalServerConsole,
	onLocalServerProgress,
	onLocalServerState,
	prepareLocalServer,
	sendLocalServerCommand,
	startLocalServer,
	stopLocalServer,
	type LocalServerStatus,
} from '@/helpers/local-server'
import type { GameInstance } from '@/helpers/types'

type WizardStep = 'intro' | 'settings' | 'preparing' | 'console'
type ConsoleLine = { id: number; stream: 'stdout' | 'stderr' | 'system'; text: string }

const modal = ref<InstanceType<typeof NewModal> | null>(null)
const step = ref<WizardStep>('intro')
const status = ref<LocalServerStatus | null>(null)
const edenWorldInstance = ref<GameInstance | null>(null)
const memoryMb = ref(4096)
const maxMemoryMb = ref(8192)
const port = ref(25565)
const busy = ref(false)
const errorMessage = ref('')
const progress = ref(0)
const progressMessage = ref('Готовимся…')
const packProgress = ref<EdenWorldInstallProgress>({ downloaded: 0, total: null })
const consoleLines = ref<ConsoleLine[]>([])
const consoleCommand = ref('')
const consoleElement = ref<HTMLElement | null>(null)
const serverReady = ref(false)
const copiedAddress = ref(false)
let consoleLineId = 0

const memoryGb = computed(() =>
	(memoryMb.value / 1024).toLocaleString('ru-RU', { maximumFractionDigits: 1 }),
)
const progressPercent = computed(() => {
	if (packProgress.value.total && progressMessage.value.includes('сборк')) {
		return Math.round((packProgress.value.downloaded / packProgress.value.total) * 100)
	}
	return progress.value
})
const connectAddress = computed(() => status.value?.connect_address ?? `localhost:${port.value}`)
const isRunning = computed(() => status.value?.running ?? false)

function addConsoleLine(stream: ConsoleLine['stream'], text: string) {
	consoleLines.value.push({ id: ++consoleLineId, stream, text })
	if (consoleLines.value.length > 1200) consoleLines.value.splice(0, 200)
	if (/Done \(|For help, type/i.test(text)) serverReady.value = true
	void nextTick(() => {
		if (consoleElement.value) consoleElement.value.scrollTop = consoleElement.value.scrollHeight
	})
}

async function refreshInstance() {
	const instances = await list()
	edenWorldInstance.value =
		instances.find(
			(instance) =>
				instance.name.toLocaleLowerCase().includes('edenworld') &&
				instance.install_stage === 'installed',
		) ?? null
}

async function refreshStatus() {
	status.value = await getLocalServerStatus()
	if (status.value.running) step.value = 'console'
}

async function show() {
	errorMessage.value = ''
	modal.value?.show()
	try {
		await Promise.all([refreshInstance(), refreshStatus()])
		const totalMemoryKib = Number(await get_max_memory())
		const recommendedMaximum = Math.floor(((totalMemoryKib / 1024) * 0.75) / 512) * 512
		maxMemoryMb.value = Math.max(2048, Math.min(32768, recommendedMaximum))
		memoryMb.value = Math.min(memoryMb.value, maxMemoryMb.value)
	} catch (error) {
		errorMessage.value = error instanceof Error ? error.message : String(error)
	}
}

function continueToSettings() {
	step.value = 'settings'
	errorMessage.value = ''
}

async function ensureEdenWorldInstance() {
	await refreshInstance()
	if (edenWorldInstance.value) return edenWorldInstance.value

	progressMessage.value = 'Загружаем официальную сборку EdenWorld…'
	progress.value = 5
	packProgress.value = { downloaded: 0, total: null }
	await downloadAndInstallEdenWorld((downloadProgress) => {
		packProgress.value = downloadProgress
	})
	await refreshInstance()
	if (!edenWorldInstance.value) {
		throw new Error('Сборка установлена, но профиль EdenWorld не найден.')
	}
	return edenWorldInstance.value
}

async function prepareAndStart() {
	busy.value = true
	errorMessage.value = ''
	serverReady.value = false
	step.value = 'preparing'
	progress.value = 2
	progressMessage.value = 'Проверяем сборку EdenWorld…'

	try {
		const instance = await ensureEdenWorldInstance()
		if (!instance.loader_version) throw new Error('У сборки не указана версия Fabric Loader.')

		status.value = await prepareLocalServer({
			instanceId: instance.id,
			gameVersion: instance.game_version,
			loader: instance.loader,
			loaderVersion: instance.loader_version,
		})
		consoleLines.value = []
		addConsoleLine(
			'system',
			`Подготовлено серверных модов: ${status.value.copied_mods}. Исключено клиентских: ${status.value.excluded_mods}.`,
		)
		status.value = await startLocalServer(memoryMb.value, port.value)
		addConsoleLine(
			'system',
			`Сервер запускается на ${connectAddress.value}. Первый запуск может занять несколько минут.`,
		)
		step.value = 'console'
	} catch (error) {
		errorMessage.value = error instanceof Error ? error.message : String(error)
		step.value = 'settings'
	} finally {
		busy.value = false
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
		if (force) {
			await forceStopLocalServer()
			addConsoleLine('system', 'Отправлена принудительная остановка сервера.')
		} else {
			await stopLocalServer()
			addConsoleLine('system', 'Сохраняем мир и останавливаем сервер…')
		}
	} catch (error) {
		addConsoleLine('stderr', error instanceof Error ? error.message : String(error))
	} finally {
		busy.value = false
	}
}

async function copyAddress() {
	await navigator.clipboard.writeText(connectAddress.value)
	copiedAddress.value = true
	window.setTimeout(() => (copiedAddress.value = false), 1600)
}

async function openServerDirectory() {
	if (status.value?.directory) await openPath(status.value.directory)
}

const unlistenProgress = await onLocalServerProgress((event) => {
	progress.value = event.progress
	progressMessage.value = event.message
})
const unlistenConsole = await onLocalServerConsole((event) => {
	addConsoleLine(event.stream, event.line)
})
const unlistenState = await onLocalServerState((event) => {
	if (status.value) {
		status.value.running = event.running
		status.value.pid = event.pid
	}
	if (!event.running) {
		serverReady.value = false
		addConsoleLine(
			'system',
			event.exit_code == null
				? 'Локальный сервер остановлен.'
				: `Локальный сервер завершил работу с кодом ${event.exit_code}.`,
		)
	}
})

onUnmounted(() => {
	unlistenProgress()
	unlistenConsole()
	unlistenState()
})

defineExpose({ show })
</script>

<template>
	<NewModal ref="modal" header="Локальный сервер EdenWorld" max-width="920px">
		<div class="local-server-wizard">
			<div class="local-server-steps">
				<span :class="{ active: step === 'intro' }">1. Знакомство</span>
				<span :class="{ active: step === 'settings' || step === 'preparing' }">2. Настройка</span>
				<span :class="{ active: step === 'console' }">3. Сервер</span>
			</div>

			<section v-if="step === 'intro'" class="local-server-intro">
				<div class="local-server-hero-icon"><ServerIcon /></div>
				<div>
					<h2>Свой мир EdenWorld в пару кликов</h2>
					<p>
						Лаунчер установит официальную сборку, подберёт Java, подготовит совместимые серверные
						моды и покажет консоль прямо в интерфейсе.
					</p>
				</div>
				<div class="local-server-features">
					<div>
						<CpuIcon />
						<p>
							<strong>Java автоматически</strong><span>Для 1.21.11 будет установлена Java 21</span>
						</p>
					</div>
					<div>
						<MemoryStickIcon />
						<p><strong>Управление ОЗУ</strong><span>Вы сами выбираете объём памяти</span></p>
					</div>
					<div>
						<BookOpenIcon />
						<p>
							<strong>Понятное подключение</strong><span>Адреса для этого ПК и локальной сети</span>
						</p>
					</div>
				</div>
				<div class="local-server-notice">
					<strong>Важно</strong>
					<span
						>Сервер работает, пока открыт EdenLauncher. Мир хранится отдельно от одиночных
						миров.</span
					>
				</div>
				<button class="local-server-primary" @click="continueToSettings">
					Продолжить <PlayIcon />
				</button>
			</section>

			<section v-else-if="step === 'settings'" class="local-server-settings">
				<div class="local-server-settings__header">
					<div>
						<h2>Параметры запуска</h2>
						<p>Перед запуском лаунчер автоматически выполнит все недостающие шаги.</p>
					</div>
					<span class="instance-state" :class="{ ready: edenWorldInstance }">
						<CheckIcon v-if="edenWorldInstance" />
						<RefreshCwIcon v-else />
						{{ edenWorldInstance ? 'Сборка установлена' : 'Сборка будет установлена' }}
					</span>
				</div>

				<label class="memory-setting">
					<span
						><MemoryStickIcon /><strong>Оперативная память</strong><b>{{ memoryGb }} ГБ</b></span
					>
					<input v-model.number="memoryMb" type="range" min="2048" :max="maxMemoryMb" step="512" />
					<small>Рекомендуется 4–6 ГБ. Не выделяйте всю память компьютера.</small>
				</label>

				<label class="port-setting">
					<span>Порт сервера</span>
					<input v-model.number="port" type="number" min="1024" max="65535" />
					<small>Оставьте 25565, если этот порт не занят другой программой.</small>
				</label>

				<div class="preparation-list">
					<div>
						<span>1</span>
						<p>
							<strong>Сборка EdenWorld</strong
							><small>Установка или проверка существующего профиля</small>
						</p>
					</div>
					<div>
						<span>2</span>
						<p>
							<strong>Java и Fabric</strong><small>Автоматическая загрузка подходящих версий</small>
						</p>
					</div>
					<div>
						<span>3</span>
						<p>
							<strong>Серверные моды</strong
							><small>Клиентские моды будут безопасно исключены</small>
						</p>
					</div>
				</div>

				<p v-if="errorMessage" class="local-server-error">{{ errorMessage }}</p>
				<div class="local-server-actions">
					<button class="local-server-secondary" @click="step = 'intro'">Назад</button>
					<button class="local-server-primary" :disabled="busy" @click="prepareAndStart">
						<PlayIcon /> Подготовить и запустить
					</button>
				</div>
			</section>

			<section v-else-if="step === 'preparing'" class="local-server-preparing">
				<RefreshCwIcon class="animate-spin" />
				<h2>Подготавливаем локальный сервер</h2>
				<p>{{ progressMessage }}</p>
				<div class="local-server-progress">
					<span :style="{ width: `${progressPercent}%` }"></span>
				</div>
				<strong>{{ progressPercent }}%</strong>
			</section>

			<section v-else class="local-server-console-layout">
				<div class="local-server-toolbar">
					<div
						class="server-state"
						:class="{ online: isRunning && serverReady, starting: isRunning && !serverReady }"
					>
						<span></span>
						{{ !isRunning ? 'Остановлен' : serverReady ? 'Готов к подключению' : 'Запускается…' }}
					</div>
					<code>{{ connectAddress }}</code>
					<button title="Скопировать адрес" @click="copyAddress">
						<CheckIcon v-if="copiedAddress" /><CopyIcon v-else />
					</button>
					<button title="Открыть папку сервера" @click="openServerDirectory">
						<FolderOpenIcon />
					</button>
					<button v-if="isRunning" class="stop-button" :disabled="busy" @click="stopServer(false)">
						<StopCircleIcon /> Остановить
					</button>
					<button v-else class="start-button" :disabled="busy" @click="prepareAndStart">
						<PlayIcon /> Запустить снова
					</button>
				</div>

				<div ref="consoleElement" class="local-server-console">
					<div v-if="!consoleLines.length" class="console-empty">Вывод сервера появится здесь.</div>
					<div v-for="line in consoleLines" :key="line.id" :class="`console-line--${line.stream}`">
						{{ line.text }}
					</div>
				</div>
				<form class="console-command" @submit.prevent="sendCommand">
					<span>&gt;</span>
					<input
						v-model="consoleCommand"
						:disabled="!isRunning"
						placeholder="Команда сервера, например: say Привет!"
					/>
					<button :disabled="!isRunning || !consoleCommand.trim()"><SendIcon /></button>
				</form>

				<div class="connection-guide">
					<h3><BookOpenIcon /> Как подключиться</h3>
					<div class="connection-guide__grid">
						<div>
							<strong>На этом компьютере</strong><code>{{ connectAddress }}</code
							><span>Добавьте адрес в «Сетевая игра».</span>
						</div>
						<div>
							<strong>С другого ПК в Wi‑Fi/LAN</strong><code>ВАШ_IP:{{ port }}</code
							><span>Узнайте IPv4 через ipconfig и разрешите Java в брандмауэре.</span>
						</div>
						<div>
							<strong>Через интернет</strong><code>ВНЕШНИЙ_IP:{{ port }}</code
							><span>Понадобится проброс порта или безопасный игровой туннель.</span>
						</div>
					</div>
					<p>
						Проверка лицензии отключена для совместимости с офлайн-аккаунтами. Запускайте сервер
						только для людей, которым доверяете.
					</p>
				</div>

				<button v-if="isRunning" class="force-stop-link" @click="stopServer(true)">
					Сервер завис? Остановить принудительно
				</button>
			</section>
		</div>
	</NewModal>
</template>

<style scoped lang="scss">
.local-server-wizard {
	display: flex;
	min-height: 34rem;
	flex-direction: column;
	padding: 1.15rem;
}

.local-server-steps {
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: 0.45rem;
	margin-bottom: 1.25rem;
}

.local-server-steps span {
	padding: 0.55rem 0.7rem;
	border-radius: 0.65rem;
	color: var(--color-text-tertiary);
	background: var(--surface-2);
	font-size: 0.72rem;
	font-weight: 750;
	text-align: center;
}

.local-server-steps span.active {
	color: var(--color-link);
	background: var(--color-brand-highlight);
}

.local-server-intro,
.local-server-settings,
.local-server-preparing {
	display: flex;
	flex: 1;
	flex-direction: column;
}

.local-server-intro {
	align-items: center;
	justify-content: center;
	text-align: center;
}

.local-server-intro h2,
.local-server-settings h2,
.local-server-preparing h2 {
	margin: 0;
	font-size: 1.4rem;
}

.local-server-intro p,
.local-server-settings p,
.local-server-preparing p {
	color: var(--color-text-tertiary);
}

.local-server-hero-icon {
	display: grid;
	width: 4.5rem;
	height: 4.5rem;
	margin-bottom: 1rem;
	place-items: center;
	border-radius: 1.35rem;
	color: var(--color-accent-contrast);
	background: linear-gradient(135deg, var(--color-brand), var(--color-purple-700));
	box-shadow: 0 1rem 3rem var(--color-brand-highlight);
}

.local-server-hero-icon svg {
	width: 2rem;
	height: 2rem;
}

.local-server-features {
	display: grid;
	width: 100%;
	grid-template-columns: repeat(3, 1fr);
	gap: 0.7rem;
	margin-top: 1.1rem;
}

.local-server-features > div {
	display: flex;
	align-items: center;
	gap: 0.35rem;
	padding: 0.9rem;
	border: 1px solid var(--color-button-border);
	border-radius: 0.9rem;
	background: var(--surface-2);
	text-align: left;
}

.local-server-features svg {
	width: 1.3rem;
	color: var(--color-link);
}
.local-server-features p {
	display: flex;
	min-width: 0;
	flex-direction: column;
	gap: 0.2rem;
	margin: 0;
}
.local-server-features strong,
.local-server-features span {
	display: block;
}
.local-server-features span {
	color: var(--color-text-tertiary);
	font-size: 0.68rem;
}

.local-server-notice {
	display: flex;
	gap: 0.65rem;
	margin: 1rem 0;
	padding: 0.75rem 0.9rem;
	border-radius: 0.8rem;
	background: var(--color-brand-highlight);
	font-size: 0.76rem;
}

.local-server-primary,
.local-server-secondary,
.local-server-toolbar button,
.console-command button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 0.45rem;
	min-height: 2.65rem;
	padding: 0 0.9rem;
	border: 1px solid var(--color-button-border);
	border-radius: 0.75rem;
	color: var(--color-text-primary);
	background: var(--color-button-bg);
	font: inherit;
	font-weight: 750;
	cursor: pointer;
}

.local-server-primary {
	border-color: transparent;
	color: var(--color-accent-contrast);
	background: var(--color-brand);
}

.local-server-primary svg,
.local-server-toolbar svg,
.console-command svg {
	width: 1rem;
	height: 1rem;
}
button:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.local-server-settings__header,
.memory-setting > span,
.local-server-actions,
.local-server-toolbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.75rem;
}

.instance-state {
	display: inline-flex;
	align-items: center;
	gap: 0.4rem;
	padding: 0.45rem 0.65rem;
	border-radius: 0.65rem;
	color: var(--color-text-tertiary);
	background: var(--surface-2);
	font-size: 0.72rem;
	font-weight: 750;
}
.instance-state.ready {
	color: var(--color-link);
}
.instance-state svg {
	width: 0.9rem;
}

.memory-setting,
.port-setting {
	display: flex;
	flex-direction: column;
	gap: 0.55rem;
	margin-top: 1rem;
	padding: 1rem;
	border: 1px solid var(--color-button-border);
	border-radius: 0.9rem;
	background: var(--surface-2);
}

.memory-setting svg {
	width: 1.15rem;
	color: var(--color-link);
}
.memory-setting b {
	margin-left: auto;
	color: var(--color-link);
}
.memory-setting input {
	accent-color: var(--color-brand);
}
.memory-setting small,
.port-setting small,
.preparation-list small {
	color: var(--color-text-tertiary);
}
.port-setting input {
	width: 9rem;
	padding: 0.55rem 0.7rem;
	border: 1px solid var(--color-button-border);
	border-radius: 0.65rem;
	color: var(--color-text-primary);
	background: var(--color-button-bg);
}

.preparation-list {
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: 0.6rem;
	margin-top: 1rem;
}

.preparation-list > div {
	display: flex;
	gap: 0.6rem;
	padding: 0.75rem;
	border-radius: 0.8rem;
	background: var(--surface-2);
}
.preparation-list > div > span {
	display: grid;
	width: 1.7rem;
	height: 1.7rem;
	flex: 0 0 auto;
	place-items: center;
	border-radius: 50%;
	color: var(--color-accent-contrast);
	background: var(--color-brand);
	font-size: 0.7rem;
	font-weight: 800;
}
.preparation-list p {
	display: flex;
	flex-direction: column;
	gap: 0.2rem;
	margin: 0;
}
.preparation-list strong {
	font-size: 0.75rem;
}
.preparation-list small {
	font-size: 0.66rem;
}
.local-server-actions {
	margin-top: auto;
	padding-top: 1rem;
	justify-content: flex-end;
}
.local-server-error {
	padding: 0.7rem;
	border-radius: 0.7rem;
	color: var(--color-red) !important;
	background: var(--color-red-bg);
}

.local-server-preparing {
	align-items: center;
	justify-content: center;
	text-align: center;
}
.local-server-preparing > svg {
	width: 2.4rem;
	height: 2.4rem;
	margin-bottom: 1rem;
	color: var(--color-link);
}
.local-server-progress {
	width: min(28rem, 80%);
	height: 0.5rem;
	overflow: hidden;
	border-radius: 1rem;
	background: var(--surface-4);
}
.local-server-progress span {
	display: block;
	height: 100%;
	border-radius: inherit;
	background: var(--color-brand);
	transition: width 180ms ease;
}
.local-server-preparing > strong {
	margin-top: 0.6rem;
	color: var(--color-link);
}

.local-server-console-layout {
	display: flex;
	min-height: 0;
	flex: 1;
	flex-direction: column;
	gap: 0.7rem;
}
.local-server-toolbar {
	justify-content: flex-start;
}
.local-server-toolbar code {
	padding: 0.45rem 0.6rem;
	border-radius: 0.55rem;
	background: var(--surface-2);
}
.local-server-toolbar button {
	min-height: 2.2rem;
	padding: 0 0.65rem;
}
.local-server-toolbar .stop-button {
	margin-left: auto;
	color: var(--color-red);
}
.local-server-toolbar .start-button {
	margin-left: auto;
	color: var(--color-accent-contrast);
	background: var(--color-brand);
}
.server-state {
	display: inline-flex;
	align-items: center;
	gap: 0.4rem;
	font-size: 0.72rem;
	font-weight: 800;
}
.server-state > span {
	width: 0.5rem;
	height: 0.5rem;
	border-radius: 50%;
	background: var(--color-text-tertiary);
}
.server-state.starting > span {
	background: #f4b942;
	box-shadow: 0 0 0.6rem rgba(244, 185, 66, 0.65);
}
.server-state.online > span {
	background: #38d996;
	box-shadow: 0 0 0.6rem rgba(56, 217, 150, 0.7);
}

.local-server-console {
	height: 17rem;
	overflow: auto;
	padding: 0.85rem;
	border: 1px solid var(--color-button-border);
	border-radius: 0.8rem;
	color: #d8d5df;
	background: #09080d;
	font:
		0.72rem/1.5 ui-monospace,
		SFMono-Regular,
		Menlo,
		Consolas,
		monospace;
	white-space: pre-wrap;
	word-break: break-word;
}
.console-line--stderr {
	color: #ff849b;
}
.console-line--system {
	color: #c89aff;
}
.console-empty {
	display: grid;
	height: 100%;
	place-items: center;
	color: #756d7d;
}
.console-command {
	display: grid;
	grid-template-columns: auto 1fr auto;
	align-items: center;
	gap: 0.55rem;
}
.console-command > span {
	color: var(--color-link);
	font-family: monospace;
	font-weight: 900;
}
.console-command input {
	min-height: 2.5rem;
	padding: 0 0.7rem;
	border: 1px solid var(--color-button-border);
	border-radius: 0.65rem;
	color: var(--color-text-primary);
	background: var(--surface-2);
	font: 0.76rem monospace;
}
.console-command button {
	min-height: 2.5rem;
}

.connection-guide {
	padding: 0.85rem;
	border: 1px solid var(--color-button-border);
	border-radius: 0.85rem;
	background: var(--surface-2);
}
.connection-guide h3 {
	display: flex;
	align-items: center;
	gap: 0.45rem;
	margin: 0 0 0.65rem;
	font-size: 0.9rem;
}
.connection-guide h3 svg {
	width: 1rem;
	color: var(--color-link);
}
.connection-guide__grid {
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: 0.55rem;
}
.connection-guide__grid > div {
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
	padding: 0.6rem;
	border-radius: 0.65rem;
	background: var(--surface-3);
}
.connection-guide__grid strong {
	font-size: 0.7rem;
}
.connection-guide__grid code {
	color: var(--color-link);
	font-size: 0.68rem;
}
.connection-guide__grid span,
.connection-guide > p {
	color: var(--color-text-tertiary);
	font-size: 0.64rem;
	line-height: 1.4;
}
.connection-guide > p {
	margin: 0.65rem 0 0;
}
.force-stop-link {
	align-self: flex-end;
	padding: 0;
	border: 0;
	color: var(--color-text-tertiary);
	background: none;
	font: inherit;
	font-size: 0.66rem;
	cursor: pointer;
}

@media (max-width: 820px) {
	.local-server-features,
	.preparation-list,
	.connection-guide__grid {
		grid-template-columns: 1fr;
	}
}
</style>
