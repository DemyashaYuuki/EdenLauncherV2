import { inflateLimited } from './png.ts'

export class ZipError extends Error {
	readonly code: string

	constructor(code: string, message: string) {
		super(message)
		this.code = code
		this.name = 'ZipError'
	}
}

export interface ZipEntry {
	name: string
	method: number
	compressedSize: number
	size: number
	localOffset: number
}

export interface ZipLimits {
	maxArchiveBytes: number
	maxEntries: number
	maxEntryBytes: number
}

export const DEFAULT_ZIP_LIMITS: ZipLimits = {
	maxArchiveBytes: 32 * 1024 * 1024,
	maxEntries: 256,
	maxEntryBytes: 16 * 1024 * 1024,
}

/** Rejects absolute paths, drive letters, backslashes and parent-directory segments (zip slip). */
export function isSafeEntryName(name: string): boolean {
	if (!name || name.length > 255) return false
	if (name.includes('\\') || name.includes('\0') || name.startsWith('/')) return false
	if (/^[a-zA-Z]:/.test(name)) return false
	return !name.split('/').some((part) => part === '..' || part === '.')
}

/**
 * Reads the central directory of a ZIP archive. Encrypted, multi-disk and ZIP64 archives and
 * entries with unsafe names or excessive sizes are rejected.
 */
export function readZipDirectory(bytes: Uint8Array, limits: ZipLimits = DEFAULT_ZIP_LIMITS): ZipEntry[] {
	if (bytes.length > limits.maxArchiveBytes) throw new ZipError('too-big', 'Archive is too large')
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
	let eocd = -1
	for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
		if (view.getUint32(i, true) === 0x06054b50) {
			eocd = i
			break
		}
	}
	if (eocd < 0) throw new ZipError('format', 'Not a ZIP archive')
	const disk = view.getUint16(eocd + 4, true)
	const count = view.getUint16(eocd + 10, true)
	const size = view.getUint32(eocd + 12, true)
	const offset = view.getUint32(eocd + 16, true)
	if (disk !== 0 || count === 0xffff || offset === 0xffffffff) throw new ZipError('format', 'Unsupported ZIP layout')
	if (count > limits.maxEntries) throw new ZipError('too-many', 'Archive has too many entries')
	if (offset + size > eocd) throw new ZipError('format', 'Corrupt ZIP directory')
	const entries: ZipEntry[] = []
	let p = offset
	for (let n = 0; n < count; n++) {
		if (p + 46 > bytes.length || view.getUint32(p, true) !== 0x02014b50) {
			throw new ZipError('format', 'Corrupt ZIP directory entry')
		}
		const flags = view.getUint16(p + 8, true)
		const method = view.getUint16(p + 10, true)
		const compressedSize = view.getUint32(p + 20, true)
		const uncompressedSize = view.getUint32(p + 24, true)
		const nameLength = view.getUint16(p + 28, true)
		const extraLength = view.getUint16(p + 30, true)
		const commentLength = view.getUint16(p + 32, true)
		const localOffset = view.getUint32(p + 42, true)
		if (p + 46 + nameLength > bytes.length) throw new ZipError('format', 'Corrupt ZIP directory entry')
		const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLength))
		p += 46 + nameLength + extraLength + commentLength
		if (flags & 1) throw new ZipError('encrypted', 'Encrypted archives are not supported')
		if (name.endsWith('/')) continue
		if (!isSafeEntryName(name)) throw new ZipError('unsafe-name', `Unsafe archive entry name: ${name.slice(0, 80)}`)
		if (method !== 0 && method !== 8) throw new ZipError('method', 'Unsupported compression method')
		if (uncompressedSize > limits.maxEntryBytes || compressedSize > limits.maxEntryBytes) {
			throw new ZipError('too-big', 'Archive entry is too large')
		}
		entries.push({ name, method, compressedSize, size: uncompressedSize, localOffset })
	}
	return entries
}

export async function readZipEntry(
	bytes: Uint8Array,
	entry: ZipEntry,
	limits: ZipLimits = DEFAULT_ZIP_LIMITS,
): Promise<Uint8Array> {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
	const p = entry.localOffset
	if (p + 30 > bytes.length || view.getUint32(p, true) !== 0x04034b50) {
		throw new ZipError('format', 'Corrupt local ZIP header')
	}
	const nameLength = view.getUint16(p + 26, true)
	const extraLength = view.getUint16(p + 28, true)
	const start = p + 30 + nameLength + extraLength
	const end = start + entry.compressedSize
	if (end > bytes.length) throw new ZipError('format', 'Archive entry is truncated')
	const data = bytes.subarray(start, end)
	if (entry.method === 0) {
		if (entry.compressedSize !== entry.size) throw new ZipError('format', 'Stored entry size mismatch')
		return data.slice()
	}
	const limit = Math.min(limits.maxEntryBytes, entry.size)
	const out = await inflateLimited(data, limit, 'deflate-raw').catch(() => {
		throw new ZipError('inflate', 'Archive entry is corrupt or larger than declared')
	})
	if (out.length !== entry.size) throw new ZipError('format', 'Archive entry size mismatch')
	return out
}
