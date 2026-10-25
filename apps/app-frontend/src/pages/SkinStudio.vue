<script setup lang="ts">
import '@/assets/stylesheets/skin-studio.scss'

import { ShirtIcon } from '@modrinth/assets'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { openUrl } from '@tauri-apps/plugin-opener'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import rangerUrl from '@/assets/eden/skin-studio/textures/eden-ranger.png'
import operatorUrl from '@/assets/eden/skin-studio/textures/signal-operator.png'
import StudioApplyDialog, { type ApplyMode } from '@/components/skin-studio/StudioApplyDialog.vue'
import StudioCapes from '@/components/skin-studio/StudioCapes.vue'
import StudioConvertDialog from '@/components/skin-studio/StudioConvertDialog.vue'
import StudioDialog from '@/components/skin-studio/StudioDialog.vue'
import StudioEditor from '@/components/skin-studio/StudioEditor.vue'
import StudioExportDialog from '@/components/skin-studio/StudioExportDialog.vue'
import StudioFetchDialog from '@/components/skin-studio/StudioFetchDialog.vue'
import StudioIcon from '@/components/skin-studio/StudioIcon.vue'
import StudioLibrary from '@/components/skin-studio/StudioLibrary.vue'
import StudioModelsDialog from '@/components/skin-studio/StudioModelsDialog.vue'
import StudioNewDialog, { type NewTemplate } from '@/components/skin-studio/StudioNewDialog.vue'
import StudioServerUploadDialog from '@/components/skin-studio/StudioServerUploadDialog.vue'
import StudioSettingsDialog from '@/components/skin-studio/StudioSettingsDialog.vue'
import { ACCOUNTS_CHANGED_EVENT } from '@/helpers/auth'
import * as api from '@/helpers/skin-studio'
import { useRootBreadcrumb } from '@/providers/breadcrumbs'
import { isDirty } from '@/skin-studio/engine/document'
import { createImage, matchesModelAspect } from '@/skin-studio/engine/image'
import { builtinModel, type ModelDefinition, playerModelFor } from '@/skin-studio/engine/model'
import { formatFromFileName, parsePalette } from '@/skin-studio/engine/palette'
import { decodePng, encodePng } from '@/skin-studio/engine/png'
import { PROJECT_EXTENSION, safeFileStem } from '@/skin-studio/engine/project'
import { ELY_UPLOAD_PAGE } from '@/skin-studio/engine/providers'
import { actionForEvent, isTypingTarget, type ShortcutAction } from '@/skin-studio/engine/shortcuts'
import { importTcn, techneToModel } from '@/skin-studio/engine/tcn'
import { type PickedFile, pickFiles, saveBytes } from '@/skin-studio/files'
import { useStudioText } from '@/skin-studio/i18n'
import { PREVIEW_CHANNEL, type PreviewMessage } from '@/skin-studio/preview/protocol'
import { type StudioTab, useSkinStudio } from '@/skin-studio/store'
import { useTheming } from '@/store/theme'

const studio = useSkinStudio()
const theme = useTheming()
const t = useStudioText()
useRootBreadcrumb({
	slot: 'root',
	id: 'skins',
	label: 'Скины',
	to: '/skins',
	visual: { type: 'icon', component: ShirtIcon },
})
const editor = ref<InstanceType<typeof StudioEditor> | null>(null)
const themeBackground = ref('#100d19')

const dialogs = ref({
	new: false,
	models: false,
	convert: false,
	export: false,
	apply: false,
	ely: false,
	serverHelp: false,
	fetch: false,
	settings: false,
})
const applyMode = ref<ApplyMode | null>(null)
const savingPng = ref(false)
const customModel = ref<ModelDefinition | null>(null)
const modelsForNew = ref(false)

interface Toast {
	id: number
	kind: 'error' | 'info'
	text: string
}
const toasts = ref<Toast[]>([])
let toastId = 0

function notify(kind: 'error' | 'info', text: string): void {
	const id = ++toastId
	toasts.value = [...toasts.value.slice(-3), { id, kind, text }]
	setTimeout(
		() => (toasts.value = toasts.value.filter((x) => x.id !== id)),
		kind === 'error' ? 9000 : 4500,
	)
}

