<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import StudioDialog from '@/components/skin-studio/StudioDialog.vue'
import * as api from '@/helpers/skin-studio'
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
const endpoint = ref('')
const health = ref<api.BridgeHealth | null>(null)
const checking = ref(false)

watch(
	() => props.open,
	(open) => {
		if (!open) return
		recording.value = null
		conflict.value = null
		endpoint.value = studio.bridge?.endpoint ?? ''
		health.value = null
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

async function saveEndpoint(): Promise<void> {
	checking.value = true
	health.value = null
	try {
		studio.bridge = await api.bridgeSetEndpoint(endpoint.value.trim() || null)
		if (studio.bridge.endpoint) health.value = await api.bridgeHealth()
	} catch (error) {
		emit('notify', 'error', t('error.generic', { message: (error as Error).message }))
	} finally {
		checking.value = false
	}
}
</script>

<template>
	<StudioDialog :open="open" :title="t('settings.title')" width="760px" @close="emit('close')">
		<section class="studio-settings__section">
			<h3>{{ t('settings.view') }}</h3>
			<div class="studio-settings__grid">
				<label
					><input v-model="studio.prefs.grid" type="checkbox" /> {{ t('settings.grid') }}</label
				>
				<label>
					{{ t('settings.gridOpacity') }}
					<input
						v-model.number="studio.prefs.gridOpacity"
						type="range"
						min="0.05"
						max="1"
						step="0.05"
					/>
				</label>
				<label
					><input v-model="studio.prefs.regions" type="checkbox" />
					{{ t('settings.regions') }}</label
				>
				<label
					><input v-model="studio.prefs.alphaChecker" type="checkbox" />
					{{ t('settings.alphaChecker') }}</label
				>
				<label
					><input v-model="studio.prefs.protectHidden" type="checkbox" />
					{{ t('settings.protectHidden') }}</label
				>
				<label
					><input v-model="studio.prefs.grass" type="checkbox" /> {{ t('settings.grass') }}</label
				>
				<label
					><input v-model="studio.prefs.lighting" type="checkbox" />
					{{ t('settings.lighting') }}</label
				>
				<label
					><input v-model="studio.prefs.animate" type="checkbox" />
					{{ t('settings.animate') }}</label
				>
				<label
					><input v-model="studio.prefs.followCursor" type="checkbox" />
					{{ t('settings.followCursor') }}</label
				>
				<label
					><input v-model="studio.prefs.multisampling" type="checkbox" />
					{{ t('settings.multisampling') }}</label
				>
				<label
					><input v-model="studio.prefs.recovery" type="checkbox" />
					{{ t('settings.recovery') }}</label
				>
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
					<input v-model="studio.prefs.backgroundColor" type="color" />
				</label>
			</div>
			<p class="studio-settings__muted">{{ t('settings.language') }}</p>
		</section>

		<section class="studio-settings__section">
			<h3>{{ t('settings.shortcuts') }}</h3>
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
		</section>

		<section class="studio-settings__section">
			<h3>{{ t('settings.bridge') }}</h3>
			<label class="studio-form-row">
				{{ t('bridge.endpoint') }}
				<input
					v-model="endpoint"
					class="studio-input"
					type="url"
					placeholder="https://skins.example.org"
					spellcheck="false"
				/>
			</label>
			<p class="studio-settings__muted">{{ t('bridge.endpointHint') }}</p>
			<div class="studio-settings__row">
				<button
					type="button"
					class="studio-btn studio-btn--small"
					:disabled="checking"
					@click="saveEndpoint"
				>
					{{ t('bridge.check') }}
				</button>
				<span
					v-if="health"
					:class="
						health.reachable && health.auth_ready && health.skins_ready
							? 'studio-settings__ok'
							: 'studio-settings__bad'
					"
				>
					{{ health.service ?? '—' }} {{ health.version ?? '' }} · auth:
					{{ health.auth_adapter ?? '—' }} {{ health.auth_ready ? '✓' : '✗' }} · SkinsRestorer
					{{ health.skins_ready ? '✓' : '✗' }} · MineSkin
					{{ health.generator_ready ? '✓' : '✗' }}
					<template v-if="health.message">— {{ health.message }}</template>
				</span>
			</div>
		</section>
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
		font-size: 14px;
	}
}

.studio-settings__grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
	gap: 8px 16px;

	label {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--eden-text-secondary);
		font-size: 12px;
	}

	input[type='checkbox'],
	input[type='range'] {
		accent-color: var(--eden-accent);
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
