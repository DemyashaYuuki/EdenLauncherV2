import { open, save } from '@tauri-apps/plugin-dialog'
import { readFile, stat, writeFile } from '@tauri-apps/plugin-fs'

export interface PickedFile {
	name: string
	bytes: Uint8Array
}

export interface FileFilter {
	name: string
	extensions: string[]
}

export const MAX_IMPORT_BYTES = 48 * 1024 * 1024

export class FileTooLargeError extends Error {
	constructor(name: string) {
		super(`${name} is too large`)
		this.name = 'FileTooLargeError'
	}
}

function baseName(path: string): string {
	return path.split(/[\\/]/).pop() ?? path
}

/** Reads a user-chosen file after checking its size, so huge files are never loaded into memory. */
export async function readPickedPath(
	path: string,
	maxBytes = MAX_IMPORT_BYTES,
): Promise<PickedFile> {
	const info = await stat(path)
	if (!info.isFile || info.size > maxBytes) throw new FileTooLargeError(baseName(path))
	return { name: baseName(path), bytes: await readFile(path) }
}

export async function pickFiles(filters: FileFilter[], multiple: boolean): Promise<PickedFile[]> {
	const result = await open({ multiple, directory: false, filters })
	if (!result) return []
	const paths = Array.isArray(result) ? result : [result]
	const files: PickedFile[] = []
	for (const path of paths.slice(0, 64)) files.push(await readPickedPath(path))
	return files
}

export async function pickDirectory(): Promise<string | null> {
	const result = await open({ multiple: false, directory: true })
	return typeof result === 'string' ? result : null
}

/** Asks for a destination and writes the bytes there. Returns false when the user cancelled. */
export async function saveBytes(
	defaultName: string,
	filters: FileFilter[],
	bytes: Uint8Array,
): Promise<boolean> {
	const path = await save({ defaultPath: defaultName, filters })
	if (!path) return false
	await writeFile(path, bytes)
	return true
}

export async function blobBytes(blob: Blob): Promise<Uint8Array> {
	return new Uint8Array(await blob.arrayBuffer())
}

export async function copyPngToClipboard(blob: Blob): Promise<void> {
	await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}
