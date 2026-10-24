<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import StudioDialog from '@/components/skin-studio/StudioDialog.vue'
import * as api from '@/helpers/skin-studio'
import { useStudioText } from '@/skin-studio/i18n'
import { useSkinStudio } from '@/skin-studio/store'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (event: 'close'): void; (event: 'settings'): void }>()
const studio = useSkinStudio()
const t = useStudioText()

type Phase = 'checking' | 'unconfigured' | 'unavailable' | 'linked' | 'code' | 'awaiting' | 'expired' | 'rejected' | 'error'
const phase = ref<Phase>('checking')
const message = ref('')
const pairing = ref<api.PairStart | null>(null)
const state = ref<api.PairState | null>(null)
const remaining = ref(0)
let timer: ReturnType<typeof setTimeout> | null = null
let countdown: ReturnType<typeof setInterval> | null = null

function stop(): void {
	if (timer) clearTimeout(timer)
	if (countdown) clearInterval(countdown)
	timer = null
	countdown = null
}

const linked = computed(() => studio.bridge?.link ?? null)

async function check(): Promise<void> {
	phase.value = 'checking'
	await studio.refreshBridge()
	if (!studio.bridge?.endpoint) {
		phase.value = 'unconfigured'
		return
	}
	if (studio.bridge.link) {
		phase.value = 'linked'
		return
	}
	try {
		const health = await api.bridgeHealth()
		if (!health.reachable) {
			phase.value = 'unavailable'
			message.value = t('bridge.unreachable', { message: health.message ?? '' })
			return
		}
		if (!health.auth_ready || !health.skins_ready) {
			phase.value = 'unavailable'
			message.value = t('bridge.notReady', { message: health.message ?? '' })
			return
		}
		await startPairing()
	} catch (error) {
		phase.value = 'unavailable'
		message.value = t('bridge.unreachable', { message: (error as Error).message })
	}
}

async function startPairing(): Promise<void> {
	stop()
	try {
		pairing.value = await api.bridgePairStart()
		state.value = null
		phase.value = 'code'
		remaining.value = pairing.value.expires_in_secs
		countdown = setInterval(() => {
			remaining.value = Math.max(0, remaining.value - 1)
		}, 1000)
		poll()
	} catch (error) {
		phase.value = 'error'
		message.value = t('bridge.unreachable', { message: (error as Error).message })
	}
}

function poll(): void {
	timer = setTimeout(async () => {
		try {
			const next = await api.bridgePairPoll()
			state.value = next
			remaining.value = next.expires_in_secs
			if (next.status === 'pending') return poll()
			if (next.status === 'awaiting_launcher') {
				phase.value = 'awaiting'
				return poll()
			}
			stop()
			if (next.status === 'expired' || next.status === 'cancelled') phase.value = 'expired'
			else if (next.status === 'rejected') phase.value = 'rejected'
			else if (next.status === 'confirmed') await finalize()
		} catch (error) {
			message.value = t('bridge.unreachable', { message: (error as Error).message })
			poll()
		}
	}, 1500)
}

async function finalize(): Promise<void> {
	stop()
	try {
		studio.bridge = await api.bridgePairFinalize()
		phase.value = studio.bridge.link ? 'linked' : 'error'
	} catch (error) {
		phase.value = 'error'
		message.value = t('bridge.unreachable', { message: (error as Error).message })
	}
}

async function unlink(): Promise<void> {
	try {
		studio.bridge = await api.bridgeUnlink()
		await startPairing()
	} catch (error) {
		phase.value = 'error'
		message.value = t('bridge.unreachable', { message: (error as Error).message })
	}
}

async function close(): Promise<void> {
	stop()
	if (phase.value === 'code' || phase.value === 'awaiting') await api.bridgePairCancel().catch(() => undefined)
	emit('close')
}

function formatTime(seconds: number): string {
	const m = Math.floor(seconds / 60)
	const s = seconds % 60
	return `${m}:${String(s).padStart(2, '0')}`
}

watch(
	() => props.open,
	(open) => {
		if (open) void check()
		else stop()
	},
)

onBeforeUnmount(stop)
</script>

<template>
	<StudioDialog :open="open" :title="t('bridge.title')" @close="close">
		<p>{{ t('bridge.intro') }}</p>
		<div v-if="phase === 'checking'" class="studio-progress" role="status">
			<span class="studio-spinner" aria-hidden="true" />
		</div>
		<template v-else-if="phase === 'unconfigured'">
			<p class="studio-note">{{ t('bridge.notConfigured') }}</p>
		</template>
		<template v-else-if="phase === 'unavailable' || phase === 'error'">
			<p class="studio-note studio-note--error" role="alert">{{ message }}</p>
		</template>
		<template v-else-if="phase === 'linked' && linked">
			<p class="studio-note studio-note--success" role="status">{{ t('bridge.linked', { name: linked.player_name }) }}</p>
			<p>{{ t('bridge.awaitingUuid', { uuid: linked.player_uuid }) }}</p>
		</template>
		<template v-else-if="(phase === 'code' || phase === 'awaiting') && pairing">
			<div class="studio-code" aria-live="polite">EDEN {{ pairing.code }}</div>
			<ol class="studio-bridge__steps">
				<li>{{ t('bridge.step1') }}</li>
				<li>
					{{ t('bridge.step2') }}
					<div class="studio-command">
						<code>{{ pairing.command }}</code>
					</div>
				</li>
				<li>{{ t('bridge.step3') }}</li>
			</ol>
			<p>{{ t('bridge.expires', { time: formatTime(remaining) }) }}</p>
			<div v-if="phase === 'code'" class="studio-progress" role="status" aria-live="polite">
				<span class="studio-spinner" aria-hidden="true" />
				{{ t('bridge.waiting') }}
			</div>
			<div v-else-if="state" class="studio-note studio-note--success" role="status" aria-live="polite">
				{{ t('bridge.awaiting', { name: state.player_name ?? '' }) }}<br />
				{{ t('bridge.awaitingUuid', { uuid: state.player_uuid ?? '' }) }}
			</div>
		</template>
		<template v-else-if="phase === 'expired'">
			<p class="studio-note studio-note--error" role="alert">{{ t('bridge.expired') }}</p>
		</template>
		<template v-else-if="phase === 'rejected'">
			<p class="studio-note studio-note--error" role="alert">{{ t('bridge.rejected') }}</p>
		</template>
		<template #actions>
			<button v-if="phase === 'unconfigured' || phase === 'unavailable'" type="button" class="studio-btn" @click="emit('settings')">
				{{ t('action.settings') }}
			</button>
			<button v-if="phase === 'unavailable' || phase === 'error'" type="button" class="studio-btn" @click="check">{{ t('action.retry') }}</button>
			<button v-if="phase === 'expired' || phase === 'rejected'" type="button" class="studio-btn" @click="startPairing">{{ t('bridge.newCode') }}</button>
			<button v-if="phase === 'linked'" type="button" class="studio-btn studio-btn--danger" @click="unlink">{{ t('bridge.unlink') }}</button>
			<button v-if="phase === 'awaiting'" type="button" class="studio-btn studio-btn--primary" @click="finalize">{{ t('bridge.finalize') }}</button>
			<button type="button" class="studio-btn" @click="close">{{ t('action.close') }}</button>
		</template>
	</StudioDialog>
</template>

<style scoped lang="scss">
.studio-bridge__steps {
	display: flex;
	flex-direction: column;
	gap: 8px;
	margin: 0;
	padding-left: 18px;
	color: var(--eden-text-secondary);
	font-size: 13px;
	line-height: 1.6;
}
</style>
