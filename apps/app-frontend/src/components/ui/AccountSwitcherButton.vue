<script setup lang="ts">
import { CircleUserIcon } from '@modrinth/assets'
import { ButtonStyled } from '@modrinth/ui'
import { Dropdown } from 'floating-vue'
import { computed, ref } from 'vue'

import AccountsCard from '@/components/ui/AccountsCard.vue'
import EdenIcon from '@/components/ui/eden/EdenIcon.vue'
import type { Skin } from '@/helpers/skins'

type AccountsCardHandle = InstanceType<typeof AccountsCard>

const props = withDefaults(
	defineProps<{
		/** `icon` keeps the original round button, `sidebar` shows the active account card. */
		variant?: 'icon' | 'sidebar'
		compact?: boolean
	}>(),
	{ variant: 'icon', compact: false },
)

const accountsCard = ref<AccountsCardHandle | null>(null)
const menuOpen = ref(false)
const loginDisabled = computed(() => accountsCard.value?.loginDisabled ?? false)
const accountName = computed<string | null>(() => accountsCard.value?.activeAccountName ?? null)
const accountAvatar = computed<string | null>(() => accountsCard.value?.avatarUrl ?? null)
const accountCaption = computed(() => {
	if (!accountsCard.value) return 'Загружаем аккаунт…'
	if (!accountName.value) return 'Добавить игровой аккаунт'
	return 'Сменить аккаунт'
})
const placement = computed(() => (props.variant === 'sidebar' ? 'right-end' : 'bottom-end'))

async function refreshValues() {
	await accountsCard.value?.refreshValues()
}

async function setEquippedSkin(skin: Skin) {
	await accountsCard.value?.setEquippedSkin(skin)
}

function setLoginDisabled(value: boolean) {
	accountsCard.value?.setLoginDisabled(value)
}

function showAccountLoginModal() {
	accountsCard.value?.showAccountLoginModal()
}

defineExpose({
	refreshValues,
	setEquippedSkin,
	setLoginDisabled,
	showAccountLoginModal,
	loginDisabled,
	accountName,
	accountAvatar,
})
</script>

<template>
	<Dropdown
		:placement="placement"
		:triggers="['click']"
		:hide-triggers="['click']"
		eager-mount
		@show="menuOpen = true"
		@hide="menuOpen = false"
	>
		<button
			v-if="variant === 'sidebar'"
			v-tooltip.right="compact ? (accountName ?? 'Игровой аккаунт') : undefined"
			type="button"
			class="eden-account-card"
			:class="{ 'eden-account-card--open': menuOpen, 'eden-account-card--compact': compact }"
			:aria-label="`Игровой аккаунт: ${accountName ?? 'не выбран'}. ${accountCaption}`"
			:aria-expanded="menuOpen"
			data-tauri-drag-region-exclude
		>
			<span class="eden-account-card__avatar">
				<img v-if="accountAvatar && accountName" :src="accountAvatar" alt="" />
				<EdenIcon v-else name="user" :size="18" />
			</span>
			<span v-if="!compact" class="eden-account-card__copy">
				<strong>{{ accountName ?? 'Нет аккаунта' }}</strong>
				<small>{{ accountCaption }}</small>
			</span>
			<EdenIcon v-if="!compact" name="chevron" :size="16" class="eden-account-card__chevron" />
		</button>
		<ButtonStyled v-else :type="menuOpen ? 'standard' : 'transparent'" circular>
			<button
				v-tooltip.bottom="'Игровой аккаунт'"
				type="button"
				class="account-switcher-button"
				data-tauri-drag-region-exclude
				aria-label="Выбрать игровой аккаунт"
			>
				<CircleUserIcon />
			</button>
		</ButtonStyled>

		<template #popper="{ hide }">
			<section class="account-switcher-menu" aria-label="Выбор игрового аккаунта">
				<div class="account-switcher-menu__heading">
					<EdenIcon name="user" :size="20" />
					<div>
						<strong>Игровой аккаунт</strong>
						<span>Выберите аккаунт для запуска Minecraft</span>
					</div>
				</div>
				<Suspense>
					<AccountsCard ref="accountsCard" :close-menu="hide" />
				</Suspense>
			</section>
		</template>
	</Dropdown>
</template>

<style scoped lang="scss">
.account-switcher-button {
	width: 2.1rem;
	height: 2.1rem;
	padding: 0;
}

.account-switcher-button svg {
	width: 1.2rem;
	height: 1.2rem;
}

.eden-account-card {
	display: flex;
	width: 100%;
	min-height: 64px;
	box-sizing: border-box;
	align-items: center;
	gap: 10px;
	padding: 10px;
	border: 1px solid var(--eden-border);
	border-radius: 14px;
	color: var(--eden-text);
	background: var(--eden-surface);
	font: inherit;
	text-align: left;
	cursor: pointer;
	transition:
		border-color var(--eden-motion-hover) ease,
		background-color var(--eden-motion-hover) ease;

	&:hover,
	&.eden-account-card--open {
		border-color: var(--eden-border-strong);
		background: var(--eden-surface-raised);
	}

	&:focus-visible {
		outline: 2px solid var(--eden-focus);
		outline-offset: 3px;
	}
}

.eden-account-card--compact {
	width: 48px;
	min-height: 48px;
	justify-content: center;
	padding: 6px;
}

.eden-account-card__avatar {
	display: grid;
	width: 32px;
	height: 32px;
	flex: 0 0 auto;
	overflow: hidden;
	place-items: center;
	border-radius: 8px;
	color: var(--eden-accent-text);
	background: var(--eden-surface-raised);

	img {
		width: 100%;
		height: 100%;
		image-rendering: pixelated;
		object-fit: cover;
	}
}

.eden-account-card__copy {
	display: flex;
	min-width: 0;
	flex: 1;
	flex-direction: column;
	gap: 3px;

	strong {
		overflow: hidden;
		font-size: 13px;
		font-weight: 650;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	small {
		overflow: hidden;
		color: var(--eden-text-secondary);
		font-size: 11px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
}

.eden-account-card__chevron {
	color: var(--eden-text-secondary);
}

.account-switcher-menu {
	width: 19rem;
	padding: 0.8rem;
	color: var(--color-text-default);
}

.account-switcher-menu__heading {
	display: flex;
	align-items: center;
	gap: 0.7rem;
	padding: 0.25rem 0.25rem 0.45rem;
	color: var(--eden-accent-text);
}

.account-switcher-menu__heading div {
	display: flex;
	min-width: 0;
	flex-direction: column;
}

.account-switcher-menu__heading strong {
	color: var(--color-text-primary);
	font-size: 0.85rem;
}

.account-switcher-menu__heading span {
	margin-top: 0.1rem;
	color: var(--color-text-tertiary);
	font-size: 0.68rem;
}
</style>
