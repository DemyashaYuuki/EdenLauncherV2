<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import StudioDialog from '@/components/skin-studio/StudioDialog.vue'
import StudioSettingSwitch from '@/components/skin-studio/StudioSettingSwitch.vue'
import {
	comboFromEvent,
	findConflicts,
	SHORTCUT_ACTIONS,
	type ShortcutAction,
} from '@/skin-studio/engine/shortcuts'
import { type StudioKey, useStudioText } from '@/skin-studio/i18n'
import { useSkinStudio } from '@/skin-studio/store'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
	(event: 'close'): void
	(event: 'notify', kind: 'error' | 'info', text: string): void
}>()
const studio = useSkinStudio()
const t = useStudioText()

const recording = ref<ShortcutAction | null>(null)
const conflict = ref<string | null>(null)
const toggles = [
	'grid',
	'regions',
	'alphaChecker',
	'protectHidden',
	'grass',
	'lighting',
	'animate',
	'followCursor',
	'multisampling',
	'recovery',
] as const

watch(
	() => props.open,
	(open) => {
		if (!open) return
		recording.value = null
		conflict.value = null
	},
)

function onShortcutKey(event: KeyboardEvent, action: ShortcutAction): void {
	event.preventDefault()
	event.stopPropagation()
	if (event.key === 'Escape') {
		recording.value = null
		return
	}
	if (event.key === 'Backspace' || event.key === 'Delete') {
		studio.shortcuts = { ...studio.shortcuts, [action]: '' }
		recording.value = null
		return
	}
	const combo = comboFromEvent(event)
	if (!combo) return
	const other = SHORTCUT_ACTIONS.find((a) => a !== action && studio.shortcuts[a] === combo)
	if (other) {
		conflict.value = t('settings.shortcutConflict', { action: t(`shortcut.${other}` as StudioKey) })
		return
	}
	conflict.value = null
	studio.shortcuts = { ...studio.shortcuts, [action]: combo }
	recording.value = null
}

const conflicts = computed(() => findConflicts(studio.shortcuts))
</script>

<template>
	<StudioDialog :open="open" :title="t('settings.title')" width="880px" @close="emit('close')">
		<section class="studio-settings__section">
			<h3>{{ t('settings.view') }}</h3>
			<div class="studio-settings__grid">
				<StudioSettingSwitch
					v-for="key in toggles"
					:key="key"
					v-model="studio.prefs[key]"
					:label="t(`settings.${key}` as StudioKey)"
					:hint="t(`settings.hint.${key}` as StudioKey)"
				/>
			</div>
			<div class="studio-settings__controls">
				<label>
					<span
						>{{ t('settings.gridOpacity') }} ·
						{{ Math.round(studio.prefs.gridOpacity * 100) }}%</span
					>
					<input
						v-model.number="studio.prefs.gridOpacity"
						type="range"
						min="0.05"
						max="1"
						step="0.05"
						:disabled="!studio.prefs.grid"
					/>
				</label>
				<label>
					{{ t('settings.transparency') }}
					<select v-model="studio.prefs.transparency" class="studio-select">
						<option value="off">{{ t('settings.transparency.off') }}</option>
						<option value="helmet">{{ t('settings.transparency.helmet') }}</option>
						<option value="all">{{ t('settings.transparency.all') }}</option>
					</select>
				</label>
				<label>
					{{ t('settings.background') }}
					<select v-model="studio.prefs.backgroundMode" class="studio-select">
						<option value="theme">{{ t('settings.background.theme') }}</option>
						<option value="color">{{ t('settings.background.color') }}</option>
					</select>
				</label>
				<label v-if="studio.prefs.backgroundMode === 'color'">
					{{ t('settings.backgroundColor') }}
					<input v-model="studio.prefs.backgroundColor" type="color" />
				</label>
			</div>
			<p class="studio-settings__muted">{{ t('settings.language') }}</p>
		</section>

		<details class="studio-settings__section studio-settings__shortcuts">
			<summary>{{ t('settings.shortcuts') }}</summary>
			<p class="studio-settings__muted">{{ t('settings.shortcutsHint') }}</p>
			<p v-if="conflict" class="studio-note studio-note--error" role="alert">{{ conflict }}</p>
			<p v-if="conflicts.length" class="studio-note studio-note--error">{{ conflicts.length }}</p>
			<div class="studio-shortcuts">
				<label v-for="action in SHORTCUT_ACTIONS" :key="action">
					<span>{{ t(`shortcut.${action}` as StudioKey) }}</span>
					<input
						class="studio-input"
						readonly
						:value="recording === action ? '…' : studio.shortcuts[action] || '—'"
						:aria-label="t(`shortcut.${action}` as StudioKey)"
						@focus="recording = action"
						@blur="recording = recording === action ? null : recording"
						@keydown="(e) => onShortcutKey(e, action)"
					/>
				</label>
			</div>
			<button type="button" class="studio-btn studio-btn--small" @click="studio.resetShortcuts()">
				{{ t('settings.resetShortcuts') }}
			</button>
		</details>

		<template #actions>
			<button type="button" class="studio-btn studio-btn--primary" @click="emit('close')">
				{{ t('action.done') }}
			</button>
		</template>
	</StudioDialog>
</template>

<style scoped lang="scss">
.studio-settings__section {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding-bottom: 14px;
	border-bottom: 1px solid var(--eden-border);

	h3 {
		margin: 0;
		color: var(--eden-text);
		font-size: 14px;
	}
}

.studio-settings__grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
}

.studio-settings__controls {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 14px;
	margin-top: 6px;

	label {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 8px;
		color: var(--eden-text-secondary);
		font-size: 13px;
	}

	input[type='range'] {
		appearance: auto;
		width: 100%;
		height: 24px;
		margin: 0;
		accent-color: var(--eden-accent);
	}
}

.studio-settings__shortcuts {
	display: block;

	summary {
		padding: 8px 0;
		color: var(--eden-text);
		font-size: 14px;
		font-weight: 650;
		cursor: pointer;
	}
}

@media (max-width: 680px) {
	.studio-settings__grid,
	.studio-settings__controls {
		grid-template-columns: minmax(0, 1fr);
	}
}

.studio-settings__muted {
	font-size: 11px !important;
}

.studio-shortcuts {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
	gap: 6px 16px;

	label {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		color: var(--eden-text-secondary);
		font-size: 12px;
	}

	input {
		width: 120px;
		min-height: 28px;
		font-size: 12px;
		text-align: center;
		cursor: pointer;
	}
}

.studio-settings__row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	font-size: 12px;
}

.studio-settings__ok {
	color: var(--eden-success);
}

.studio-settings__bad {
	color: var(--eden-error);
}
</style>
