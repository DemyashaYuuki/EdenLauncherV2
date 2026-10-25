/**
 * A small XML reader for model files. DOCTYPE, entity declarations and processing instructions
 * other than the XML declaration are rejected, so no external or recursive entity is ever expanded.
 */

export interface XmlElement {
	name: string
	attributes: Record<string, string>
	children: XmlElement[]
	text: string
}

export class XmlError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'XmlError'
	}
}

export interface XmlLimits {
	maxChars: number
	maxDepth: number
	maxElements: number
}

export const DEFAULT_XML_LIMITS: XmlLimits = {
	maxChars: 4 * 1024 * 1024,
	maxDepth: 32,
	maxElements: 50_000,
}

const PREDEFINED: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }

function decodeEntities(text: string): string {
	return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (whole, ref: string) => {
		if (ref[0] === '#') {
			const code = ref[1] === 'x' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10)
			if (!Number.isFinite(code) || code < 0 || code > 0x10ffff)
				throw new XmlError('Bad character reference')
			return String.fromCodePoint(code)
		}
		if (ref in PREDEFINED) return PREDEFINED[ref]
		throw new XmlError(`Undefined entity &${ref};`)
	})
}

export function parseXml(source: string, limits: XmlLimits = DEFAULT_XML_LIMITS): XmlElement {
	if (source.length > limits.maxChars) throw new XmlError('XML document is too large')
	const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source
	if (/<!DOCTYPE|<!ENTITY/i.test(text))
		throw new XmlError('DTD and entity declarations are not allowed')
	let i = 0
	let elements = 0
	const stack: XmlElement[] = []
	let root: XmlElement | null = null

	const skipWhitespace = () => {
		while (i < text.length && /\s/.test(text[i])) i++
	}

	while (i < text.length) {
		if (text.startsWith('<?', i)) {
			const end = text.indexOf('?>', i)
			if (end < 0) throw new XmlError('Unterminated declaration')
			const body = text.slice(i + 2, end).trim()
			if (!/^xml(\s|$)/i.test(body) || i !== text.search(/\S/)) {
				throw new XmlError('Processing instructions are not allowed')
			}
			i = end + 2
			continue
		}
		if (text.startsWith('<!--', i)) {
			const end = text.indexOf('-->', i + 4)
			if (end < 0) throw new XmlError('Unterminated comment')
			i = end + 3
			continue
		}
		if (text.startsWith('<![CDATA[', i)) {
			const end = text.indexOf(']]>', i + 9)
			if (end < 0) throw new XmlError('Unterminated CDATA')
			const current = stack[stack.length - 1]
			if (!current) throw new XmlError('Text outside of the root element')
			current.text += text.slice(i + 9, end)
			i = end + 3
			continue
		}
		if (text.startsWith('<!', i)) throw new XmlError('Declarations are not allowed')
		if (text.startsWith('</', i)) {
			const end = text.indexOf('>', i)
			if (end < 0) throw new XmlError('Unterminated closing tag')
			const name = text.slice(i + 2, end).trim()
			const current = stack.pop()
			if (!current || current.name !== name) throw new XmlError(`Mismatched closing tag </${name}>`)
			i = end + 1
			continue
		}
		if (text[i] === '<') {
			i++
			const nameMatch = /^[A-Za-z_][\w.\-:]*/.exec(text.slice(i, i + 256))
			if (!nameMatch) throw new XmlError('Invalid element name')
			const element: XmlElement = { name: nameMatch[0], attributes: {}, children: [], text: '' }
			if (++elements > limits.maxElements) throw new XmlError('Too many XML elements')
			i += nameMatch[0].length
			let selfClosing = false
			for (;;) {
				skipWhitespace()
				if (text.startsWith('/>', i)) {
					selfClosing = true
					i += 2
					break
				}
				if (text[i] === '>') {
					i++
					break
				}
				const attr = /^([A-Za-z_][\w.\-:]*)\s*=\s*("([^"<]*)"|'([^'<]*)')/.exec(
					text.slice(i, i + 65536),
				)
				if (!attr) throw new XmlError(`Invalid attribute in <${element.name}>`)
				if (attr[1] in element.attributes) throw new XmlError('Duplicate attribute')
				element.attributes[attr[1]] = decodeEntities(attr[3] ?? attr[4] ?? '')
				i += attr[0].length
			}
			const parent = stack[stack.length - 1]
			if (parent) parent.children.push(element)
			else if (root) throw new XmlError('Multiple root elements')
			else root = element
			if (!selfClosing) {
				stack.push(element)
				if (stack.length > limits.maxDepth) throw new XmlError('XML is nested too deeply')
			}
			continue
		}
		const next = text.indexOf('<', i)
		const end = next < 0 ? text.length : next
		const chunk = text.slice(i, end)
		const current = stack[stack.length - 1]
		if (current) current.text += decodeEntities(chunk)
		else if (chunk.trim()) throw new XmlError('Text outside of the root element')
		i = end
	}
	if (stack.length) throw new XmlError(`Unclosed element <${stack[stack.length - 1].name}>`)
	if (!root) throw new XmlError('Empty XML document')
	return root
}

export function child(element: XmlElement, name: string): XmlElement | undefined {
	const lower = name.toLowerCase()
	return element.children.find((c) => c.name.toLowerCase() === lower)
}

export function children(element: XmlElement, name: string): XmlElement[] {
	const lower = name.toLowerCase()
	return element.children.filter((c) => c.name.toLowerCase() === lower)
}

export function attribute(element: XmlElement, name: string): string | undefined {
	const lower = name.toLowerCase()
	for (const [key, value] of Object.entries(element.attributes))
		if (key.toLowerCase() === lower) return value
	return undefined
}
