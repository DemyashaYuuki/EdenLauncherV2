<script setup lang="ts">
import { CircleUserIcon } from '@modrinth/assets'
import { ButtonStyled } from '@modrinth/ui'
import { Dropdown } from 'floating-vue'
import { computed, ref } from 'vue'

import AccountsCard from '@/components/ui/AccountsCard.vue'
import type { Skin } from '@/helpers/skins'

type AccountsCardHandle = InstanceType<typeof AccountsCard>

const accountsCard = ref<AccountsCardHandle | null>(null)
const menuOpen = ref(false)
const loginDisabled = computed(() => accountsCard.value?.loginDisabled ?? false)

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
})
</script>

<template>
	<Dropdown
		placement="bottom-end"
		:triggers="['click']"
		:hide-triggers="['click']"
		@show="menuOpen = true"
		@hide="menuOpen = false"
	>
		<ButtonStyled :type="menuOpen ? 'standard' : 'transparent'" circular>
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

		<template #popper>
			<section class="account-switcher-menu" aria-label="Выбор игрового аккаунта">
				<div class="account-switcher-menu__heading">
					<CircleUserIcon />
					<div>
						<strong>Игровой аккаунт</strong>
						<span>Выберите аккаунт для запуска Minecraft</span>
					</div>
				</div>
				<Suspense>
					<AccountsCard ref="accountsCard" />
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
}

.account-switcher-menu__heading > svg {
	width: 1.35rem;
	height: 1.35rem;
	color: var(--color-brand);
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

