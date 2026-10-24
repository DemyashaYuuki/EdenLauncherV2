<script setup lang="ts">
import { openPath } from '@tauri-apps/plugin-opener'
import { computed, onMounted, ref, shallowRef } from 'vue'

import atelier from '@/assets/eden/skin-studio/art/skin-studio-atelier.png'
import StudioIcon from '@/components/skin-studio/StudioIcon.vue'
import StudioThumb from '@/components/skin-studio/StudioThumb.vue'
import * as api from '@/helpers/skin-studio'
import type { RgbaImage } from '@/skin-studio/engine/image'
import { decodePng } from '@/skin-studio/engine/png'
import { parseProject, PROJECT_EXTENSION, safeFileStem } from '@/skin-studio/engine/project'
import { pickDirectory } from '@/skin-studio/files'
import { useStudioText } from '@/skin-studio/i18n'
import { useSkinStudio } from '@/skin-studio/store'

const emit = defineEmits<{
	(event: 'new'): void
	(event: 'import'): void
	(event: 'fetch'): void
	(event: 'template', id: 'ranger' | 'operator'): void
	(event: 'prompt', title: string, value: string, done: (value: string | null) => void): void
	(event: 'confirm', title: string, body: string, done: (ok: boolean) => void): void
	(event: 'notify', kind: 'error' | 'info', text: string): void
}>()

const studio = useSkinStudio()
const t = useStudioText()
const previews = shallowRef(new Map<string, RgbaImage | null>())
const showTrash = ref(false)

const folders = computed(() => {
	const prefix = studio.currentFolder ? `${studio.currentFolder}/` : ''
	return studio.library
		.filter((e) => e.kind === 'folder' && e.path.startsWith(prefix) && !e.path.slice(prefix.length).includes('/'))
		.map((e) => ({ path: e.path, name: e.path.slice(prefix.length) }))
})

const items = computed(() => {
	const prefix = studio.currentFolder ? `${studio.currentFolder}/` : ''
	return studio.library
		.filter((e) => e.kind !== 'folder' && e.path.startsWith(prefix) && !e.path.slice(prefix.length).includes('/'))
		.sort((a, b) => b.modified_ms - a.modified_ms)
		.map((e) => ({
			...e,
			name: e.path.slice(prefix.length).replace(/\.(edenskin|png)$/i, ''),
			open: studio.documents.some((d) => d.path === e.path),
		}))
})

const crumbs = computed(() => {
	const parts = studio.currentFolder ? studio.currentFolder.split('/') : []
	return parts.map((name, i) => ({ name, path: parts.slice(0, i + 1).join('/') }))
})

function relativeTime(ms: number): string {
	const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
	const diff = (ms - Date.now()) / 1000
	const units: [Intl.RelativeTimeFormatUnit, number][] = [
		['day', 86400],
		['hour', 3600],
		['minute', 60],
	]
	for (const [unit, seconds] of units) {
		if (Math.abs(diff) >= seconds) return formatter.format(Math.round(diff / seconds), unit)
	}
	return formatter.format(Math.round(diff), 'second')
}

async function loadPreview(path: string): Promise<void> {
	if (previews.value.has(path)) return
	previews.value.set(path, null)
	try {
		const bytes = await api.readLibraryFile(path)
		const image = path.endsWith('.png') ? await decodePng(bytes) : (await parseProject(bytes)).image
		const next = new Map(previews.value)
		next.set(path, image)
		previews.value = next
	} catch {
		/* a broken file keeps an empty preview; opening it reports the error */
	}
}

async function open(path: string): Promise<void> {
	try {
		await studio.openLibraryEntry(path)
	} catch (error) {
		emit('notify', 'error', t('library.importFailed', { name: path, message: (error as Error).message }))
	}
}

function enterFolder(path: string): void {
	studio.currentFolder = path
}

async function run(action: () => Promise<unknown>): Promise<void> {
	try {
		await action()
	} catch (error) {
		emit('notify', 'error', t('error.generic', { message: (error as Error).message }))
	}
	await studio.refreshLibrary()
}

function newFolder(): void {
	emit('prompt', t('library.folderPrompt'), t('action.newFolder'), (name) => {
		if (!name) return
		const stem = safeFileStem(name)
		void run(() => api.createLibraryFolder(studio.currentFolder ? `${studio.currentFolder}/${stem}` : stem))
	})
}

