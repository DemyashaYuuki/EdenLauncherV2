<script setup lang="ts">
import { computed, ref } from 'vue'

import StudioColorPicker from '@/components/skin-studio/StudioColorPicker.vue'
import StudioIcon from '@/components/skin-studio/StudioIcon.vue'
import { toHex } from '@/skin-studio/engine/color'
import type { Rgba } from '@/skin-studio/engine/image'
import { MAX_BRUSH_SIZE } from '@/skin-studio/engine/paint'
import {
	formatFromFileName,
	type PaletteFormat,
	parsePalette,
	writePalette,
} from '@/skin-studio/engine/palette'
import { pickFiles, saveBytes } from '@/skin-studio/files'
import { useStudioText } from '@/skin-studio/i18n'
import { useSkinStudio } from '@/skin-studio/store'

const emit = defineEmits<{
	(event: 'prompt', title: string, value: string, done: (value: string | null) => void): void
	(event: 'notify', kind: 'error' | 'info', text: string): void
}>()

const studio = useSkinStudio()
const t = useStudioText()
const editing = ref<'primary' | 'secondary'>('primary')

const editedColor = computed<Rgba>({
	get: () => (editing.value === 'primary' ? studio.primary : studio.secondary),
	set: (value) => {
		if (editing.value === 'primary') studio.primary = value
		else studio.secondary = value
	},
})

const tool = computed(() => studio.tool)
const usesBrush = computed(() =>
	['pencil', 'eraser', 'noise', 'dodgeBurn', 'darkenLighten', 'stamp'].includes(tool.value),
)
const usesExposure = computed(() => tool.value === 'dodgeBurn' || tool.value === 'darkenLighten')

const history = computed(() => {
	void studio.revision
	const doc = studio.active
	if (!doc) return { entries: [], cursor: 0 }
	return { entries: [...doc.history.list], cursor: doc.history.cursor }
})

function swatchStyle(s: { r: number; g: number; b: number; a: number }) {
	return { background: `rgba(${s.r}, ${s.g}, ${s.b}, ${s.a / 255})` }
}

function useSwatch(s: { r: number; g: number; b: number; a: number }, secondary: boolean): void {
	const color: Rgba = [s.r, s.g, s.b, s.a]
	if (secondary) studio.secondary = color
	else studio.primary = color
}

function removeSwatch(index: number): void {
	const palette = studio.activePalette
	if (!palette || palette.builtin) return
	studio.updatePalette(palette.id, (p) => p.swatches.splice(index, 1))
}

function addSwatch(): void {
	let palette = studio.activePalette
	if (!palette || palette.builtin)
		palette = studio.addPalette({ name: t('inspector.palette.new'), swatches: [] })
	const [r, g, b, a] = studio.primary
	studio.updatePalette(palette.id, (p) => {
		if (p.swatches.length < 4096) p.swatches.push({ r, g, b, a, name: toHex(studio.primary) })
	})
}

function newPalette(): void {
	emit('prompt', t('inspector.palette.new'), t('inspector.palette.new'), (name) => {
		if (name) studio.addPalette({ name, swatches: [] })
	})
}

function renamePalette(): void {
	const palette = studio.activePalette
	if (!palette || palette.builtin) return
	emit('prompt', t('inspector.palette.rename'), palette.name, (name) => {
		if (name) studio.updatePalette(palette.id, (p) => (p.name = name.slice(0, 64)))
	})
}

async function importPalette(): Promise<void> {
	try {
		const files = await pickFiles(
			[{ name: 'Palette', extensions: ['gpl', 'gimp', 'aco', 'act', 'swtch', 'json'] }],
			true,
		)
		for (const file of files) {
			const format = formatFromFileName(file.name)
			if (!format) throw new Error(t('error.format'))
			const palette = parsePalette(format, file.bytes, file.name.replace(/\.[^.]+$/, ''))
			studio.addPalette(palette)
		}
	} catch (error) {
		emit('notify', 'error', t('error.generic', { message: (error as Error).message }))
	}
}

async function exportPalette(format: PaletteFormat): Promise<void> {
	const palette = studio.activePalette
	if (!palette) return
	try {
		await saveBytes(
			`${palette.name}.${format}`,
			[{ name: format.toUpperCase(), extensions: [format] }],
			writePalette(format, palette),
		)
	} catch (error) {
		emit('notify', 'error', t('export.failed', { message: (error as Error).message }))
	}
}

const exportFormat = ref<PaletteFormat>('gpl')
</script>

