export type ShortcutAction =
	| 'tool.pencil'
	| 'tool.eraser'
	| 'tool.dropper'
	| 'tool.fill'
	| 'tool.noise'
	| 'tool.dodgeBurn'
	| 'tool.darkenLighten'
	| 'tool.stamp'
	| 'tool.select'
	| 'tool.camera'
	| 'edit.undo'
	| 'edit.redo'
	| 'edit.clearSelection'
	| 'file.new'
	| 'file.open'
	| 'file.save'
	| 'file.saveAs'
	| 'file.saveAll'
	| 'file.export'
	| 'view.toggleMode'
	| 'view.toggleOverlay'
	| 'view.toggleGrid'
	| 'view.toggleTransparency'
	| 'view.resetCamera'
	| 'view.zoomIn'
	| 'view.zoomOut'
	| 'view.screenshotClipboard'
	| 'view.screenshotSave'
	| 'color.swap'
	| 'brush.bigger'
	| 'brush.smaller'
	| 'brush.mirror'

export type ShortcutMap = Record<ShortcutAction, string>

export const DEFAULT_SHORTCUTS: ShortcutMap = {
	'tool.pencil': 'B',
	'tool.eraser': 'E',
	'tool.dropper': 'I',
	'tool.fill': 'G',
	'tool.noise': 'N',
	'tool.dodgeBurn': 'O',
	'tool.darkenLighten': 'D',
	'tool.stamp': 'S',
	'tool.select': 'M',
	'tool.camera': 'C',
	'edit.undo': 'Ctrl+Z',
	'edit.redo': 'Ctrl+Y',
	'edit.clearSelection': 'Ctrl+D',
	'file.new': 'Ctrl+N',
	'file.open': 'Ctrl+O',
	'file.save': 'Ctrl+S',
	'file.saveAs': 'Ctrl+Shift+S',
	'file.saveAll': 'Ctrl+Alt+S',
	'file.export': 'Ctrl+E',
	'view.toggleMode': 'V',
	'view.toggleOverlay': 'H',
	'view.toggleGrid': 'Ctrl+G',
	'view.toggleTransparency': 'T',
	'view.resetCamera': 'Home',
	'view.zoomIn': '=',
	'view.zoomOut': '-',
	'view.screenshotClipboard': 'Ctrl+Shift+C',
	'view.screenshotSave': 'Ctrl+Shift+P',
	'color.swap': 'X',
	'brush.bigger': ']',
	'brush.smaller': '[',
	'brush.mirror': 'Shift+M',
}

export const SHORTCUT_ACTIONS = Object.keys(DEFAULT_SHORTCUTS) as ShortcutAction[]

export interface KeyLike {
	key: string
	code: string
	ctrlKey: boolean
	altKey: boolean
	shiftKey: boolean
	metaKey: boolean
}

const CODE_NAMES: Record<string, string> = {
	BracketLeft: '[',
	BracketRight: ']',
	Minus: '-',
	Equal: '=',
	Comma: ',',
	Period: '.',
	Slash: '/',
	Backslash: '\\',
	Semicolon: ';',
	Quote: "'",
	Backquote: '`',
	NumpadAdd: '=',
	NumpadSubtract: '-',
}

const NAMED = new Set([
	'Home',
	'End',
	'Delete',
	'Insert',
	'PageUp',
	'PageDown',
	'Tab',
	'Space',
	'Enter',
	'Escape',
	'ArrowUp',
	'ArrowDown',
	'ArrowLeft',
	'ArrowRight',
	'F1',
	'F2',
	'F3',
	'F4',
	'F5',
	'F6',
	'F7',
	'F8',
	'F9',
	'F10',
	'F11',
	'F12',
])

/**
 * The key part of a combo from the physical key, so shortcuts work the same on the Russian
 * and English layouts. Returns null for bare modifier presses.
 */
export function keyName(event: KeyLike): string | null {
	const { code } = event
	if (/^Key[A-Z]$/.test(code)) return code.slice(3)
	if (/^Digit[0-9]$/.test(code)) return code.slice(5)
	if (/^Numpad[0-9]$/.test(code)) return code.slice(6)
	if (code in CODE_NAMES) return CODE_NAMES[code]
	if (code === 'Space') return 'Space'
	if (NAMED.has(code)) return code
	if (NAMED.has(event.key)) return event.key
	return null
}