function rename(path: string, name: string, kind: string): void {
	emit('prompt', t('library.renamePrompt'), name, (next) => {
		if (!next || next === name) return
		const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : ''
		const ext = kind === 'folder' ? '' : path.slice(path.lastIndexOf('.'))
		const target = `${dir}${safeFileStem(next)}${ext}`
		void run(async () => {
			await api.renameLibraryEntry(path, target)
			for (const doc of studio.documents) {
				if (doc.path === path) doc.path = target
				else if (doc.path?.startsWith(`${path}/`)) doc.path = target + doc.path.slice(path.length)
			}
			studio.touch()
		})
	})
}

function clone(path: string, name: string): void {
	const target = studio.libraryPathFor(name, path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '')
	const ext = path.slice(path.lastIndexOf('.'))
	void run(() => api.copyLibraryEntry(path, target.replace(new RegExp(`\\.${PROJECT_EXTENSION}$`), ext)))
}

function move(path: string): void {
	emit('prompt', t('library.movePrompt'), studio.currentFolder, (folder) => {
		if (folder === null) return
		const clean = folder
			.split('/')
			.map((p) => p.trim())
			.filter(Boolean)
			.map(safeFileStem)
			.join('/')
		const target = `${clean ? `${clean}/` : ''}${path.slice(path.lastIndexOf('/') + 1)}`
		if (target === path) return
		void run(async () => {
			if (clean) await api.createLibraryFolder(clean).catch(() => undefined)
			await api.renameLibraryEntry(path, target)
			for (const doc of studio.documents) if (doc.path === path) doc.path = target
			studio.touch()
		})
	})
}

function remove(path: string, name: string): void {
	emit('confirm', t('action.delete'), t('library.deleteConfirm', { name }), (ok) => {
		if (!ok) return
		void run(async () => {
			await api.trashLibraryEntry(path)
			for (const doc of studio.documents) if (doc.path === path) doc.path = null
			studio.touch()
		})
	})
}

async function changeLocation(): Promise<void> {
	const dir = await pickDirectory()
	if (!dir) return
	await run(async () => {
		await api.setLibraryRoot(dir)
		studio.currentFolder = ''
		previews.value = new Map()
	})
}

async function resetLocation(): Promise<void> {
	await run(async () => {
		await api.setLibraryRoot(null)
		studio.currentFolder = ''
		previews.value = new Map()
	})
}

async function openLocation(): Promise<void> {
	if (studio.libraryInfo) await openPath(studio.libraryInfo.root).catch(() => undefined)
}

onMounted(() => {
	void studio.refreshLibrary()
})
</script>