<template>
	<aside class="studio-inspector" :aria-label="t('inspector.color')">
		<section>
			<div class="studio-inspector__head">
				<h3>{{ t('inspector.color') }}</h3>
				<button
					v-tooltip="t('inspector.swap')"
					type="button"
					class="studio-ghost"
					:aria-label="t('inspector.swap')"
					@click="studio.swapColors()"
				>
					⇄
				</button>
			</div>
			<div class="studio-inspector__chips" role="radiogroup" :aria-label="t('inspector.color')">
				<button
					type="button"
					role="radio"
					:aria-checked="editing === 'primary'"
					:class="{ active: editing === 'primary' }"
					@click="editing = 'primary'"
				>
					<span
						:style="{
							background: `rgba(${studio.primary[0]}, ${studio.primary[1]}, ${studio.primary[2]}, ${studio.primary[3] / 255})`,
						}"
					/>
					{{ t('inspector.primary') }}
				</button>
				<button
					type="button"
					role="radio"
					:aria-checked="editing === 'secondary'"
					:class="{ active: editing === 'secondary' }"
					@click="editing = 'secondary'"
				>
					<span
						:style="{
							background: `rgba(${studio.secondary[0]}, ${studio.secondary[1]}, ${studio.secondary[2]}, ${studio.secondary[3] / 255})`,
						}"
					/>
					{{ t('inspector.secondary') }}
				</button>
			</div>
			<StudioColorPicker v-model="editedColor" />
		</section>

		<section>
			<h3>{{ t('inspector.brush') }}</h3>
			<template v-if="usesBrush">
				<label class="studio-range">
					<span
						>{{ t('inspector.size') }} <b>{{ studio.settings.brushSize }} px</b></span
					>
					<input
						v-model.number="studio.settings.brushSize"
						type="range"
						min="1"
						:max="MAX_BRUSH_SIZE"
					/>
				</label>
				<label class="studio-field">
					<span>{{ t('inspector.shape') }}</span>
					<select v-model="studio.settings.brushShape">
						<option value="square">{{ t('inspector.shape.square') }}</option>
						<option value="circle">{{ t('inspector.shape.circle') }}</option>
						<option value="custom" :disabled="!studio.settings.customBrush">
							{{ t('inspector.shape.custom') }}
						</option>
					</select>
				</label>
			</template>
			<label class="studio-range">
				<span
					>{{ t('inspector.opacity') }}
					<b>{{ Math.round(studio.settings.opacity * 100) }}%</b></span
				>
				<input
					v-model.number="studio.settings.opacity"
					type="range"
					min="0.05"
					max="1"
					step="0.05"
				/>
			</label>
			<label v-if="usesExposure" class="studio-range">
				<span
					>{{ t('inspector.exposure') }}
					<b>{{ Math.round(studio.settings.exposure * 100) }}%</b></span
				>
				<input
					v-model.number="studio.settings.exposure"
					type="range"
					min="0.05"
					max="1"
					step="0.05"
				/>
			</label>
			<label v-if="tool === 'noise'" class="studio-range">
				<span
					>{{ t('inspector.noise') }}
					<b>{{ Math.round(studio.settings.noiseStrength * 100) }}%</b></span
				>
				<input
					v-model.number="studio.settings.noiseStrength"
					type="range"
					min="0.02"
					max="1"
					step="0.02"
				/>
			</label>
			<template v-if="tool === 'fill'">
				<label class="studio-range">
					<span
						>{{ t('inspector.tolerance') }} <b>{{ studio.settings.fillTolerance }}</b></span
					>
					<input v-model.number="studio.settings.fillTolerance" type="range" min="0" max="255" />
				</label>
				<label class="studio-field">
					<span>{{ t('inspector.fillMode') }}</span>
					<select v-model="studio.settings.fillMode">
						<option value="contiguous">{{ t('inspector.fillMode.contiguous') }}</option>
						<option value="global">{{ t('inspector.fillMode.global') }}</option>
					</select>
				</label>
				<label class="studio-field">
					<span>{{ t('inspector.fillLock') }}</span>
					<select v-model="studio.settings.fillLock">
						<option value="none">{{ t('inspector.fillLock.none') }}</option>
						<option value="face">{{ t('inspector.fillLock.face') }}</option>
						<option value="part">{{ t('inspector.fillLock.part') }}</option>
					</select>
				</label>
			</template>
			<label v-if="usesBrush" class="studio-check">
				<span>{{ t('inspector.incremental') }}</span>
				<input v-model="studio.settings.incremental" type="checkbox" />
			</label>
			<label class="studio-check">
				<span>{{ t('inspector.mirror') }}</span>
				<input v-model="studio.settings.mirror" type="checkbox" />
			</label>
			<div v-if="studio.selection" class="studio-inspector__selection">
				<span
					>{{ t('inspector.selection') }}: {{ studio.selection.w }} × {{ studio.selection.h }}</span
				>
				<button type="button" class="studio-ghost" @click="studio.selection = null">
					{{ t('inspector.selection.clear') }}
				</button>
			</div>
		</section>

		<section>
			<div class="studio-inspector__head">
				<h3>{{ t('inspector.palette') }}</h3>
				<select
					v-model="studio.activePaletteId"
					class="studio-inspector__palette-select"
					:aria-label="t('inspector.palette')"
				>
					<option v-for="palette in studio.palettes" :key="palette.id" :value="palette.id">
						{{ palette.name }}{{ palette.builtin ? ` · ${t('inspector.palette.builtin')}` : '' }}
					</option>
				</select>
			</div>
			<div class="studio-palette" role="list">
				<button
					v-for="(swatch, index) in studio.activePalette?.swatches ?? []"
					:key="index"
					v-tooltip="swatch.name || toHex([swatch.r, swatch.g, swatch.b, swatch.a])"
					type="button"
					role="listitem"
					class="studio-palette__swatch"
					:style="swatchStyle(swatch)"
					:aria-label="swatch.name || toHex([swatch.r, swatch.g, swatch.b, swatch.a])"
					@click="(event: MouseEvent) => useSwatch(swatch, event.shiftKey)"
					@contextmenu.prevent="
						studio.activePalette?.builtin ? useSwatch(swatch, true) : removeSwatch(index)
					"
				/>
				<button
					v-tooltip="t('inspector.palette.add')"
					type="button"
					class="studio-palette__add"
					:aria-label="t('inspector.palette.add')"
					@click="addSwatch"
				>
					<StudioIcon name="plus" :size="14" />
				</button>
			</div>
			<div class="studio-inspector__row">
				<button type="button" class="studio-ghost" @click="newPalette">
					{{ t('inspector.palette.new') }}
				</button>
				<button
					type="button"
					class="studio-ghost"
					:disabled="studio.activePalette?.builtin"
					@click="renamePalette"
				>
					{{ t('action.rename') }}
				</button>
				<button
					type="button"
					class="studio-ghost"
					:disabled="studio.activePalette?.builtin"
					@click="studio.activePalette && studio.deletePalette(studio.activePalette.id)"
				>
					{{ t('action.delete') }}
				</button>
			</div>
			<div class="studio-inspector__row">
				<button type="button" class="studio-ghost" @click="importPalette">
					{{ t('inspector.palette.import') }}
				</button>
				<select v-model="exportFormat" :aria-label="t('inspector.palette.export')">
					<option value="gpl">GPL</option>
					<option value="aco">ACO</option>
					<option value="act">ACT</option>
					<option value="swtch">SWTCH</option>
					<option value="json">JSON</option>
				</select>
				<button type="button" class="studio-ghost" @click="exportPalette(exportFormat)">
					{{ t('action.export') }}
				</button>
			</div>
		</section>

		<section>
			<div class="studio-inspector__head">
				<h3>{{ t('inspector.history') }}</h3>
				<div class="studio-inspector__row studio-inspector__row--tight">
					<button
						v-tooltip="t('action.undo')"
						type="button"
						class="studio-icon-button"
						:aria-label="t('action.undo')"
						:disabled="history.cursor === 0"
						@click="studio.undoActive()"
					>
						<StudioIcon name="undo" :size="15" />
					</button>
					<button
						v-tooltip="t('action.redo')"
						type="button"
						class="studio-icon-button"
						:aria-label="t('action.redo')"
						:disabled="history.cursor >= history.entries.length"
						@click="studio.redoActive()"
					>
						<StudioIcon name="redo" :size="15" />
					</button>
				</div>
			</div>
			<ol class="studio-history">
				<li>
					<button
						type="button"
						:class="{ current: history.cursor === 0 }"
						@click="studio.jumpActive(0)"
					>
						{{ t('inspector.history.start') }}
					</button>
				</li>
				<li v-for="(entry, index) in history.entries" :key="entry.id">
					<button
						type="button"
						:class="{ current: history.cursor === index + 1, undone: index + 1 > history.cursor }"
						:title="t('inspector.history.undoMany')"
						@click="studio.jumpActive(index + 1)"
					>
						{{ entry.label }}
						<small v-if="entry.change.kind === 'patch'"
							>· {{ entry.change.patch.pixels.length }} px</small
						>
					</button>
				</li>
			</ol>
		</section>
	</aside>
