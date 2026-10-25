import { cloneImage, type RgbaImage } from './image.ts'
import type { ModelDefinition } from './model.ts'
import { applyPatch, type Patch, patchBytes } from './paint.ts'

export type HistoryChange =
	| { kind: 'patch'; patch: Patch }
	| {
			kind: 'replace'
			before: RgbaImage
			after: RgbaImage
			modelBefore?: ModelDefinition
			modelAfter?: ModelDefinition
	  }

export interface HistoryEntry {
	id: number
	label: string
	change: HistoryChange
	bytes: number
	time: number
}

export interface HistoryLimits {
	maxEntries: number
	maxBytes: number
}

export const DEFAULT_HISTORY_LIMITS: HistoryLimits = {
	maxEntries: 200,
	maxBytes: 96 * 1024 * 1024,
}

function changeBytes(change: HistoryChange): number {
	if (change.kind === 'patch') return patchBytes(change.patch)
	return change.before.data.byteLength + change.after.data.byteLength
}

/**
 * Linear undo history. One entry per committed stroke or document operation. Old entries are
 * dropped first when the entry or memory budget is exceeded; the redo tail is discarded on push.
 */
export class History {
	private entries: HistoryEntry[] = []
	private position = 0
	private nextId = 1
	private totalBytes = 0
	private baseId = 0
	readonly limits: HistoryLimits

	constructor(limits: HistoryLimits = DEFAULT_HISTORY_LIMITS) {
		this.limits = limits
	}

	get list(): readonly HistoryEntry[] {
		return this.entries
	}

	/** Number of entries currently applied. */
	get cursor(): number {
		return this.position
	}

	get currentEntryId(): number {
		return this.position > 0 ? this.entries[this.position - 1].id : this.baseId
	}

	get bytes(): number {
		return this.totalBytes
	}

	get canUndo(): boolean {
		return this.position > 0
	}

	get canRedo(): boolean {
		return this.position < this.entries.length
	}

	push(label: string, change: HistoryChange, time = Date.now()): HistoryEntry {
		const dropped = this.entries.splice(this.position)
		for (const entry of dropped) this.totalBytes -= entry.bytes
		const entry: HistoryEntry = {
			id: this.nextId++,
			label,
			change,
			bytes: changeBytes(change),
			time,
		}
		this.entries.push(entry)
		this.totalBytes += entry.bytes
		this.position = this.entries.length
		while (
			this.entries.length > 1 &&
			(this.entries.length > this.limits.maxEntries || this.totalBytes > this.limits.maxBytes)
		) {
			const removed = this.entries.shift() as HistoryEntry
			this.baseId = removed.id
			this.totalBytes -= removed.bytes
			this.position--
		}
		return entry
	}

	/** Returns the new image (replace entries swap the whole texture) after undoing one step. */
	undo(image: RgbaImage): { image: RgbaImage; entry: HistoryEntry } | null {
		if (!this.canUndo) return null
		const entry = this.entries[--this.position]
		return { image: revert(image, entry.change), entry }
	}

	redo(image: RgbaImage): { image: RgbaImage; entry: HistoryEntry } | null {
		if (!this.canRedo) return null
		const entry = this.entries[this.position++]
		return { image: reapply(image, entry.change), entry }
	}

	/** Moves to a position (0 = before the first entry) by undoing or redoing step by step. */
	jumpTo(image: RgbaImage, target: number): RgbaImage {
		let current = image
		const goal = Math.max(0, Math.min(this.entries.length, target))
		while (this.position > goal) current = (this.undo(current) as { image: RgbaImage }).image
		while (this.position < goal) current = (this.redo(current) as { image: RgbaImage }).image
		return current
	}

	clear(): void {
		this.entries = []
		this.position = 0
		this.totalBytes = 0
		this.baseId = 0
	}
}

function revert(image: RgbaImage, change: HistoryChange): RgbaImage {
	if (change.kind === 'patch') {
		applyPatch(image, change.patch, 'before')
		return image
	}
	return cloneImage(change.before)
}

function reapply(image: RgbaImage, change: HistoryChange): RgbaImage {
	if (change.kind === 'patch') {
		applyPatch(image, change.patch, 'after')
		return image
	}
	return cloneImage(change.after)
}
