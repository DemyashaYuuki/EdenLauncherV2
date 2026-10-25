import { defineStore } from 'pinia'
import { computed, reactive, ref, shallowReactive, shallowRef, triggerRef, watch } from 'vue'

import edenPalette from '@/assets/eden/skin-studio/palettes/eden-palette.json'
import signalPalette from '@/assets/eden/skin-studio/palettes/signal-palette.json'
import skinTonesPalette from '@/assets/eden/skin-studio/palettes/skin-tones-palette.json'
import { get_default_user, users } from '@/helpers/auth'
import * as api from '@/helpers/skin-studio'

import {
	commitPatch,
	createDocument,
	fromProject,
	isDirty,
	jumpTo,
	markSaved,
	redo,
	rename,
	replaceTexture,
	type SkinDocument,
	toProject,
	undo,
} from './engine/document.ts'
import { cloneImage, createImage, type Rgba, type RgbaImage } from './engine/image.ts'
import { builtinModel, type ModelDefinition, type Rect, remoteVariant } from './engine/model.ts'
import {
	defaultToolSettings,
	type Patch,
	type StampPattern,
	type ToolId,
	type ToolSettings,
} from './engine/paint.ts'
import { type Palette, parseJsonPalette } from './engine/palette.ts'
import {
	importPngTexture,
	parseProject,
	PROJECT_EXTENSION,
	safeFileStem,
	serializeProject,
	uniqueStem,
} from './engine/project.ts'
import { DEFAULT_SHORTCUTS, sanitizeShortcuts, type ShortcutMap } from './engine/shortcuts.ts'
import type { PaintTarget, TransparencyMode } from './render/scene.ts'

export type ViewMode = '3d' | '2d' | 'split'
export type StudioTab = 'editor' | 'library' | 'capes'

export interface StudioPrefs {
	viewMode: ViewMode
	grid: boolean
	gridOpacity: number
	regions: boolean
	alphaChecker: boolean
	backgroundMode: 'theme' | 'color'
	backgroundColor: string
	grass: boolean
	lighting: boolean
	animate: boolean
	followCursor: boolean
	multisampling: boolean
	transparency: TransparencyMode
	protectHidden: boolean
	recovery: boolean
	paintTarget: PaintTarget
}

export interface StudioAccount {
	id: string
	name: string
	type: 'microsoft' | 'elyby' | 'offline' | 'other'
	active: boolean
}

export interface UserPalette extends Palette {
	id: string
	builtin: boolean
}

const PREFS_KEY = 'eden-skin-studio:prefs'
const SHORTCUTS_KEY = 'eden-skin-studio:shortcuts'
const PALETTES_KEY = 'eden-skin-studio:palettes'
const COLORS_KEY = 'eden-skin-studio:colors'
const TOOL_KEY = 'eden-skin-studio:tool'
const RECOVERY_INTERVAL_MS = 15_000
const MAX_USER_PALETTES = 64

export const DEFAULT_PREFS: StudioPrefs = {
	viewMode: 'split',
	grid: true,
	gridOpacity: 0.35,
	regions: false,
	alphaChecker: true,
	backgroundMode: 'theme',
	backgroundColor: '#1a1626',
	grass: false,
	lighting: true,
	animate: false,
	followCursor: false,
	multisampling: true,
	transparency: 'helmet',
	protectHidden: true,
	recovery: true,
	paintTarget: 'auto',
}

function readStorage<T>(key: string): T | null {
	try {
		const raw = localStorage.getItem(key)
		return raw ? (JSON.parse(raw) as T) : null
	} catch {
		return null
	}
}

function writeStorage(key: string, value: unknown): void {
	try {
		localStorage.setItem(key, JSON.stringify(value))
	} catch {
		/* storage is a convenience; ignore quota and privacy-mode failures */
	}
}

