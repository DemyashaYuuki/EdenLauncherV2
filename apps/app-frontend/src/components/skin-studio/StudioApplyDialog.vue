<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import StudioDialog from '@/components/skin-studio/StudioDialog.vue'
import * as api from '@/helpers/skin-studio'
import { remoteVariant } from '@/skin-studio/engine/model'
import { encodePng } from '@/skin-studio/engine/png'
import { type StudioKey, useStudioText } from '@/skin-studio/i18n'
import { useSkinStudio } from '@/skin-studio/store'

export type ApplyMode =
	| { kind: 'microsoft' }
	| { kind: 'server' }
	| { kind: 'look'; look: api.BridgeLook }

const props = defineProps<{ open: boolean; mode: ApplyMode | null }>()
const emit = defineEmits<{ (event: 'close'): void }>()
const studio = useSkinStudio()
const t = useStudioText()

type Phase = 'confirm' | 'working' | 'done' | 'error'
const phase = ref<Phase>('confirm')
const statusText = ref('')
const job = ref<api.BridgeJob | null>(null)
let pollTimer: ReturnType<typeof setTimeout> | null = null
let idempotencyKey = ''
let cancelled = false

const MICROSOFT_TIMEOUT_MS = 60_000
const JOB_TIMEOUT_MS = 180_000

const doc = computed(() => {
	void studio.revision
	return studio.active
})

const targetName = computed(() => {
	if (!props.mode) return ''
	if (props.mode.kind === 'microsoft') return `${studio.selectedAccount?.name ?? ''} · Microsoft`
	return `${studio.bridge?.link?.player_name ?? ''} · EdenWorld`
})

const summary = computed(() => {
	const d = doc.value
	if (!d || !props.mode) return ''
	if (props.mode.kind === 'look') return props.mode.look.label
	return t('apply.confirm.body', {
		target: targetName.value,
		model: d.model.name,
		w: d.image.width,
		h: d.image.height,
	})
})

function stopPolling(): void {
	if (pollTimer) clearTimeout(pollTimer)
	pollTimer = null
}

