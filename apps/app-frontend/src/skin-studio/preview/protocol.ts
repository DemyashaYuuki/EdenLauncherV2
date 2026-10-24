import type { ModelDefinition } from '../engine/model.ts'
import type { TransparencyMode, Visibility } from '../render/scene.ts'

export const PREVIEW_CHANNEL = 'eden-skin-studio-preview'

export type PreviewMessage =
	| { type: 'hello' }
	| {
			type: 'document'
			name: string
			model: ModelDefinition
			width: number
			height: number
			pixels: ArrayBuffer
			visibility: Visibility
			transparency: TransparencyMode
	  }

export const MAX_PREVIEW_PIXELS = 4096 * 4096

/** Validates a message from another window before it reaches the renderer. */
export function isDocumentMessage(value: unknown): value is Extract<PreviewMessage, { type: 'document' }> {
	if (!value || typeof value !== 'object') return false
	const m = value as Record<string, unknown>
	if (m.type !== 'document') return false
	if (typeof m.width !== 'number' || typeof m.height !== 'number') return false
	if (!Number.isInteger(m.width) || !Number.isInteger(m.height) || m.width <= 0 || m.height <= 0) return false
	if (m.width * m.height > MAX_PREVIEW_PIXELS) return false
	if (!(m.pixels instanceof ArrayBuffer) || m.pixels.byteLength !== m.width * m.height * 4) return false
	const model = m.model as ModelDefinition | undefined
	return !!model && Array.isArray(model.boxes) && model.boxes.length > 0 && model.boxes.length <= 1024
}