</template>

<style scoped lang="scss">
.studio-inspector {
	display: flex;
	flex-direction: column;
	gap: 18px;
	padding: 16px 14px;
	overflow-y: auto;
	border-left: 1px solid var(--eden-border);

	section {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding-bottom: 16px;
		border-bottom: 1px solid var(--eden-border);

		&:last-child {
			border-bottom: 0;
		}
	}

	h3 {
		margin: 0;
		color: var(--eden-text-secondary);
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 1.4px;
		text-transform: uppercase;
	}

	select {
		min-height: 30px;
		padding: 3px 8px;
		border: 1px solid var(--eden-border);
		border-radius: 7px;
		color: var(--eden-text);
		background: var(--eden-surface-raised);
		font-size: 12px;
	}
}

.studio-inspector__head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.studio-inspector__palette-select {
	max-width: 150px;
}

.studio-inspector__chips {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 6px;

	button {
		display: flex;
		align-items: center;
		gap: 6px;
		min-height: 32px;
		padding: 4px 8px;
		border: 1px solid var(--eden-border);
		border-radius: 8px;
		color: var(--eden-text-secondary);
		background: transparent;
		font-size: 11px;
		cursor: pointer;

		span {
			width: 16px;
			height: 16px;
			border: 1px solid rgba(255, 255, 255, 0.35);
			border-radius: 4px;
		}

		&.active {
			border-color: var(--eden-accent);
			color: var(--eden-text);
		}

		&:focus-visible {
			outline: 2px solid var(--eden-accent);
			outline-offset: 2px;
		}
	}
}