watch(
	() => props.open,
	(open) => {
		if (open) {
			phase.value = 'confirm'
			statusText.value = ''
			job.value = null
			cancelled = false
			idempotencyKey = `apply-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
		} else {
			stopPolling()
		}
	},
)

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error('timeout')), ms)
		promise.then(
			(value) => {
				clearTimeout(timer)
				resolve(value)
			},
			(error) => {
				clearTimeout(timer)
				reject(error)
			},
		)
	})
}

async function applyMicrosoft(): Promise<void> {
	const d = doc.value
	const account = studio.selectedAccount
	if (!d || !account) return
	const variant = remoteVariant(d.model)
	if (!variant) return
	phase.value = 'working'
	statusText.value = t('apply.state.uploading')
	try {
		const png = await encodePng(d.image)
		const report = await withTimeout(
			api.applyMicrosoftSkin(account.id, png, variant === 'slim' ? 'SLIM' : 'CLASSIC'),
			MICROSOFT_TIMEOUT_MS,
		)
		if (report.status === 'applied') {
			phase.value = 'done'
			statusText.value = t('apply.state.applied', { name: account.name })
		} else {
			phase.value = 'error'
			statusText.value = t(`apply.state.${report.status}` as StudioKey, {
				message: report.message ?? '',
			})
		}
	} catch (error) {
		phase.value = 'error'
		statusText.value =
			(error as Error).message === 'timeout'
				? t('apply.state.timeout')
				: t('apply.state.failed', { message: (error as Error).message })
	}
}

function describeJob(value: api.BridgeJob): string {
	const name = studio.bridge?.link?.player_name ?? ''
	return t(`bridge.job.${value.status}` as StudioKey, {
		name,
		message: value.message ?? value.error_code ?? '',
	})
}

async function pollJob(started: number): Promise<void> {
	const current = job.value
	if (!current || cancelled) return
	try {
		const next = await api.bridgeJob(current.job_id)
		job.value = next
		statusText.value = describeJob(next)
		if (next.status === 'applied' || next.status === 'saved_offline') {
			phase.value = 'done'
			return
		}
		if (next.status === 'failed' || next.status === 'cancelled') {
			phase.value = 'error'
			return
		}
	} catch (error) {
		statusText.value = t('bridge.unreachable', { message: (error as Error).message })
	}
	if (Date.now() - started > JOB_TIMEOUT_MS) {
		phase.value = 'error'
		statusText.value = t('apply.state.timeout')
		return
	}
	pollTimer = setTimeout(() => void pollJob(started), 1500)
}

async function applyServer(): Promise<void> {
	const d = doc.value
	if (!props.mode) return
	phase.value = 'working'
	statusText.value = t('bridge.job.queued')
	try {
		let started: api.BridgeJob
		if (props.mode.kind === 'look') {
			started = await api.bridgeApplyLook(props.mode.look.id, idempotencyKey)
		} else {
			if (!d) return
			const variant = remoteVariant(d.model)
			if (!variant) return
			started = await api.bridgeApplySkin(await encodePng(d.image), variant, idempotencyKey)
		}
		job.value = started
		statusText.value = describeJob(started)
		void pollJob(Date.now())
	} catch (error) {
		phase.value = 'error'
		statusText.value = t('bridge.unreachable', { message: (error as Error).message })
	}
}

async function cancelJob(): Promise<void> {
	cancelled = true
	stopPolling()
	const current = job.value
	if (current) {
		try {
			job.value = await api.bridgeCancelJob(current.job_id)
			statusText.value = describeJob(job.value)
		} catch (error) {
			statusText.value = t('bridge.unreachable', { message: (error as Error).message })
		}
	}
	phase.value = 'error'
}

function start(): void {
	if (props.mode?.kind === 'microsoft') void applyMicrosoft()
	else void applyServer()
}

function retry(): void {
	cancelled = false
	start()
}

onBeforeUnmount(stopPolling)
</script>

<template>
	<StudioDialog
		:open="open"
		:title="t('apply.confirm.title')"
		:closable="phase !== 'working' || mode?.kind !== 'microsoft'"
		@close="emit('close')"
	>
		<p>{{ summary }}</p>
		<p v-if="mode?.kind !== 'microsoft' && phase !== 'done'" class="studio-note">
			{{ t('bridge.job.queuedNote') }}
		</p>
		<div v-if="phase === 'working'" class="studio-progress" role="status" aria-live="polite">
			<span class="studio-spinner" aria-hidden="true" />
			{{ statusText }}
		</div>
		<p v-else-if="phase === 'done'" class="studio-note studio-note--success" role="status">
			{{ statusText }}
		</p>
		<p v-else-if="phase === 'error'" class="studio-note studio-note--error" role="alert">
			{{ statusText }}
		</p>
		<template #actions>
			<template v-if="phase === 'confirm'">
				<button type="button" class="studio-btn" @click="emit('close')">
					{{ t('action.cancel') }}
				</button>
				<button type="button" class="studio-btn studio-btn--primary" @click="start">
					{{ t('apply.button') }}
				</button>
			</template>
			<template v-else-if="phase === 'working'">
				<button
					v-if="job && (job.status === 'queued' || job.status === 'generating')"
					type="button"
					class="studio-btn"
					@click="cancelJob"
				>
					{{ t('bridge.job.cancel') }}
				</button>
			</template>
			<template v-else-if="phase === 'error'">
				<button type="button" class="studio-btn" @click="emit('close')">
					{{ t('action.close') }}
				</button>
				<button type="button" class="studio-btn studio-btn--primary" @click="retry">
					{{ t('action.retry') }}
				</button>
			</template>
			<button v-else type="button" class="studio-btn studio-btn--primary" @click="emit('close')">
				{{ t('action.done') }}
			</button>
		</template>
	</StudioDialog>
</template>
