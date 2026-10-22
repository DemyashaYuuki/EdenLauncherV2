<script setup lang="ts">
import { defineMessages, useVIntl } from '@modrinth/ui'
import { openUrl } from '@tauri-apps/plugin-opener'
import { computed, inject, type Ref } from 'vue'
import { useRouter } from 'vue-router'

import EdenIcon from '@/components/ui/eden/EdenIcon.vue'
import { getExternalAuthProvider } from '@/models/astralrinth/authentication'

const props = defineProps<{
	accountType?: string
	accountName?: string
}>()

const messages = defineMessages({
	title: {
		id: 'edenlauncher.app.skins.unsupported-account.title',
		defaultMessage: 'Нужен аккаунт Microsoft',
	},
	description: {
		id: 'edenlauncher.app.skins.unsupported-account.description',
		defaultMessage:
			'Скины можно менять только с аккаунтом Microsoft. Выберите или добавьте аккаунт Microsoft, чтобы продолжить.',
	},
	returnHome: {
		id: 'edenlauncher.app.skins.unsupported-account.return-home',
		defaultMessage: 'На главную',
	},
	externalTitle: {
		id: 'edenlauncher.app.skins.unsupported-account.external.title',
		defaultMessage: 'Скин {providerName}',
	},
	externalDescription: {
		id: 'edenlauncher.app.skins.unsupported-account.external.description',
		defaultMessage:
			'Вы вошли через {providerName}. Загрузить и выбрать скин можно на сайте этого сервиса.',
	},
	externalAction: {
		id: 'edenlauncher.app.skins.unsupported-account.external.action',
		defaultMessage: 'Открыть {providerName}',
	},
})

type AccountsHandle = {
	accountName?: string | null
	accountAvatar?: string | null
	showAccountLoginModal?: () => void
}

const router = useRouter()
const { formatMessage } = useVIntl()
const accountsCard = inject<Ref<AccountsHandle | null> | null>('accountsCard', null)

const externalAuthProvider = computed(() => getExternalAuthProvider(props.accountType))
const accountName = computed(() => props.accountName ?? accountsCard?.value?.accountName ?? null)
const accountAvatar = computed(() => accountsCard?.value?.accountAvatar ?? null)
const canAddAccount = computed(
	() => typeof accountsCard?.value?.showAccountLoginModal === 'function',
)
const accountKind = computed(() => {
	if (externalAuthProvider.value) return `Аккаунт ${externalAuthProvider.value.name}`
	if (props.accountType === 'offline') return 'Офлайн-аккаунт'
	return 'Игровой аккаунт'
})
const restrictionTitle = computed(() =>
	externalAuthProvider.value
		? formatMessage(messages.externalTitle, { providerName: externalAuthProvider.value.name })
		: formatMessage(messages.title),
)
const restrictionText = computed(() => {
	if (externalAuthProvider.value) {
		return formatMessage(messages.externalDescription, {
			providerName: externalAuthProvider.value.name,
		})
	}
	if (props.accountType === 'offline') {
		return 'У офлайн-аккаунта нет профиля Minecraft, поэтому лаунчер не может загрузить для него скин. Добавьте аккаунт Microsoft, чтобы менять скин и модель.'
	}
	return formatMessage(messages.description)
})

function returnHome() {
	void router.push({ path: '/' })
}

function addAccount() {
	accountsCard?.value?.showAccountLoginModal?.()
}

function openExternalProviderSkins() {
	if (externalAuthProvider.value) {
		void openUrl(externalAuthProvider.value.skinManagementUrl)
	}
}
</script>

<template>
	<div class="eden-page eden-skins-unsupported">
		<header class="eden-page-header">
			<div>
				<h1>Скины и аккаунт</h1>
				<p>Твой образ в EdenWorld</p>
			</div>
		</header>

		<div class="eden-skins-unsupported__grid">
			<section class="eden-card eden-skins-unsupported__account" aria-label="Активный аккаунт">
				<div class="eden-skins-unsupported__identity">
					<span class="eden-skins-unsupported__avatar">
						<img v-if="accountAvatar && accountName" :src="accountAvatar" alt="" />
						<EdenIcon v-else name="user" :size="24" />
					</span>
					<div>
						<strong>{{ accountName ?? 'Аккаунт не выбран' }}</strong>
						<span>{{ accountKind }}</span>
					</div>
				</div>
				<div class="eden-skins-unsupported__actions">
					<button
						type="button"
						class="eden-btn eden-btn--secondary"
						:disabled="!canAddAccount"
						@click="addAccount"
					>
						<EdenIcon name="plus" :size="18" /> Добавить аккаунт
					</button>
					<button type="button" class="eden-btn eden-btn--ghost" @click="returnHome">
						{{ formatMessage(messages.returnHome) }}
					</button>
				</div>
			</section>

			<section class="eden-card eden-skins-unsupported__notice" role="status">
				<h2>
					<EdenIcon name="info" :size="20" />
					{{ restrictionTitle }}
				</h2>
				<p>{{ restrictionText }}</p>
				<button
					v-if="externalAuthProvider"
					type="button"
					class="eden-btn eden-btn--primary"
					@click="openExternalProviderSkins"
				>
					{{ formatMessage(messages.externalAction, { providerName: externalAuthProvider.name }) }}
					<EdenIcon name="external" :size="18" />
				</button>
			</section>
		</div>
	</div>
</template>

<style scoped lang="scss">
.eden-skins-unsupported__grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 24px;
	align-items: start;
}

.eden-skins-unsupported__account,
.eden-skins-unsupported__notice {
	display: flex;
	flex-direction: column;
	gap: 22px;
	padding: 26px;
}

.eden-skins-unsupported__identity {
	display: flex;
	align-items: center;
	gap: 18px;

	div {
		display: flex;
		min-width: 0;
		flex-direction: column;
		gap: 8px;
	}

	strong {
		overflow: hidden;
		color: var(--eden-text);
		font-size: 23px;
		font-weight: 650;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	span {
		color: var(--eden-text-secondary);
		font-size: 13px;
	}
}

.eden-skins-unsupported__avatar {
	display: grid;
	width: 56px;
	height: 56px;
	flex: 0 0 auto;
	overflow: hidden;
	place-items: center;
	border-radius: 10px;
	color: var(--eden-accent-text);
	background: var(--eden-surface-raised);

	img {
		width: 100%;
		height: 100%;
		image-rendering: pixelated;
	}
}

.eden-skins-unsupported__actions {
	display: flex;
	flex-wrap: wrap;
	gap: 12px;
}

.eden-skins-unsupported__notice {
	h2 {
		display: flex;
		align-items: center;
		gap: 12px;
		margin: 0;
		color: var(--eden-text);
		font-size: 17px;
		font-weight: 650;

		:deep(.eden-icon) {
			color: var(--eden-accent-text);
		}
	}

	p {
		margin: 0;
		color: var(--eden-text-secondary);
		font-size: 13px;
		line-height: 1.7;
	}

	.eden-btn {
		align-self: flex-start;
	}
}

@media (max-width: 1099px) {
	.eden-skins-unsupported__grid {
		grid-template-columns: 1fr;
	}
}
</style>
