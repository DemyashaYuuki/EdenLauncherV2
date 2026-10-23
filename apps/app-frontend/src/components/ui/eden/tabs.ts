import type { MessageDescriptor } from '@modrinth/ui'
import type { Component } from 'vue'

/** A tab of {@link EdenTabbedModal}; compatible with the Modrinth `TabbedModal` tab shape. */
export type EdenTab = {
	name: MessageDescriptor
	category?: MessageDescriptor
	/** Short line under the tab title in the content header. */
	description?: string
	icon: Component
	/** Name of an icon from the Eden set; falls back to `icon`. */
	edenIcon?: string
	content?: Component
	badge?: MessageDescriptor
	shown?: boolean
	developerOnly?: boolean
}