.studio-range {
	display: flex;
	flex-direction: column;
	gap: 4px;
	color: var(--eden-text-secondary);
	font-size: 11px;

	span {
		display: flex;
		justify-content: space-between;
	}

	b {
		color: var(--eden-text);
		font-weight: 500;
	}

	input {
		width: 100%;
		accent-color: var(--eden-accent);
	}
}

.studio-field {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	color: var(--eden-text-secondary);
	font-size: 11px;

	select {
		max-width: 60%;
	}
}

.studio-check {
	display: flex;
	align-items: center;
	justify-content: space-between;
	color: var(--eden-text-secondary);
	font-size: 12px;

	input {
		width: 16px;
		height: 16px;
		accent-color: var(--eden-accent);
	}
}

.studio-inspector__selection {
	display: flex;
	align-items: center;
	justify-content: space-between;
	color: var(--eden-text-secondary);
	font-size: 11px;
}

.studio-palette {
	display: grid;
	grid-template-columns: repeat(8, 1fr);
	gap: 5px;
}

.studio-palette__swatch,
.studio-palette__add {
	aspect-ratio: 1;
	min-width: 0;
	padding: 0;
	border: 1px solid rgba(255, 255, 255, 0.12);
	border-radius: 4px;
	cursor: pointer;

	&:focus-visible {
		outline: 2px solid var(--eden-accent);
		outline-offset: 2px;
	}
}

.studio-palette__add {
	display: grid;
	place-items: center;
	color: var(--eden-text-secondary);
	background: transparent;
	border-style: dashed;
}

.studio-inspector__row {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.studio-inspector__row--tight {
	flex-wrap: nowrap;
}

.studio-ghost {
	min-height: 28px;
	padding: 3px 9px;
	border: 1px solid var(--eden-border);
	border-radius: 7px;
	color: var(--eden-text);
	background: transparent;
	font-size: 11px;
	cursor: pointer;

	&:hover:not(:disabled) {
		border-color: var(--eden-accent);
	}

	&:disabled {
		opacity: 0.45;
		cursor: default;
	}

	&:focus-visible {
		outline: 2px solid var(--eden-accent);
		outline-offset: 2px;
	}
}

.studio-icon-button {
	display: grid;
	width: 28px;
	height: 28px;
	place-items: center;
	padding: 0;
	border: 1px solid transparent;
	border-radius: 7px;
	color: var(--eden-text-secondary);
	background: transparent;
	cursor: pointer;

	&:hover:not(:disabled) {
		border-color: var(--eden-border);
		color: var(--eden-text);
	}

	&:disabled {
		opacity: 0.35;
		cursor: default;
	}

	&:focus-visible {
		outline: 2px solid var(--eden-accent);
		outline-offset: 2px;
	}
}

.studio-history {
	display: flex;
	flex-direction: column;
	max-height: 180px;
	margin: 0;
	padding: 0;
	overflow-y: auto;
	list-style: none;

	button {
		width: 100%;
		padding: 4px 6px;
		border: 0;
		border-radius: 6px;
		color: var(--eden-text-secondary);
		background: transparent;
		font-size: 11px;
		text-align: left;
		cursor: pointer;

		small {
			opacity: 0.7;
		}

		&:hover {
			background: var(--eden-surface-raised);
		}

		&.current {
			color: var(--eden-accent);
		}

		&.undone {
			opacity: 0.5;
			text-decoration: line-through;
		}

		&:focus-visible {
			outline: 2px solid var(--eden-accent);
		}
	}
}
</style>
