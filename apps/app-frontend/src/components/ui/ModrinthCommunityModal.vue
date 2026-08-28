<script setup lang="ts">
import { LogInIcon, LogOutIcon, UserIcon } from '@modrinth/assets'
import { Avatar, NewModal } from '@modrinth/ui'
import { ref } from 'vue'

import FriendsList from '@/components/ui/friends/FriendsList.vue'
import type { ModrinthCredentials } from '@/helpers/mr_auth'

type CredentialsWithUser = ModrinthCredentials & {
	user?: { username: string; avatar_url?: string | null; id: string } | null
}

defineProps<{
	credentials: CredentialsWithUser | null | undefined
	signIn: () => void
	logOut: () => void
}>()

const modal = ref<InstanceType<typeof NewModal> | null>(null)
defineExpose({ show: () => modal.value?.show() })
</script>

<template>
	<NewModal ref="modal" header="Аккаунт Modrinth" max-width="720px">
		<div class="modrinth-community">
			<header v-if="credentials?.user">
				<Avatar :src="credentials.user.avatar_url" size="48px" circle />
				<div>
					<strong>{{ credentials.user.username }}</strong
					><span>Аккаунт Modrinth подключён</span>
				</div>
				<button @click="logOut"><LogOutIcon /> Выйти</button>
			</header>
			<header v-else>
				<div class="account-placeholder"><UserIcon /></div>
				<div>
					<strong>Вход не выполнен</strong><span>Подключите Modrinth для друзей и общения.</span>
				</div>
				<button class="primary" @click="signIn"><LogInIcon /> Войти</button>
			</header>
			<section class="friends-panel">
				<FriendsList :credentials="credentials ?? null" :sign-in="signIn" />
			</section>
		</div>
	</NewModal>
</template>

<style scoped lang="scss">
.modrinth-community {
	padding: 1rem;
}
.modrinth-community header {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	padding-bottom: 1rem;
	border-bottom: 1px solid var(--color-divider);
}
.modrinth-community header > div:nth-child(2) {
	display: flex;
	min-width: 0;
	flex: 1;
	flex-direction: column;
}
.modrinth-community header span {
	color: var(--color-text-tertiary);
}
.modrinth-community button {
	display: inline-flex;
	align-items: center;
	gap: 0.4rem;
	padding: 0.5rem 0.7rem;
	border: 1px solid var(--color-button-border);
	border-radius: 0.5rem;
	color: var(--color-text-primary);
	background: var(--color-button-bg);
	font: inherit;
	cursor: pointer;
}
.modrinth-community button svg {
	width: 1rem;
}
.modrinth-community .primary {
	border-color: var(--color-brand);
	color: var(--color-accent-contrast);
	background: var(--color-brand);
}
.account-placeholder {
	display: grid;
	width: 3rem;
	height: 3rem;
	place-items: center !important;
	flex: 0 0 auto;
	border-radius: 50%;
	color: var(--color-brand);
	background: var(--color-brand-highlight);
}
.friends-panel {
	max-height: 27rem;
	overflow: auto;
	padding: 0.9rem 0.4rem 0.4rem;
}
</style>