export function comboFromEvent(event: KeyLike): string | null {
	const key = keyName(event)
	if (!key) return null
	const parts: string[] = []
	if (event.ctrlKey || event.metaKey) parts.push('Ctrl')
	if (event.altKey) parts.push('Alt')
	if (event.shiftKey) parts.push('Shift')
	parts.push(key)
	return parts.join('+')
}

/** Normalizes user input like "shift + ctrl + z" to "Ctrl+Shift+Z"; returns null if invalid. */
export function normalizeCombo(text: string): string | null {
	const parts = text
		.split('+')
		.map((p) => p.trim())
		.filter(Boolean)
	if (parts.length === 0) return null
	const mods = new Set<string>()
	let key: string | null = null
	for (const part of parts) {
		const lower = part.toLowerCase()
		if (lower === 'ctrl' || lower === 'control' || lower === 'cmd' || lower === 'meta') mods.add('Ctrl')
		else if (lower === 'alt' || lower === 'option') mods.add('Alt')
		else if (lower === 'shift') mods.add('Shift')
		else if (key) return null
		else if (/^[a-z0-9]$/i.test(part)) key = part.toUpperCase()
		else if (Object.values(CODE_NAMES).includes(part)) key = part
		else {
			const named = [...NAMED].find((n) => n.toLowerCase() === lower)
			if (!named) return null
			key = named
		}
	}
	if (!key) return null
	return [...['Ctrl', 'Alt', 'Shift'].filter((m) => mods.has(m)), key].join('+')
}

export function findConflicts(map: ShortcutMap): [ShortcutAction, ShortcutAction][] {
	const seen = new Map<string, ShortcutAction>()
	const conflicts: [ShortcutAction, ShortcutAction][] = []
	for (const action of SHORTCUT_ACTIONS) {
		const combo = map[action]
		if (!combo) continue
		const other = seen.get(combo)
		if (other) conflicts.push([other, action])
		else seen.set(combo, action)
	}
	return conflicts
}

/** Loads a stored map, keeping only valid, non-conflicting entries on top of the defaults. */
export function sanitizeShortcuts(stored: unknown): ShortcutMap {
	const map: ShortcutMap = { ...DEFAULT_SHORTCUTS }
	if (!stored || typeof stored !== 'object') return map
	for (const action of SHORTCUT_ACTIONS) {
		const value = (stored as Record<string, unknown>)[action]
		if (value === '') map[action] = ''
		else if (typeof value === 'string') {
			const combo = normalizeCombo(value)
			if (combo) map[action] = combo
		}
	}
	for (const [, later] of findConflicts(map)) map[later] = DEFAULT_SHORTCUTS[later]
	for (const [, later] of findConflicts(map)) map[later] = ''
	return map
}

export function actionForEvent(map: ShortcutMap, event: KeyLike): ShortcutAction | null {
	const combo = comboFromEvent(event)
	if (!combo) return null
	const alias = combo === 'Ctrl+Shift+Z' ? 'Ctrl+Y' : null
	for (const action of SHORTCUT_ACTIONS) {
		if (map[action] === combo) return action
	}
	if (alias && map['edit.redo'] === alias) return 'edit.redo'
	return null
}

interface TargetLike {
	tagName?: string
	type?: string
	isContentEditable?: boolean
}

const TYPING_INPUTS = new Set(['text', 'search', 'email', 'number', 'password', 'url', 'tel', ''])

/** Shortcuts must not fire while the user types into a field. */
export function isTypingTarget(target: TargetLike | null | undefined): boolean {
	if (!target) return false
	if (target.isContentEditable) return true
	const tag = (target.tagName ?? '').toUpperCase()
	if (tag === 'TEXTAREA' || tag === 'SELECT') return true
	if (tag === 'INPUT') return TYPING_INPUTS.has((target.type ?? '').toLowerCase())
	return false
}