const prompt = ref<{ title: string; value: string; done: (value: string | null) => void } | null>(
	null,
)
const promptValue = ref('')
function askPrompt(title: string, value: string, done: (value: string | null) => void): void {
	promptValue.value = value
	prompt.value = { title, value, done }
}
function finishPrompt(ok: boolean): void {
	const current = prompt.value
	prompt.value = null
	current?.done(ok ? promptValue.value.trim() || null : null)
}

const confirmState = ref<{ title: string; body: string; done: (ok: boolean) => void } | null>(null)
function askConfirm(title: string, body: string, done: (ok: boolean) => void): void {
	confirmState.value = { title, body, done }
}
function finishConfirm(ok: boolean): void {
	const current = confirmState.value
	confirmState.value = null
	current?.done(ok)
}

const unsaved = ref<{ id: string; name: string } | null>(null)

const tabs: { id: StudioTab; key: 'page.tab.editor' | 'page.tab.library' | 'page.tab.capes' }[] = [
	{ id: 'editor', key: 'page.tab.editor' },
	{ id: 'library', key: 'page.tab.library' },
	{ id: 'capes', key: 'page.tab.capes' },
]

const projectCount = computed(() => studio.library.filter((e) => e.kind !== 'folder').length)
const activeDirty = computed(() => {
	void studio.revision
	return studio.active ? isDirty(studio.active) : false
})
const footerText = computed(() => {
	if (!studio.active) return t('footer.noDocument')
	return activeDirty.value ? t('footer.unsaved') : t('footer.saved')
})
const footerHints = computed(() =>
	t('footer.hints', {
		save: studio.shortcuts['file.save'] || '—',
		undo: studio.shortcuts['edit.undo'] || '—',
		pencil: studio.shortcuts['tool.pencil'] || '—',
	}),
)

