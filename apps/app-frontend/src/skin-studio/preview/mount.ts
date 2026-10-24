import { createApp } from 'vue'

import PreviewApp from './PreviewApp.vue'

/** Mounts the detached 3D preview window. It uses no Tauri commands, only a BroadcastChannel. */
export function mountPreview(selector: string): void {
	createApp(PreviewApp).mount(selector)
}
