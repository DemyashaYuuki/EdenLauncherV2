<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import StudioIcon from '@/components/skin-studio/StudioIcon.vue'
import * as api from '@/helpers/skin-studio'
import { type StudioKey, useStudioText } from '@/skin-studio/i18n'
import { useSkinStudio } from '@/skin-studio/store'

const emit = defineEmits<{
	(event: 'cape-template' | 'server-help'): void
	(event: 'notify', kind: 'error' | 'info', text: string): void
}>()

const studio = useSkinStudio()
const t = useStudioText()

const microsoftAccount = computed(() =>
	studio.selectedAccount?.type === 'microsoft'
		? studio.selectedAccount
		: (studio.accounts.find((a) => a.type === 'microsoft') ?? null),
)
const capes = ref<api.AccountCapes | null>(null)
const loadingCapes = ref(false)
const busyCape = ref<string | null>(null)

async function loadCapes(): Promise<void> {
	const account = microsoftAccount.value
	if (!account) {
		capes.value = null
		return
	}
	loadingCapes.value = true
	try {
		capes.value = await api.microsoftCapes(account.id)
	} catch (error) {
		capes.value = { status: 'failed', capes: [], message: (error as Error).message }
	} finally {
		loadingCapes.value = false
	}
}

async function setCape(id: string | null): Promise<void> {
	const account = microsoftAccount.value
	if (!account) return
	busyCape.value = id ?? 'none'
	try {
		const report = await api.setMicrosoftCape(account.id, id)
		if (report.status !== 'applied') {
			emit(
				'notify',
				'error',
				t(`apply.state.${report.status}` as StudioKey, { message: report.message ?? '' }),
			)
		}
		await loadCapes()
	} catch (error) {
		emit('notify', 'error', t('apply.state.failed', { message: (error as Error).message }))
	} finally {
		busyCape.value = null
	}
}

const capeStatusText = computed(() => {
	const c = capes.value
	if (!c || c.status === 'applied') return null
	return t(`apply.state.${c.status}` as StudioKey, { message: c.message ?? '' })
})

watch(microsoftAccount, () => void loadCapes(), { immediate: true })
</script>

<template>
	<section class="studio-capes">
		<header>
			<h2>{{ t('capes.title') }}</h2>
			<p>{{ t('capes.subtitle') }}</p>
		</header>
		<div class="studio-capes__grid">
			<article class="studio-capes__card">
				<h3>{{ t('capes.microsoft') }}</h3>
				<p>{{ t('capes.microsoftBody') }}</p>
				<p v-if="!microsoftAccount" class="studio-note">{{ t('capes.noMicrosoft') }}</p>
				<template v-else>
					<p class="studio-capes__account">
						<StudioIcon name="account" :size="15" /> {{ microsoftAccount.name }}
					</p>
					<p v-if="loadingCapes" aria-live="polite">…</p>
					<p v-else-if="capeStatusText" class="studio-note studio-note--error" role="alert">
						{{ capeStatusText }}
						<button type="button" class="studio-btn studio-btn--small" @click="loadCapes">
							{{ t('action.retry') }}
						</button>
					</p>
					<p v-else-if="capes && capes.capes.length === 0">{{ t('capes.none') }}</p>
					<ul v-else-if="capes" class="studio-capes__list">
						<li v-for="cape in capes.capes" :key="cape.id" :class="{ active: cape.active }">
							<span
								class="studio-capes__preview"
								:style="{ backgroundImage: `url(${cape.texture})` }"
								role="img"
								:aria-label="cape.name"
							/>
							<span class="studio-capes__name">{{ cape.name }}</span>
							<span v-if="cape.active" class="studio-chip">{{ t('capes.active') }}</span>
							<button
								v-else
								type="button"
								class="studio-btn studio-btn--small"
								:disabled="busyCape !== null"
								@click="setCape(cape.id)"
							>
								{{ busyCape === cape.id ? '…' : t('capes.equip') }}
							</button>
						</li>
					</ul>
					<button
						v-if="capes?.capes.some((c) => c.active)"
						type="button"
						class="studio-btn studio-btn--small"
						:disabled="busyCape !== null"
						@click="setCape(null)"
					>
						{{ t('capes.unequip') }}
					</button>
				</template>
			</article>

			<article class="studio-capes__card">
				<h3>{{ t('capes.eden') }}</h3>
				<p>{{ t('manual.paused') }}</p>
				<p>{{ t('manual.cape') }}</p>
				<button type="button" class="studio-btn" @click="emit('server-help')">
					{{ t('manual.help') }}
				</button>
				<p class="studio-capes__muted">{{ t('capes.ely') }}: {{ t('capes.elyBody') }}</p>
			</article>

			<article class="studio-capes__card">
				<h3>{{ t('capes.custom') }}</h3>
				<p>{{ t('capes.customBody') }}</p>
				<button type="button" class="studio-btn" @click="emit('cape-template')">
					<StudioIcon name="cape" :size="16" /> {{ t('capes.customOpen') }}
				</button>
			</article>
		</div>
		<p class="studio-capes__note">{{ t('capes.note') }}</p>
	</section>
</template>

<style scoped lang="scss">
.studio-capes {
	display: flex;
	flex-direction: column;
	gap: 18px;

	header h2 {
		margin: 8px 0 4px;
		font-size: 23px;
	}

	header p {
		margin: 0;
		color: var(--eden-text-secondary);
	}
}

.studio-capes__grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
	gap: 16px;
}

.studio-capes__card {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 22px;
	border: 1px solid var(--eden-border);
	border-radius: 14px;
	background: var(--eden-surface);

	h3 {
		margin: 0;
		font-size: 16px;
	}

	p {
		margin: 0;
		color: var(--eden-text-secondary);
		font-size: 12px;
		line-height: 1.6;
	}
}

.studio-capes__account {
	display: flex;
	align-items: center;
	gap: 6px;
	color: var(--eden-text) !important;
}

.studio-capes__list {
	display: flex;
	flex-direction: column;
	gap: 6px;
	margin: 0;
	padding: 0;
	list-style: none;

	li {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 8px;
		border: 1px solid var(--eden-border);
		border-radius: 10px;

		&.active {
			border-color: var(--eden-accent);
		}
	}
}

.studio-capes__preview {
	width: 20px;
	height: 32px;
	flex: 0 0 auto;
	border-radius: 3px;
	background-color: var(--eden-canvas);
	background-position: -2px -2px;
	background-size: 128px 64px;
	image-rendering: pixelated;
}

.studio-capes__name {
	flex: 1;
	font-size: 13px;
}

.studio-capes__muted {
	margin-top: auto !important;
	opacity: 0.8;
}

.studio-badge {
	align-self: flex-start;
	padding: 6px 10px;
	border: 1px solid var(--eden-border);
	border-radius: 20px;
	color: var(--eden-text-secondary);
	background: transparent;
	font-size: 11px;
	cursor: pointer;

	&:focus-visible {
		outline: 2px solid var(--eden-accent);
		outline-offset: 2px;
	}
}

.studio-chip {
	padding: 2px 8px;
	border-radius: 20px;
	color: var(--eden-success);
	background: color-mix(in srgb, var(--eden-success) 14%, transparent);
	font-size: 11px;
}

.studio-capes__note {
	margin: 0;
	padding: 10px 16px;
	border-left: 2px solid var(--eden-accent);
	color: var(--eden-text-secondary);
	background: var(--eden-surface);
	font-size: 12px;
}
</style>