function readThemeBackground(): void {
	const value = getComputedStyle(document.documentElement).getPropertyValue('--eden-canvas').trim()
	if (/^#[0-9a-fA-F]{3,8}$/.test(value) || value.startsWith('rgb')) themeBackground.value = value
}

async function assetBytes(url: string): Promise<Uint8Array> {
	const response = await fetch(url)
	return new Uint8Array(await response.arrayBuffer())
}

async function createDocument(options: {
	name: string
	model: ModelDefinition
	scale: number
	template: NewTemplate
}): Promise<void> {
	dialogs.value.new = false
	try {
		let image = createImage(
			options.model.textureWidth * options.scale,
			options.model.textureHeight * options.scale,
		)
		if (options.template !== 'blank') {
			image = await decodePng(
				await assetBytes(options.template === 'ranger' ? rangerUrl : operatorUrl),
			)
		}
		studio.newDocument(options.name, options.model, image)
		studio.tab = 'editor'
	} catch (error) {
		notify('error', t('error.generic', { message: (error as Error).message }))
	}
}

async function openTemplate(id: 'ranger' | 'operator'): Promise<void> {
	await createDocument({
		name: id === 'ranger' ? t('new.template.ranger') : t('new.template.operator'),
		model: builtinModel('player-classic') as ModelDefinition,
		scale: 1,
		template: id,
	})
}

function openCapeTemplate(): void {
	const model = builtinModel('cape') as ModelDefinition
	studio.newDocument(t('part.cape'), model)
	studio.tab = 'editor'
}

async function importFiles(files: PickedFile[]): Promise<void> {
	let count = 0
	for (const file of files) {
		const lower = file.name.toLowerCase()
		try {
			if (lower.endsWith(`.${PROJECT_EXTENSION}`)) {
				await studio.openProjectBytes(file.bytes)
			} else if (lower.endsWith('.png')) {
				await studio.importPng(file.name.replace(/\.png$/i, ''), file.bytes)
			} else if (lower.endsWith('.tcn') || lower.endsWith('.xml')) {
				const imported = lower.endsWith('.tcn')
					? await importTcn(file.bytes)
					: techneToModel(new TextDecoder().decode(file.bytes))
				chooseModel(imported.model)
				if (imported.warnings.length)
					notify('info', t('model.importWarnings', { details: imported.warnings.join(', ') }))
			} else {
				const format = formatFromFileName(file.name)
				if (!format) throw new Error(t('error.format'))
				studio.addPalette(parsePalette(format, file.bytes, file.name.replace(/\.[^.]+$/, '')))
			}
			count++
		} catch (error) {
			notify(
				'error',
				t('library.importFailed', { name: file.name, message: (error as Error).message }),
			)
		}
	}
	if (count) {
		notify('info', t('library.importDone', { count }))
		if (studio.active) studio.tab = 'editor'
	}
}

async function importDialog(): Promise<void> {
	try {
		const files = await pickFiles(
			[
				{
					name: 'Skin Studio',
					extensions: ['png', PROJECT_EXTENSION, 'tcn', 'xml', 'gpl', 'aco', 'act', 'swtch'],
				},
			],
			true,
		)
		await importFiles(files)
	} catch (error) {
		notify('error', t('error.generic', { message: (error as Error).message }))
	}
}

async function onFetched(name: string, bytes: Uint8Array, slim: boolean): Promise<void> {
	dialogs.value.fetch = false
	try {
		const image = await decodePng(bytes)
		const model = playerModelFor(image.width, image.height, slim)
		studio.newDocument(name, model, image)
		studio.tab = 'editor'
	} catch (error) {
		notify('error', t('fetch.error', { message: (error as Error).message }))
	}
}

function chooseModel(model: ModelDefinition): void {
	dialogs.value.models = false
	const doc = studio.active
	if (modelsForNew.value || !doc) {
		modelsForNew.value = false
		customModel.value = model
		dialogs.value.new = true
		return
	}
	if (
		matchesModelAspect(doc.image.width, doc.image.height, model.textureWidth, model.textureHeight)
	) {
		studio.replace(model.name, doc.image, model)
	} else {
		studio.newDocument(model.name, model, createImage(model.textureWidth, model.textureHeight))
	}
}

async function save(saveAs = false): Promise<void> {
	const doc = studio.active
	if (!doc) return
	const run = async (name?: string) => {
		try {
			await studio.saveDocument(doc, saveAs, name)
			notify('info', t('saved.toast', { name: doc.name }))
		} catch (error) {
			notify('error', t('error.generic', { message: (error as Error).message }))
		}
	}
	if (saveAs || !doc.path) askPrompt(t('action.saveAs'), doc.name, (name) => name && void run(name))
	else await run()
}

async function saveAll(): Promise<void> {
	try {
		await studio.saveAll()
		notify('info', t('footer.saved'))
	} catch (error) {
		notify('error', t('error.generic', { message: (error as Error).message }))
	}
}

function requestClose(id: string): void {
	const doc = studio.documents.find((d) => d.id === id)
	if (!doc) return
	if (isDirty(doc)) unsaved.value = { id, name: doc.name }
	else studio.closeDocument(id)
}

async function resolveUnsaved(choice: 'save' | 'discard' | 'cancel'): Promise<void> {
	const current = unsaved.value
	unsaved.value = null
	if (!current || choice === 'cancel') return
	const doc = studio.documents.find((d) => d.id === current.id)
	if (!doc) return
	if (choice === 'save') {
		try {
			await studio.saveDocument(doc)
		} catch (error) {
			notify('error', t('error.generic', { message: (error as Error).message }))
			return
		}
	}
	studio.closeDocument(current.id)
}

function openApply(mode: ApplyMode): void {
	applyMode.value = mode
	dialogs.value.apply = true
}

async function saveSkinPng(): Promise<boolean> {
	const doc = studio.active
	if (!doc || savingPng.value) return false
	savingPng.value = true
	try {
		const saved = await saveBytes(
			`${safeFileStem(doc.name)}.png`,
			[{ name: 'PNG', extensions: ['png'] }],
			await encodePng(doc.image),
		)
		if (saved) notify('info', t('export.saved'))
		return saved
	} catch (error) {
		notify('error', t('export.failed', { message: (error as Error).message }))
		return false
	} finally {
		savingPng.value = false
	}
}

async function exportForEly(): Promise<void> {
	if (!(await saveSkinPng())) return
	try {
		await openUrl(ELY_UPLOAD_PAGE)
		dialogs.value.ely = false
	} catch (error) {
		notify('error', t('error.generic', { message: (error as Error).message }))
	}
}

async function screenshotTo(target: 'clipboard' | 'file'): Promise<void> {
	const blob = await editor.value?.screenshot(1024, 1024, true)
	if (!blob) return
	try {
		if (target === 'clipboard') {
			await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
			notify('info', t('export.copied'))
		} else {
			const saved = await saveBytes(
				`${safeFileStem(studio.active?.name ?? 'skin')}-render.png`,
				[{ name: 'PNG', extensions: ['png'] }],
				new Uint8Array(await blob.arrayBuffer()),
			)
			if (saved) notify('info', t('export.saved'))
		}
	} catch (error) {
		notify('error', t('export.failed', { message: (error as Error).message }))
	}
}

let channel: BroadcastChannel | null = null
let previewWindow: WebviewWindow | null = null

function broadcastPreview(): void {
	const doc = studio.active
	if (!channel || !doc) return
	const message: PreviewMessage = {
		type: 'document',
		name: doc.name,
		model: JSON.parse(JSON.stringify(doc.model)),
		width: doc.image.width,
		height: doc.image.height,
		pixels: doc.image.data.slice().buffer,
		visibility: JSON.parse(JSON.stringify(studio.visibility)),
		transparency: studio.prefs.transparency,
	}
	channel.postMessage(message)
}

async function openPopout(): Promise<void> {
	if (!channel) {
		channel = new BroadcastChannel(PREVIEW_CHANNEL)
		channel.onmessage = (event: MessageEvent<PreviewMessage>) => {
			if (event.data?.type === 'hello') broadcastPreview()
		}
	}
	try {
		const existing = await WebviewWindow.getByLabel('skin-studio-preview')
		if (existing) {
			await existing.setFocus()
			broadcastPreview()
			return
		}
		previewWindow = new WebviewWindow('skin-studio-preview', {
			url: 'index.html?eden-skin-preview=1',
			title: t('preview.title', { name: studio.active?.name ?? '' }),
			width: 520,
			height: 640,
			minWidth: 320,
			minHeight: 360,
		})
		previewWindow.once('tauri://error', (event) =>
			notify('error', t('error.generic', { message: String(event.payload) })),
		)
	} catch (error) {
		notify('error', t('error.generic', { message: (error as Error).message }))
	}
}

let previewTimer: ReturnType<typeof setTimeout> | null = null
watch(
	() => [studio.revision, studio.activeId],
	() => {
		if (!channel || previewTimer) return
		previewTimer = setTimeout(() => {
			previewTimer = null
			broadcastPreview()
		}, 120)
	},
)

function runShortcut(action: ShortcutAction): boolean {
	switch (action) {
		case 'edit.undo':
			studio.undoActive()
			return true
		case 'edit.redo':
			studio.redoActive()
			return true
		case 'edit.clearSelection':
			studio.selection = null
			return true
		case 'file.new':
			customModel.value = null
			dialogs.value.new = true
			return true
		case 'file.open':
			studio.tab = 'library'
			return true
		case 'file.save':
			void save(false)
			return true
		case 'file.saveAs':
			void save(true)
			return true
		case 'file.saveAll':
			void saveAll()
			return true
		case 'file.export':
			if (studio.active) dialogs.value.export = true
			return true
		case 'view.toggleMode':
			studio.prefs.viewMode =
				studio.prefs.viewMode === '3d' ? '2d' : studio.prefs.viewMode === '2d' ? 'split' : '3d'
			return true
		case 'view.toggleOverlay':
			studio.visibility.overlayGlobal = !studio.visibility.overlayGlobal
			return true
		case 'view.toggleGrid':
			studio.prefs.grid = !studio.prefs.grid
			return true
		case 'view.toggleTransparency':
			studio.prefs.transparency =
				studio.prefs.transparency === 'off'
					? 'helmet'
					: studio.prefs.transparency === 'helmet'
						? 'all'
						: 'off'
			return true
		case 'view.resetCamera':
			editor.value?.resetCamera()
			return true
		case 'view.zoomIn':
			editor.value?.zoom(1)
			return true
		case 'view.zoomOut':
			editor.value?.zoom(-1)
			return true
		case 'view.screenshotClipboard':
			void screenshotTo('clipboard')
			return true
		case 'view.screenshotSave':
			void screenshotTo('file')
			return true
		case 'color.swap':
			studio.swapColors()
			return true
		case 'brush.bigger':
			studio.settings.brushSize = Math.min(64, studio.settings.brushSize + 1)
			return true
		case 'brush.smaller':
			studio.settings.brushSize = Math.max(1, studio.settings.brushSize - 1)
			return true
		case 'brush.mirror':
			studio.settings.mirror = !studio.settings.mirror
			return true
		default:
			if (action.startsWith('tool.')) {
				studio.tool = action.slice(5) as typeof studio.tool
				return true
			}
			return false
	}
}

function anyDialogOpen(): boolean {
	return (
		Object.values(dialogs.value).some(Boolean) ||
		!!prompt.value ||
		!!confirmState.value ||
		!!unsaved.value
	)
}

function onKeyDown(event: KeyboardEvent): void {
	if (event.defaultPrevented || anyDialogOpen()) return
	if (isTypingTarget(event.target as HTMLElement | null)) return
	const action = actionForEvent(studio.shortcuts, event)
	if (!action) return
	if (studio.tab !== 'editor' && !action.startsWith('file.')) return
	if (runShortcut(action)) event.preventDefault()
}

let unlistenDrop: (() => void) | null = null
let disposed = false

async function listenForDrops(): Promise<void> {
	const stop = await getCurrentWebview().onDragDropEvent(async (event) => {
		if (event.payload.type !== 'drop') return
		const files: PickedFile[] = []
		for (const path of event.payload.paths.slice(0, 32)) {
			try {
				files.push({
					name: path.split(/[\\/]/).pop() ?? path,
					bytes: await api.readDroppedFile(path),
				})
			} catch (error) {
				notify(
					'error',
					t('library.importFailed', { name: path, message: (error as Error).message }),
				)
			}
		}
		await importFiles(files)
	})
	if (disposed) stop()
	else unlistenDrop = stop
}

async function restoreRecovery(): Promise<void> {
	const count = await studio.restoreRecovery()
	if (count) studio.tab = 'editor'
}

watch(
	() => ({ ...theme.$state }),
	() => setTimeout(readThemeBackground, 50),
	{ deep: true },
)

onMounted(async () => {
	readThemeBackground()
	window.addEventListener('keydown', onKeyDown)
	window.addEventListener(ACCOUNTS_CHANGED_EVENT, refreshAccounts)
	window.addEventListener('focus', refreshAccounts)
	await studio.init()
	if (disposed) return
	listenForDrops().catch(() => undefined)
})

onBeforeUnmount(() => {
	disposed = true
	window.removeEventListener('keydown', onKeyDown)
	window.removeEventListener(ACCOUNTS_CHANGED_EVENT, refreshAccounts)
	window.removeEventListener('focus', refreshAccounts)
	unlistenDrop?.()
	void studio.snapshotRecovery()
	if (previewTimer) clearTimeout(previewTimer)
	channel?.close()
	channel = null
})

function refreshAccounts(): void {
	void studio.refreshAccounts()
}
</script>

<template>
	<div class="studio-page">
		<header class="studio-page__header">
			<div>
				<div class="studio-page__eyebrow">{{ t('page.eyebrow') }}</div>
				<h1>{{ t('page.title') }}</h1>
				<p>{{ t('page.subtitle') }}</p>
			</div>
			<div class="studio-page__actions">
				<RouterLink
					v-if="studio.selectedAccount?.type === 'microsoft'"
					to="/skins/wardrobe"
					class="studio-btn"
				>
					<StudioIcon name="account" /> {{ t('action.wardrobe') }}
				</RouterLink>
				<button
					v-tooltip="t('action.settings')"
					type="button"
					class="studio-btn"
					:aria-label="t('action.settings')"
					@click="dialogs.settings = true"
				>
					<StudioIcon name="settings" />
				</button>
				<button
					type="button"
					class="studio-btn"
					:disabled="!studio.active"
					@click="dialogs.export = true"
				>
					<StudioIcon name="export" /> {{ t('action.export') }}
				</button>
				<button
					type="button"
					class="studio-btn studio-btn--primary"
					:disabled="!studio.active"
					@click="save(false)"
				>
					<StudioIcon name="save" /> {{ t('action.save') }}
				</button>
			</div>
		</header>

		<div v-if="studio.recoveryFound.length" class="studio-page__recovery" role="status">
			<span>{{ t('recovery.body', { count: studio.recoveryFound.length }) }}</span>
			<div>
				<button
					type="button"
					class="studio-btn studio-btn--small studio-btn--primary"
					@click="restoreRecovery"
				>
					{{ t('recovery.restore') }}
				</button>
				<button
					type="button"
					class="studio-btn studio-btn--small"
					@click="studio.discardRecovery()"
				>
					{{ t('recovery.dismiss') }}
				</button>
			</div>
		</div>

		<nav class="studio-page__tabs" role="tablist" :aria-label="t('page.title')">
			<button
				v-for="tab in tabs"
				:key="tab.id"
				type="button"
				role="tab"
				:aria-selected="studio.tab === tab.id"
				:class="{ active: studio.tab === tab.id }"
				@click="studio.tab = tab.id"
			>
				{{ t(tab.key) }}
				<span v-if="tab.id === 'library'" class="studio-page__count">{{ projectCount }}</span>
			</button>
		</nav>

		<div
			class="studio-page__body"
			:class="{ 'studio-page__body--editor': studio.tab === 'editor' }"
		>
			<StudioEditor
				v-show="studio.tab === 'editor'"
				ref="editor"
				:theme-background="themeBackground"
				:saving-png="savingPng"
				@new="((customModel = null), (dialogs.new = true))"
				@close="requestClose"
				@models="dialogs.models = true"
				@convert="dialogs.convert = true"
				@screenshot="dialogs.export = true"
				@popout="openPopout"
				@apply-microsoft="openApply({ kind: 'microsoft' })"
				@apply-ely="dialogs.ely = true"
				@export-png="saveSkinPng"
				@server-help="dialogs.serverHelp = true"
				@prompt="askPrompt"
				@notify="notify"
			/>
			<StudioLibrary
				v-if="studio.tab === 'library'"
				@new="((customModel = null), (dialogs.new = true))"
				@import="importDialog"
				@fetch="dialogs.fetch = true"
				@template="openTemplate"
				@prompt="askPrompt"
				@confirm="askConfirm"
				@notify="notify"
			/>
			<StudioCapes
				v-if="studio.tab === 'capes'"
				@cape-template="openCapeTemplate"
				@server-help="dialogs.serverHelp = true"
				@notify="notify"
			/>
		</div>

		<footer class="studio-page__footer">
			<span>{{ footerText }}</span>
			<span>{{ footerHints }}</span>
		</footer>

		<StudioNewDialog
			:open="dialogs.new"
			:custom-model="customModel"
			@close="dialogs.new = false"
			@create="createDocument"
			@models="((modelsForNew = true), (dialogs.models = true))"
		/>
		<StudioModelsDialog
			:open="dialogs.models"
			@close="dialogs.models = false"
			@choose="chooseModel"
			@notify="notify"
		/>
		<StudioConvertDialog :open="dialogs.convert" @close="dialogs.convert = false" />
		<StudioExportDialog
			:open="dialogs.export"
			:screenshot="(w, h, transparent) => editor?.screenshot(w, h, transparent) ?? null"
			@close="dialogs.export = false"
			@notify="notify"
		/>
		<StudioApplyDialog :open="dialogs.apply" :mode="applyMode" @close="dialogs.apply = false" />
		<StudioServerUploadDialog
			:open="dialogs.serverHelp"
			:saving="savingPng"
			@close="dialogs.serverHelp = false"
			@save="saveSkinPng"
			@notify="notify"
		/>
		<StudioFetchDialog :open="dialogs.fetch" @close="dialogs.fetch = false" @fetched="onFetched" />
		<StudioSettingsDialog
			:open="dialogs.settings"
			@close="dialogs.settings = false"
			@notify="notify"
		/>

		<StudioDialog :open="dialogs.ely" :title="t('ely.title')" @close="dialogs.ely = false">
			<p>{{ t('ely.body') }}</p>
			<p class="studio-note">{{ t('ely.fallback') }}</p>
			<template #actions>
				<button type="button" class="studio-btn" @click="dialogs.ely = false">
					{{ t('action.cancel') }}
				</button>
				<button type="button" class="studio-btn studio-btn--primary" @click="exportForEly">
					{{ t('ely.export') }}
				</button>
			</template>
		</StudioDialog>

		<StudioDialog :open="!!prompt" :title="prompt?.title ?? ''" @close="finishPrompt(false)">
			<form class="studio-page__prompt" @submit.prevent="finishPrompt(true)">
				<input v-model="promptValue" class="studio-input" type="text" maxlength="80" autofocus />
				<div class="studio-page__prompt-actions">
					<button type="button" class="studio-btn" @click="finishPrompt(false)">
						{{ t('action.cancel') }}
					</button>
					<button type="submit" class="studio-btn studio-btn--primary">
						{{ t('action.confirm') }}
					</button>
				</div>
			</form>
		</StudioDialog>

		<StudioDialog
			:open="!!confirmState"
			:title="confirmState?.title ?? ''"
			@close="finishConfirm(false)"
		>
			<p>{{ confirmState?.body }}</p>
			<template #actions>
				<button type="button" class="studio-btn" @click="finishConfirm(false)">
					{{ t('action.cancel') }}
				</button>
				<button type="button" class="studio-btn studio-btn--danger" @click="finishConfirm(true)">
					{{ t('action.confirm') }}
				</button>
			</template>
		</StudioDialog>

		<StudioDialog :open="!!unsaved" :title="t('unsaved.title')" @close="resolveUnsaved('cancel')">
			<p>{{ t('unsaved.body', { name: unsaved?.name ?? '' }) }}</p>
			<template #actions>
				<button type="button" class="studio-btn" @click="resolveUnsaved('cancel')">
					{{ t('action.cancel') }}
				</button>
				<button
					type="button"
					class="studio-btn studio-btn--danger"
					@click="resolveUnsaved('discard')"
				>
					{{ t('action.discard') }}
				</button>
				<button
					type="button"
					class="studio-btn studio-btn--primary"
					@click="resolveUnsaved('save')"
				>
					{{ t('unsaved.save') }}
				</button>
			</template>
		</StudioDialog>

		<div class="studio-toasts" aria-live="polite">
			<div
				v-for="toast in toasts"
				:key="toast.id"
				class="studio-toast"
				:class="`studio-toast--${toast.kind}`"
				:role="toast.kind === 'error' ? 'alert' : 'status'"
			>
				{{ toast.text }}
			</div>
		</div>
	</div>
</template>

<style scoped lang="scss">
.studio-page {
	display: flex;
	height: 100%;
	min-height: 0;
	flex-direction: column;
	gap: 14px;
	padding: 22px 26px 14px;
	color: var(--eden-text);
}

.studio-page__body {
	display: flex;
	min-height: 0;
	flex: 1;
	flex-direction: column;
	overflow-y: auto;

	&--editor {
		overflow: hidden;
	}
}

.studio-page__header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 20px;

	h1 {
		margin: 5px 0 4px;
		color: var(--eden-text);
		font-size: 27px;
		letter-spacing: -0.8px;
	}

	p {
		margin: 0;
		color: var(--eden-text-secondary);
		font-size: 12px;
	}
}

