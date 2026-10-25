<script setup lang="ts">
import { computed } from 'vue'

import StudioIcon from '@/components/skin-studio/StudioIcon.vue'
import { remoteVariant } from '@/skin-studio/engine/model'
import { useStudioText } from '@/skin-studio/i18n'
import { useSkinStudio } from '@/skin-studio/store'

const emit = defineEmits<{
	(event: 'apply-microsoft' | 'apply-ely' | 'apply-server' | 'link' | 'add-account'): void
}>()

const studio = useSkinStudio()
const t = useStudioText()

const account = computed(() => studio.selectedAccount)
const doc = computed(() => {
	void studio.revision
	return studio.active
})

const typeLabel = (type: string) =>
	type === 'microsoft'
		? 'Microsoft'
		: type === 'elyby'
			? 'Ely.by'
			: type === 'offline'
				? t('account.offline')
				: t('account.other')

const blocker = computed<string | null>(() => {
	if (studio.accountsLoading) return t('apply.hint.loadingAccounts')
	if (studio.accountsError) return t('apply.hint.accountsError')
	if (!account.value) return t('apply.hint.noAccount')
	const d = doc.value
	if (!d) return t('footer.noDocument')
	if (!remoteVariant(d.model)) return t('apply.hint.notPlayer')
	if (d.image.width !== 64 || (d.image.height !== 64 && d.image.height !== 32))
		return t('apply.hint.hd')
	return null
})

const linked = computed(() => studio.bridge?.link ?? null)

const title = computed(() => {
	if (!account.value) return t('apply.account')
	const type = account.value?.type
	if (type === 'elyby') return t('apply.title.ely')
	if (type === 'microsoft') return t('apply.title.microsoft')
	return t('apply.title.offline')
})

const hint = computed(() => {
	if (blocker.value) return blocker.value
	const type = account.value?.type
	if (type === 'elyby') return t('apply.hint.ely')
	if (type === 'microsoft') return t('apply.hint.microsoft')
	if (linked.value) return t('apply.hint.offlineLinked', { name: linked.value.player_name })
	return t('apply.hint.offline')
})

const buttonLabel = computed(() => {
	const type = account.value?.type
	if (type === 'elyby') return t('apply.buttonEly')
	if (type === 'microsoft') return t('apply.button')
	return linked.value ? t('apply.button') : t('apply.buttonLink')
})

function onApply(): void {
	const type = account.value?.type
	if (type === 'microsoft') emit('apply-microsoft')
	else if (type === 'elyby') emit('apply-ely')
	else if (linked.value) emit('apply-server')
	else emit('link')
}
</script>

<template>
	<section class="studio-apply" :aria-label="title">
		<div class="studio-apply__account">
			<StudioIcon name="account" :size="18" />
			<select
				v-model="studio.selectedAccountId"
				:aria-label="t('apply.account')"
				:disabled="studio.accounts.length === 0 || studio.accountsLoading || studio.accountsError"
			>
				<option v-if="studio.accounts.length === 0" :value="null">—</option>
				<option v-for="a in studio.accounts" :key="a.id" :value="a.id">
					{{ a.name }} · {{ typeLabel(a.type) }}
				</option>
			</select>
			<div class="studio-apply__copy">
				<strong>{{ title }}</strong>
				<p role="status">{{ hint }}</p>
			</div>
		</div>
		<div class="studio-apply__actions">
			<button
				v-if="linked && account && account.type !== 'microsoft' && account.type !== 'elyby'"
				type="button"
				class="studio-apply__secondary"
				@click="emit('link')"
			>
				<StudioIcon name="server" :size="16" />
				{{ linked.player_name }}
			</button>
			<button
				v-if="studio.accountsError && !studio.accountsLoading"
				type="button"
				class="studio-apply__primary"
				@click="studio.refreshAccounts()"
			>
				{{ t('action.retry') }}
			</button>
			<button
				v-else-if="!account && !studio.accountsLoading"
				type="button"
				class="studio-apply__primary"
				@click="emit('add-account')"
			>
				{{ t('action.addAccount') }}
			</button>
			<button
				v-else
				type="button"
				class="studio-apply__primary"
				:disabled="!!blocker"
				@click="onApply"
			>
				{{ buttonLabel }} →
			</button>
		</div>
	</section>
</template>

<style scoped lang="scss">
.studio-apply {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 14px;
	padding: 12px 16px;
	border: 1px solid var(--eden-border);
	border-radius: 12px;
	background: var(--eden-surface);
}

.studio-apply__account {
	display: flex;
	min-width: 0;
	align-items: center;
	gap: 12px;
	color: var(--eden-text-secondary);

	select {
		min-height: 34px;
		max-width: 230px;
		padding: 4px 10px;
		border: 1px solid var(--eden-border);
		border-radius: 9px;
		color: var(--eden-text);
		background: var(--eden-surface-raised);
		font-size: 12px;

		&:focus-visible {
			outline: 2px solid var(--eden-accent);
			outline-offset: 2px;
		}
	}
}

.studio-apply__copy {
	min-width: 0;

	strong {
		color: var(--eden-text);
		font-size: 12px;
	}

	p {
		margin: 2px 0 0;
		overflow: hidden;
		font-size: 11px;
		text-overflow: ellipsis;
	}
}

.studio-apply__actions {
	display: flex;
	flex: 0 0 auto;
	gap: 8px;
}

.studio-apply__primary,
.studio-apply__secondary {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	min-height: 38px;
	padding: 8px 16px;
	border-radius: 10px;
	font-size: 13px;
	font-weight: 650;
	cursor: pointer;

	&:focus-visible {
		outline: 2px solid var(--eden-accent);
		outline-offset: 2px;
	}
}

.studio-apply__primary {
	border: 1px solid transparent;
	color: var(--eden-on-accent, #100d19);
	background: var(--eden-accent);

	&:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
}

.studio-apply__secondary {
	border: 1px solid var(--eden-border);
	color: var(--eden-text);
	background: transparent;
	font-weight: 500;
}
</style>