function loadPrefs(): StudioPrefs {
	const stored = readStorage<Partial<StudioPrefs>>(PREFS_KEY) ?? {}
	const prefs = { ...DEFAULT_PREFS }
	for (const key of Object.keys(DEFAULT_PREFS) as (keyof StudioPrefs)[]) {
		const value = stored[key]
		if (value !== undefined && typeof value === typeof DEFAULT_PREFS[key]) {
			;(prefs as Record<string, unknown>)[key] = value
		}
	}
	prefs.gridOpacity = Math.min(1, Math.max(0.05, prefs.gridOpacity))
	if (!['3d', '2d', 'split'].includes(prefs.viewMode)) prefs.viewMode = 'split'
	if (!['off', 'helmet', 'all'].includes(prefs.transparency)) prefs.transparency = 'helmet'
	if (!['auto', 'base', 'overlay'].includes(prefs.paintTarget)) prefs.paintTarget = 'auto'
	if (!/^#[0-9a-fA-F]{6}$/.test(prefs.backgroundColor))
		prefs.backgroundColor = DEFAULT_PREFS.backgroundColor
	return prefs
}

function builtinPalettes(): UserPalette[] {
	return [
		{
			id: 'eden',
			...parseJsonPalette(JSON.stringify(edenPalette), 'Eden'),
			name: 'Eden',
			builtin: true,
		},
		{
			id: 'signal',
			...parseJsonPalette(JSON.stringify(signalPalette), 'Signal'),
			name: 'Signal',
			builtin: true,
		},
		{
			id: 'skin-tones',
			...parseJsonPalette(JSON.stringify(skinTonesPalette), 'Skin tones'),
			name: 'Skin tones',
			builtin: true,
		},
	]
}

function loadUserPalettes(): UserPalette[] {
	const stored = readStorage<UserPalette[]>(PALETTES_KEY)
	if (!Array.isArray(stored)) return []
	return stored
		.filter((p) => p && typeof p.id === 'string' && Array.isArray(p.swatches))
		.slice(0, MAX_USER_PALETTES)
		.map((p) => ({
			id: p.id.slice(0, 64),
			name: String(p.name ?? 'Palette').slice(0, 64),
			builtin: false,
			swatches: p.swatches
				.slice(0, 4096)
				.filter((s) => [s.r, s.g, s.b, s.a].every((v) => Number.isInteger(v) && v >= 0 && v <= 255))
				.map((s) => ({
					r: s.r,
					g: s.g,
					b: s.b,
					a: s.a,
					name: s.name ? String(s.name).slice(0, 64) : undefined,
				})),
		}))
}

function accountType(type: string): StudioAccount['type'] {
	if (type === 'microsoft' || type === 'offline' || type === 'elyby') return type
	return 'other'
}

export const useSkinStudio = defineStore('skin-studio', () => {
	const prefs = reactive<StudioPrefs>(loadPrefs())
	const shortcuts = ref<ShortcutMap>(sanitizeShortcuts(readStorage(SHORTCUTS_KEY)))
	const palettes = ref<UserPalette[]>([...builtinPalettes(), ...loadUserPalettes()])
	const activePaletteId = ref<string>('eden')

	const storedColors = readStorage<{ primary?: Rgba; secondary?: Rgba }>(COLORS_KEY)
	const validColor = (c: unknown): c is Rgba =>
		Array.isArray(c) && c.length === 4 && c.every((v) => Number.isInteger(v) && v >= 0 && v <= 255)
	const primary = ref<Rgba>(
		validColor(storedColors?.primary) ? storedColors.primary : [128, 225, 203, 255],
	)
	const secondary = ref<Rgba>(
		validColor(storedColors?.secondary) ? storedColors.secondary : [24, 19, 33, 255],
	)

	const storedTool = readStorage<{ tool?: ToolId; settings?: Partial<ToolSettings> }>(TOOL_KEY)
	const tool = ref<ToolId>(storedTool?.tool ?? 'pencil')
	const settings = reactive<ToolSettings>({
		...defaultToolSettings(),
		...(storedTool?.settings ?? {}),
		customBrush: null,
	})

	const tab = ref<StudioTab>('editor')
	const documents = shallowRef<SkinDocument[]>([])
	const activeId = ref<string | null>(null)
	const revision = ref(0)
	const selection = ref<Rect | null>(null)
	const pattern = shallowRef<StampPattern | null>(null)
	const hover = ref<{ part: string; face: string; layer: 'base' | 'overlay' } | null>(null)
	const visibility = reactive({
		parts: {} as Record<string, boolean>,
		overlay: {} as Record<string, boolean>,
		overlayGlobal: true,
		ghost: false,
	})

	const library = ref<api.LibraryEntry[]>([])
	const libraryInfo = ref<api.LibraryInfo | null>(null)
	const libraryError = ref<string | null>(null)
	const libraryLoading = ref(false)
	const trash = ref<api.TrashEntry[]>([])
	const currentFolder = ref('')
	const recoveryFound = ref<api.RecoveryEntry[]>([])
	const accounts = ref<StudioAccount[]>([])
	const accountsLoading = ref(true)
	const accountsError = ref(false)
	const selectedAccountId = ref<string | null>(null)
	let accountRequest = 0
	let lastDefaultAccountId: string | null = null
	const bridge = ref<api.BridgeStatus | null>(null)
	const initialized = ref(false)

	const active = computed<SkinDocument | null>(() => {
		void revision.value
		return documents.value.find((d) => d.id === activeId.value) ?? null
	})
	const dirtyDocuments = computed(() => {
		void revision.value
		return documents.value.filter((d) => isDirty(d))
	})
	const selectedAccount = computed(
		() => accounts.value.find((a) => a.id === selectedAccountId.value) ?? null,
	)
	const activePalette = computed(
		() => palettes.value.find((p) => p.id === activePaletteId.value) ?? palettes.value[0],
	)

	watch(prefs, () => writeStorage(PREFS_KEY, prefs), { deep: true })
	watch(shortcuts, () => writeStorage(SHORTCUTS_KEY, shortcuts.value), { deep: true })
	watch([primary, secondary], () =>
		writeStorage(COLORS_KEY, { primary: primary.value, secondary: secondary.value }),
	)
	watch(
		[tool, () => ({ ...settings })],
		() => {
			const { customBrush: _ignored, ...rest } = settings
			writeStorage(TOOL_KEY, { tool: tool.value, settings: rest })
		},
		{ deep: true },
	)
	watch(
		palettes,
		() =>
			writeStorage(
				PALETTES_KEY,
				palettes.value.filter((p) => !p.builtin),
			),
		{ deep: true },
	)

	function touch(): void {
		revision.value++
		triggerRef(documents)
	}

	function resetVisibility(model: ModelDefinition): void {
		for (const key of Object.keys(visibility.parts)) Reflect.deleteProperty(visibility.parts, key)
		for (const key of Object.keys(visibility.overlay))
			Reflect.deleteProperty(visibility.overlay, key)
		for (const part of model.parts) {
			visibility.parts[part.id] = true
			visibility.overlay[part.id] = true
		}
	}

	function activate(id: string): void {
		const doc = documents.value.find((d) => d.id === id)
		if (!doc) return
		activeId.value = id
		selection.value = null
		resetVisibility(doc.model)
		tab.value = 'editor'
		touch()
	}

	function addDocument(doc: SkinDocument): SkinDocument {
		const raw = shallowReactive(doc)
		documents.value = [...documents.value, raw]
		activate(raw.id)
		return raw
	}

	function newDocument(name: string, model: ModelDefinition, image?: RgbaImage): SkinDocument {
		const texture = image ?? createImage(model.textureWidth, model.textureHeight)
		return addDocument(createDocument({ name, model, image: texture }))
	}

	function closeDocument(id: string): void {
		documents.value = documents.value.filter((d) => d.id !== id)
		api.deleteRecovery(id).catch(() => undefined)
		if (activeId.value === id) {
			const next = documents.value[documents.value.length - 1]
			activeId.value = next?.id ?? null
			if (next) resetVisibility(next.model)
		}
		touch()
	}

	function commit(label: string, patch: Patch | null): void {
		const doc = active.value
		if (!doc || !patch) return
		commitPatch(doc, label, patch)
		touch()
	}

	function replace(label: string, image: RgbaImage, model?: ModelDefinition): void {
		const doc = active.value
		if (!doc) return
		const modelChanged = model && model.id !== doc.model.id
		replaceTexture(doc, label, image, model ?? doc.model)
		if (modelChanged) resetVisibility(doc.model)
		selection.value = null
		touch()
	}

	function undoActive(): void {
		const doc = active.value
		if (!doc) return
		const before = doc.model.id
		if (undo(doc)) {
			if (doc.model.id !== before) resetVisibility(doc.model)
			touch()
		}
	}

	function redoActive(): void {
		const doc = active.value
		if (!doc) return
		const before = doc.model.id
		if (redo(doc)) {
			if (doc.model.id !== before) resetVisibility(doc.model)
			touch()
		}
	}

	function jumpActive(position: number): void {
		const doc = active.value
		if (!doc) return
		const before = doc.model.id
		jumpTo(doc, position)
		if (doc.model.id !== before) resetVisibility(doc.model)
		touch()
	}

	function renameActive(name: string): void {
		const doc = active.value
		if (!doc) return
		rename(doc, name)
		touch()
	}

	async function refreshLibrary(): Promise<void> {
		libraryLoading.value = true
		try {
			libraryInfo.value = await api.libraryInfo()
			library.value = await api.listLibrary()
			trash.value = await api.listTrash()
			libraryError.value = null
		} catch (error) {
			libraryError.value = error instanceof Error ? error.message : String(error)
		} finally {
			libraryLoading.value = false
		}
	}

	function libraryPathFor(stem: string, folder = currentFolder.value): string {
		const existing = library.value
			.filter((e) => e.kind === 'project')
			.map((e) => e.path)
			.filter((p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '') === folder)
			.map((p) => p.slice(p.lastIndexOf('/') + 1, -(PROJECT_EXTENSION.length + 1)))
		const name = uniqueStem(safeFileStem(stem), existing)
		return `${folder ? `${folder}/` : ''}${name}.${PROJECT_EXTENSION}`
	}

	async function saveDocument(doc: SkinDocument, saveAs = false, asName?: string): Promise<string> {
		let path = doc.path
		if (!path || saveAs) {
			if (asName) rename(doc, asName)
			path = libraryPathFor(doc.name)
		}
		const savedVersion = doc.version
		const savedEntryId = doc.history.currentEntryId
		const bytes = await serializeProject(toProject(doc))
		await api.writeLibraryFile(path, bytes, path === doc.path)
		if (doc.version === savedVersion) {
			markSaved(doc, path)
			await api.deleteRecovery(doc.id).catch(() => undefined)
			lastSnapshot.delete(doc.id)
		} else {
			doc.path = path
			doc.savedEntryId = savedEntryId
		}
		touch()
		await refreshLibrary()
		return path
	}

	async function saveAll(): Promise<number> {
		let saved = 0
		for (const doc of documents.value) {
			if (isDirty(doc) || !doc.path) {
				await saveDocument(doc)
				saved++
			}
		}
		return saved
	}

	async function openLibraryEntry(path: string): Promise<SkinDocument> {
		const open = documents.value.find((d) => d.path === path)
		if (open) {
			activate(open.id)
			return open
		}
		const bytes = await api.readLibraryFile(path)
		if (path.toLowerCase().endsWith('.png')) {
			const { image, model } = await importPngTexture(bytes)
			const name = path.slice(path.lastIndexOf('/') + 1, -4)
			return addDocument(createDocument({ name, model, image }))
		}
		const project = await parseProject(bytes)
		return addDocument(fromProject(project, path, true))
	}

	async function openProjectBytes(bytes: Uint8Array): Promise<SkinDocument> {
		const project = await parseProject(bytes)
		return addDocument(fromProject(project, null, false))
	}

	async function importPng(name: string, bytes: Uint8Array): Promise<SkinDocument> {
		const { image, model } = await importPngTexture(bytes)
		return addDocument(createDocument({ name: name.slice(0, 80) || 'Skin', model, image }))
	}

	const lastSnapshot = new Map<string, number>()
	let recoveryTimer: ReturnType<typeof setInterval> | null = null

	async function snapshotRecovery(): Promise<void> {
		if (!prefs.recovery) return
		for (const doc of documents.value) {
			if (!isDirty(doc)) continue
			if (lastSnapshot.get(doc.id) === doc.version) continue
			const version = doc.version
			try {
				await api.putRecovery(doc.id, await serializeProject(toProject(doc)))
				lastSnapshot.set(doc.id, version)
			} catch {
				return
			}
		}
	}

	async function restoreRecovery(): Promise<number> {
		let restored = 0
		for (const entry of recoveryFound.value) {
			try {
				const project = await parseProject(await api.getRecovery(entry.doc_id))
				const doc = fromProject(project, null, false, entry.doc_id)
				doc.metaDirty = true
				addDocument(doc)
				restored++
			} catch {
				await api.deleteRecovery(entry.doc_id).catch(() => undefined)
			}
		}
		recoveryFound.value = []
		return restored
	}

	async function discardRecovery(): Promise<void> {
		for (const entry of recoveryFound.value)
			await api.deleteRecovery(entry.doc_id).catch(() => undefined)
		recoveryFound.value = []
	}

	async function refreshAccounts(): Promise<void> {
		const request = ++accountRequest
		accountsLoading.value = true
		try {
			const [list, defaultId] = (await Promise.all([users(), get_default_user()])) as [
				Array<{
					profile: { id: string; name: string }
					account_type: string
					active: boolean
				}>,
				string | null,
			]
			if (request !== accountRequest) return
			if (!Array.isArray(list)) throw new Error('Invalid account list')
			accounts.value = list.map((c) => ({
				id: c.profile.id,
				name: c.profile.name,
				type: accountType(c.account_type),
				active: defaultId ? c.profile.id === defaultId : c.active,
			}))
			if (
				defaultId !== lastDefaultAccountId ||
				!accounts.value.some((a) => a.id === selectedAccountId.value)
			) {
				selectedAccountId.value =
					accounts.value.find((a) => a.active)?.id ?? accounts.value[0]?.id ?? null
			}
			lastDefaultAccountId = defaultId
			accountsError.value = false
		} catch {
			if (request === accountRequest) accountsError.value = true
		} finally {
			if (request === accountRequest) accountsLoading.value = false
		}
	}

	async function refreshBridge(): Promise<void> {
		try {
			bridge.value = await api.bridgeStatus()
		} catch {
			bridge.value = null
		}
	}

	async function init(): Promise<void> {
		if (initialized.value) {
			await Promise.all([refreshAccounts(), refreshBridge()])
			return
		}
		initialized.value = true
		await Promise.all([refreshLibrary(), refreshAccounts(), refreshBridge()])
		try {
			const open = new Set(documents.value.map((d) => d.id))
			recoveryFound.value = (await api.listRecovery()).filter((r) => !open.has(r.doc_id))
		} catch {
			recoveryFound.value = []
		}
		if (!recoveryTimer)
			recoveryTimer = setInterval(() => void snapshotRecovery(), RECOVERY_INTERVAL_MS)
	}

	function setPalette(id: string): void {
		if (palettes.value.some((p) => p.id === id)) activePaletteId.value = id
	}

	function addPalette(palette: Palette): UserPalette {
		const entry: UserPalette = {
			id: `user-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
			name: palette.name.slice(0, 64) || 'Palette',
			swatches: palette.swatches.slice(0, 4096),
			builtin: false,
		}
		const user = palettes.value.filter((p) => !p.builtin)
		if (user.length >= MAX_USER_PALETTES) throw new Error('Too many palettes')
		palettes.value = [...palettes.value, entry]
		activePaletteId.value = entry.id
		return entry
	}

	function updatePalette(id: string, change: (p: UserPalette) => void): void {
		const palette = palettes.value.find((p) => p.id === id)
		if (!palette || palette.builtin) return
		change(palette)
		palettes.value = [...palettes.value]
	}

	function deletePalette(id: string): void {
		const palette = palettes.value.find((p) => p.id === id)
		if (!palette || palette.builtin) return
		palettes.value = palettes.value.filter((p) => p.id !== id)
		if (activePaletteId.value === id) activePaletteId.value = 'eden'
	}

	function swapColors(): void {
		const a = primary.value
		primary.value = secondary.value
		secondary.value = a
	}

	function resetShortcuts(): void {
		shortcuts.value = { ...DEFAULT_SHORTCUTS }
	}

	const canApplyRemotely = computed(() => {
		const doc = active.value
		if (!doc) return false
		const variant = remoteVariant(doc.model)
		return (
			!!variant && doc.image.width === 64 && (doc.image.height === 64 || doc.image.height === 32)
		)
	})

	function snapshotImage(): RgbaImage | null {
		return active.value ? cloneImage(active.value.image) : null
	}

	return {
		prefs,
		shortcuts,
		palettes,
		activePaletteId,
		activePalette,
		primary,
		secondary,
		tool,
		settings,
		tab,
		documents,
		activeId,
		active,
		revision,
		selection,
		pattern,
		hover,
		visibility,
		library,
		libraryInfo,
		libraryError,
		libraryLoading,
		trash,
		currentFolder,
		recoveryFound,
		accounts,
		accountsLoading,
		accountsError,
		selectedAccountId,
		selectedAccount,
		bridge,
		dirtyDocuments,
		canApplyRemotely,
		touch,
		activate,
		newDocument,
		closeDocument,
		commit,
		replace,
		undoActive,
		redoActive,
		jumpActive,
		renameActive,
		refreshLibrary,
		libraryPathFor,
		saveDocument,
		saveAll,
		openLibraryEntry,
		openProjectBytes,
		importPng,
		restoreRecovery,
		discardRecovery,
		snapshotRecovery,
		refreshAccounts,
		refreshBridge,
		init,
		setPalette,
		addPalette,
		updatePalette,
		deletePalette,
		swapColors,
		resetShortcuts,
		snapshotImage,
		resetVisibility,
		builtinModel,
	}
})