.studio-page__eyebrow {
	color: var(--eden-accent);
	font-size: 10px;
	font-weight: 700;
	letter-spacing: 1.9px;
	text-transform: uppercase;
}

.studio-page__actions {
	display: flex;
	gap: 8px;
}

.studio-page__recovery {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	padding: 10px 14px;
	border: 1px solid var(--eden-accent);
	border-radius: 10px;
	background: color-mix(in srgb, var(--eden-accent) 10%, var(--eden-surface));
	font-size: 13px;

	div {
		display: flex;
		gap: 6px;
	}
}

.studio-page__tabs {
	display: flex;
	gap: 24px;
	border-bottom: 1px solid var(--eden-border);

	button {
		padding: 9px 0 12px;
		border: 0;
		border-bottom: 2px solid transparent;
		color: var(--eden-text-secondary);
		background: transparent;
		font-size: 14px;
		cursor: pointer;

		&.active {
			border-bottom-color: var(--eden-accent);
			color: var(--eden-text);
		}

		&:focus-visible {
			outline: 2px solid var(--eden-accent);
			outline-offset: 2px;
		}
	}
}

.studio-page__count {
	margin-left: 6px;
	color: var(--eden-text-secondary);
}

.studio-page__footer {
	display: flex;
	flex-wrap: wrap;
	justify-content: space-between;
	gap: 8px;
	color: var(--eden-text-secondary);
	font-size: 10px;
}

.studio-page__prompt {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.studio-page__prompt-actions {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
}

.studio-toasts {
	position: fixed;
	z-index: 30;
	right: 24px;
	bottom: 24px;
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-width: min(420px, calc(100vw - 48px));
	pointer-events: none;
}

.studio-toast {
	padding: 10px 14px;
	border: 1px solid var(--eden-border);
	border-left: 3px solid var(--eden-success);
	border-radius: 10px;
	color: var(--eden-text);
	background: var(--eden-surface-raised);
	box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
	font-size: 13px;
	pointer-events: auto;

	&--error {
		border-left-color: var(--eden-error);
	}
}
</style>