<template>
	<section class="studio-library">
		<div class="studio-hero" :style="{ '--art': `url(${atelier})` }">
			<div>
				<div class="studio-eyebrow">{{ t('library.heroEyebrow') }}</div>
				<h2>{{ t('library.heroTitle') }}</h2>
				<p>{{ t('library.heroBody') }}</p>
				<div class="studio-hero__actions">
					<button type="button" class="studio-btn studio-btn--primary" @click="emit('new')">＋ {{ t('action.new') }}</button>
					<button type="button" class="studio-btn" @click="emit('import')">{{ t('action.importPng') }}</button>
					<button type="button" class="studio-btn" @click="emit('fetch')">{{ t('action.fetch') }}</button>
				</div>
			</div>
		</div>

		<div class="studio-library__toolbar">
			<nav class="studio-library__crumbs" :aria-label="t('library.folder')">
				<button type="button" @click="enterFolder('')">{{ t('library.root') }}</button>
				<template v-for="crumb in crumbs" :key="crumb.path">
					<span>/</span>
					<button type="button" @click="enterFolder(crumb.path)">{{ crumb.name }}</button>
				</template>
			</nav>
			<div class="studio-library__tools">
				<button type="button" class="studio-btn studio-btn--small" @click="newFolder">
					<StudioIcon name="folder" :size="15" /> {{ t('action.newFolder') }}
				</button>
				<button type="button" class="studio-btn studio-btn--small" :aria-pressed="showTrash" @click="showTrash = !showTrash">
					{{ t('library.trash') }} ({{ studio.trash.length }})
				</button>
			</div>
		</div>

		<p v-if="studio.libraryError" class="studio-note studio-note--error" role="alert">
			{{ t('library.error', { message: studio.libraryError }) }}
		</p>

		<div v-if="!showTrash" class="studio-cards">
			<button v-for="folder in folders" :key="folder.path" type="button" class="studio-card studio-card--folder" @click="enterFolder(folder.path)">
				<StudioIcon name="folder" :size="28" />
				<strong>{{ folder.name }}</strong>
			</button>
			<article v-for="item in items" :key="item.path" class="studio-card" @vue:mounted="loadPreview(item.path)">
				<button type="button" class="studio-card__preview" :aria-label="`${t('library.openInEditor')}: ${item.name}`" @click="open(item.path)">
					<StudioThumb :image="previews.get(item.path) ?? null" :label="item.name" />
				</button>
				<h3>{{ item.name }}</h3>
				<p>{{ item.kind === 'png' ? 'PNG' : 'Eden Skin' }} · {{ t('library.modified', { time: relativeTime(item.modified_ms) }) }}</p>
				<div class="studio-card__actions">
					<button type="button" class="studio-btn studio-btn--small" @click="open(item.path)">
						{{ item.open ? t('library.continue') : t('library.openInEditor') }} →
					</button>
					<button v-tooltip="t('action.rename')" type="button" class="studio-icon-btn" :aria-label="t('action.rename')" @click="rename(item.path, item.name, item.kind)">
						<StudioIcon name="pencil" :size="15" />
					</button>
					<button v-tooltip="t('action.clone')" type="button" class="studio-icon-btn" :aria-label="t('action.clone')" @click="clone(item.path, item.name)">
						<StudioIcon name="layers" :size="15" />
					</button>
					<button v-tooltip="t('action.move')" type="button" class="studio-icon-btn" :aria-label="t('action.move')" @click="move(item.path)">
						<StudioIcon name="folder" :size="15" />
					</button>
					<button v-tooltip="t('action.delete')" type="button" class="studio-icon-btn studio-icon-btn--danger" :aria-label="t('action.delete')" @click="remove(item.path, item.name)">
						<StudioIcon name="close" :size="15" />
					</button>
				</div>
			</article>
			<button type="button" class="studio-card studio-card--new" @click="emit('new')">
				<span class="studio-card__plus">＋</span>
				<h3>{{ t('library.blankTitle') }}</h3>
				<p>{{ t('library.blankBody') }}</p>
			</button>
			<button type="button" class="studio-card studio-card--template" @click="emit('template', 'ranger')">
				<span class="studio-card__badge">{{ t('library.templates') }}</span>
				<h3>{{ t('new.template.ranger') }}</h3>
				<p>64 × 64 · Classic</p>
			</button>
			<button type="button" class="studio-card studio-card--template" @click="emit('template', 'operator')">
				<span class="studio-card__badge">{{ t('library.templates') }}</span>
				<h3>{{ t('new.template.operator') }}</h3>
				<p>64 × 64 · Classic</p>
			</button>
		</div>
		<p v-if="!showTrash && items.length === 0 && folders.length === 0 && !studio.libraryLoading" class="studio-library__empty">
			{{ t('library.empty') }} {{ t('library.dropHint') }}
		</p>

		<div v-if="showTrash" class="studio-trash">
			<p v-if="studio.trash.length === 0">{{ t('library.trashEmpty') }}</p>
			<ul v-else>
				<li v-for="entry in studio.trash" :key="entry.id">
					<span>{{ entry.original_path }} · {{ relativeTime(entry.deleted_ms) }}</span>
					<div>
						<button type="button" class="studio-btn studio-btn--small" @click="run(() => api.restoreTrash(entry.id))">
							{{ t('action.restore') }}
						</button>
						<button type="button" class="studio-btn studio-btn--small studio-btn--danger" @click="run(() => api.purgeTrash(entry.id))">
							{{ t('action.delete') }}
						</button>
					</div>
				</li>
			</ul>
			<button v-if="studio.trash.length" type="button" class="studio-btn studio-btn--danger" @click="run(() => api.purgeTrash(null))">
				{{ t('library.emptyTrash') }}
			</button>
		</div>

		<footer class="studio-library__location">
			<span>{{ t('library.location') }}: <code>{{ studio.libraryInfo?.root ?? '…' }}</code></span>
			<div>
				<button type="button" class="studio-btn studio-btn--small" @click="openLocation">{{ t('action.openFolder') }}</button>
				<button type="button" class="studio-btn studio-btn--small" @click="changeLocation">{{ t('library.change') }}</button>
				<button v-if="studio.libraryInfo && !studio.libraryInfo.is_default" type="button" class="studio-btn studio-btn--small" @click="resetLocation">
					{{ t('library.reset') }}
				</button>
			</div>
		</footer>
	</section>
