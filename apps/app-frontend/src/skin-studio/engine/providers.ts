/**
 * Public skin lookups by nickname. Only fixed provider hosts are contacted, texture URLs from
 * responses are checked against an allowlist and upgraded to HTTPS, and nothing here carries
 * account credentials.
 */

export type LookupProvider = 'mojang' | 'ely'

export const MOJANG_NAME = /^[A-Za-z0-9_]{1,16}$/
export const ELY_NAME = /^[A-Za-z0-9_-]{1,32}$/

const TEXTURE_HOSTS: Record<LookupProvider, string[]> = {
	mojang: ['textures.minecraft.net'],
	ely: ['ely.by', 'skinsystem.ely.by'],
}

export class LookupError extends Error {
	readonly code: 'name' | 'not-found' | 'response' | 'url' | 'network' | 'rate-limited'

	constructor(code: LookupError['code'], message: string) {
		super(message)
		this.code = code
		this.name = 'LookupError'
	}
}

export function validateNickname(provider: LookupProvider, name: string): string {
	const trimmed = name.trim()
	const pattern = provider === 'mojang' ? MOJANG_NAME : ELY_NAME
	if (!pattern.test(trimmed)) throw new LookupError('name', 'Invalid player name')
	return trimmed
}

export function profileLookupUrl(provider: LookupProvider, name: string): string {
	const valid = encodeURIComponent(validateNickname(provider, name))
	return provider === 'mojang'
		? `https://api.mojang.com/users/profiles/minecraft/${valid}`
		: `https://skinsystem.ely.by/textures/${valid}`
}

export function sessionProfileUrl(uuid: string): string {
	if (!/^[0-9a-f]{32}$/i.test(uuid)) throw new LookupError('response', 'Invalid profile id')
	return `https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`
}

/** Accepts only allowlisted texture hosts, forces HTTPS and rejects credentials or odd ports. */
export function safeTextureUrl(provider: LookupProvider, raw: unknown): string {
	if (typeof raw !== 'string' || raw.length > 512) throw new LookupError('url', 'Invalid texture URL')
	let url: URL
	try {
		url = new URL(raw)
	} catch {
		throw new LookupError('url', 'Invalid texture URL')
	}
	if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new LookupError('url', 'Invalid texture URL')
	if (url.username || url.password || (url.port && url.port !== '80' && url.port !== '443')) {
		throw new LookupError('url', 'Invalid texture URL')
	}
	if (!TEXTURE_HOSTS[provider].includes(url.hostname.toLowerCase())) {
		throw new LookupError('url', 'Texture host is not allowed')
	}
	url.protocol = 'https:'
	url.port = ''
	return url.toString()
}

export interface TextureInfo {
	url: string
	slim: boolean
}

interface TexturesJson {
	SKIN?: { url?: unknown; metadata?: { model?: unknown } }
}

function fromTextures(provider: LookupProvider, textures: TexturesJson | undefined): TextureInfo {
	if (!textures?.SKIN) throw new LookupError('not-found', 'The player has no custom skin')
	return {
		url: safeTextureUrl(provider, textures.SKIN.url),
		slim: textures.SKIN.metadata?.model === 'slim',
	}
}

export function parseMojangUuid(json: unknown): string {
	const id = (json as { id?: unknown } | null)?.id
	if (typeof id !== 'string' || !/^[0-9a-f]{32}$/i.test(id)) throw new LookupError('not-found', 'Player not found')
	return id
}

/** Decodes the `textures` property of a session server profile. */
export function parseSessionProfile(json: unknown): TextureInfo {
	const properties = (json as { properties?: unknown } | null)?.properties
	if (!Array.isArray(properties)) throw new LookupError('response', 'Unexpected profile response')
	const textures = properties.find((p) => p && (p as { name?: unknown }).name === 'textures') as
		| { value?: unknown }
		| undefined
	if (!textures || typeof textures.value !== 'string' || textures.value.length > 16384) {
		throw new LookupError('not-found', 'The player has no custom skin')
	}
	let decoded: { textures?: TexturesJson }
	try {
		decoded = JSON.parse(atob(textures.value))
	} catch {
		throw new LookupError('response', 'Unexpected profile response')
	}
	return fromTextures('mojang', decoded.textures)
}

export function parseElyTextures(json: unknown): TextureInfo {
	return fromTextures('ely', (json ?? undefined) as TexturesJson | undefined)
}

/** Official page where Ely.by users upload a skin themselves (export fallback, not direct apply). */
export const ELY_UPLOAD_PAGE = 'https://ely.by/skins/add'
