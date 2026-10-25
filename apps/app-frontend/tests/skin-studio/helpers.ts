import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { crc32, deflate } from '../../src/skin-studio/engine/png.ts'

export const here = dirname(fileURLToPath(import.meta.url))
export const srcRoot = resolve(here, '../../src')

export function readAsset(relative: string): Uint8Array {
	return new Uint8Array(readFileSync(resolve(srcRoot, 'assets/eden/skin-studio', relative)))
}

export function readFixture(name: string): string {
	return readFileSync(resolve(here, 'fixtures', name), 'utf8')
}

function u32(value: number): number[] {
	return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]
}

export function pngChunk(type: string, data: Uint8Array | number[]): Uint8Array {
	const body = new Uint8Array([...[...type].map((c) => c.charCodeAt(0)), ...data])
	return new Uint8Array([...u32(data.length), ...body, ...u32(crc32(body))])
}

export function ihdr(
	width: number,
	height: number,
	depth: number,
	colorType: number,
	interlace = 0,
) {
	return pngChunk('IHDR', [...u32(width), ...u32(height), depth, colorType, 0, 0, interlace])
}

export function concat(...parts: Uint8Array[]): Uint8Array {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
	let o = 0
	for (const p of parts) {
		out.set(p, o)
		o += p.length
	}
	return out
}

export const SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])

/** Builds a PNG from already filtered scanline bytes (each row prefixed with its filter type). */
export async function rawPng(
	width: number,
	height: number,
	depth: number,
	colorType: number,
	scanlines: Uint8Array,
	extra: Uint8Array[] = [],
	interlace = 0,
): Promise<Uint8Array> {
	return concat(
		SIGNATURE,
		ihdr(width, height, depth, colorType, interlace),
		...extra,
		pngChunk('IDAT', await deflate(scanlines)),
		pngChunk('IEND', []),
	)
}

interface ZipInput {
	name: string
	data: Uint8Array
	compress?: boolean
	declaredSize?: number
}

/** A minimal ZIP writer for tests (stored or deflated entries). */
export async function buildZip(entries: ZipInput[]): Promise<Uint8Array> {
	const local: Uint8Array[] = []
	const central: Uint8Array[] = []
	let offset = 0
	for (const entry of entries) {
		const name = new TextEncoder().encode(entry.name)
		const body = entry.compress ? await deflate(entry.data, 'deflate-raw') : entry.data
		const size = entry.declaredSize ?? entry.data.length
		const crc = crc32(entry.data)
		const header = new Uint8Array(30 + name.length)
		const hv = new DataView(header.buffer)
		hv.setUint32(0, 0x04034b50, true)
		hv.setUint16(4, 20, true)
		hv.setUint16(8, entry.compress ? 8 : 0, true)
		hv.setUint32(14, crc, true)
		hv.setUint32(18, body.length, true)
		hv.setUint32(22, size, true)
		hv.setUint16(26, name.length, true)
		header.set(name, 30)
		const dir = new Uint8Array(46 + name.length)
		const dv = new DataView(dir.buffer)
		dv.setUint32(0, 0x02014b50, true)
		dv.setUint16(4, 20, true)
		dv.setUint16(6, 20, true)
		dv.setUint16(10, entry.compress ? 8 : 0, true)
		dv.setUint32(16, crc, true)
		dv.setUint32(20, body.length, true)
		dv.setUint32(24, size, true)
		dv.setUint16(28, name.length, true)
		dv.setUint32(42, offset, true)
		dir.set(name, 46)
		local.push(header, body)
		central.push(dir)
		offset += header.length + body.length
	}
	const dirBytes = concat(...central)
	const end = new Uint8Array(22)
	const ev = new DataView(end.buffer)
	ev.setUint32(0, 0x06054b50, true)
	ev.setUint16(8, entries.length, true)
	ev.setUint16(10, entries.length, true)
	ev.setUint32(12, dirBytes.length, true)
	ev.setUint32(16, offset, true)
	return concat(...local, dirBytes, end)
}