</template>

<style scoped lang="scss">
.studio-library {
	display: flex;
	flex-direction: column;
	gap: 18px;
}

.studio-hero {
	display: flex;
	min-height: 235px;
	align-items: center;
	padding: 36px 38px;
	border: 1px solid var(--eden-border);
	border-radius: 16px;
	background:
		linear-gradient(90deg, var(--eden-canvas) 0%, color-mix(in srgb, var(--eden-canvas) 75%, transparent) 40%, transparent 80%),
		var(--art) center / cover;

	h2 {
		margin: 10px 0 0;
		font-size: 32px;
		letter-spacing: -1px;
	}

	p {
		max-width: 450px;
		margin: 12px 0 22px;
		color: var(--eden-text-secondary);
		line-height: 1.6;
	}
}

.studio-hero__actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.studio-eyebrow {
	color: var(--eden-accent);
	font-size: 10px;
	font-weight: 700;
	letter-spacing: 1.9px;
	text-transform: uppercase;
}

.studio-library__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.studio-library__crumbs {
	display: flex;
	align-items: center;
	gap: 6px;
	color: var(--eden-text-secondary);

	button {
		padding: 2px 4px;
		border: 0;
		border-radius: 5px;
		color: var(--eden-text);
		background: transparent;
		cursor: pointer;

		&:focus-visible {
			outline: 2px solid var(--eden-accent);
		}
	}
}

.studio-library__tools {
	display: flex;
	gap: 8px;
}

.studio-cards {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
	gap: 16px;
}

.studio-card {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 18px;
	border: 1px solid var(--eden-border);
	border-radius: 14px;
	color: var(--eden-text);
	background: var(--eden-surface);
	text-align: left;

	h3 {
		margin: 6px 0 0;
		overflow: hidden;
		font-size: 15px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	p {
		margin: 0;
		color: var(--eden-text-secondary);
		font-size: 12px;
		line-height: 1.5;
	}
}

button.studio-card {
	cursor: pointer;

	&:hover {
		border-color: var(--eden-accent);
	}

	&:focus-visible {
		outline: 2px solid var(--eden-accent);
		outline-offset: 2px;
	}
}

.studio-card--folder {
	flex-direction: row;
	align-items: center;
	gap: 12px;
	color: var(--eden-accent);

	strong {
		color: var(--eden-text);
	}
}

.studio-card__preview {
	height: 150px;
	padding: 12px;
	border: 0;
	border-radius: 9px;
	background: var(--eden-canvas);
	cursor: pointer;

	&:focus-visible {
		outline: 2px solid var(--eden-accent);
		outline-offset: 2px;
	}
}

.studio-card__actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 4px;
	margin-top: 8px;
}

.studio-card--new,
.studio-card--template {
	min-height: 150px;
	justify-content: flex-end;
}

.studio-card__plus {
	display: grid;
	flex: 1;
	place-items: center;
	color: var(--eden-accent);
	font-size: 40px;
}

.studio-card__badge {
	align-self: flex-start;
	padding: 3px 9px;
	border: 1px solid var(--eden-border);
	border-radius: 20px;
	color: var(--eden-text-secondary);
	font-size: 11px;
}

.studio-library__empty {
	margin: 0;
	color: var(--eden-text-secondary);
	font-size: 13px;
}

.studio-trash {
	padding: 16px;
	border: 1px solid var(--eden-border);
	border-radius: 14px;
	background: var(--eden-surface);

	ul {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin: 0 0 12px;
		padding: 0;
		list-style: none;
	}

	li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		font-size: 13px;

		div {
			display: flex;
			gap: 6px;
		}
	}
}

.studio-library__location {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	color: var(--eden-text-secondary);
	font-size: 12px;

	code {
		color: var(--eden-text);
		word-break: break-all;
	}

	div {
		display: flex;
		gap: 6px;
	}
}
</style>
