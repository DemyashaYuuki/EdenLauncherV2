<script setup lang="ts">
import { LogInIcon, LogOutIcon, MessageIcon, UserIcon } from '@modrinth/assets'
import { Avatar, NewModal } from '@modrinth/ui'
import { openUrl } from '@tauri-apps/plugin-opener'
import { ref } from 'vue'

import FriendsList from '@/components/ui/friends/FriendsList.vue'
import { EDENWORLD_DISCORD_URL } from '@/helpers/edenworld'
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
const tab = ref<'friends' | 'chat'>('friends')
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
			<nav>
				<button :class="{ active: tab === 'friends' }" @click="tab = 'friends'">Друзья</button
				><button :class="{ active: tab === 'chat' }" @click="tab = 'chat'">Чат</button>
			</nav>
			<section v-if="tab === 'friends'" class="friends-panel">
				<FriendsList :credentials="credentials ?? null" :sign-in="signIn" />
			</section>
			<section v-else class="chat-panel">
				<MessageIcon />
				<h3>Чат сообщества EdenWorld</h3>
				<p>
					Ваш аккаунт Modrinth используется как профиль в лаунчере. Сам Modrinth не предоставляет
					API личных сообщений, поэтому живой чат проекта открывается в Discord.
				</p>
				<button class="primary" :disabled="!credentials" @click="openUrl(EDENWORLD_DISCORD_URL)">
					<MessageIcon /> Открыть чат проекта
				</button>
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
nav {
	display: flex;
	gap: 0.25rem;
	margin: 0.8rem 0;
}
nav button {
	border-color: transparent !important;
	background: transparent !important;
}
nav button.active {
	color: var(--color-brand) !important;
	background: var(--color-brand-highlight) !important;
}
.friends-panel {
	max-height: 27rem;
	overflow: auto;
	padding: 0.4rem;
}
.chat-panel {
	display: grid;
	min-height: 20rem;
	place-content: center;
	justify-items: center;
	text-align: center;
}
.chat-panel > svg {
	width: 3rem;
	height: 3rem;
	color: var(--color-brand);
}
.chat-panel h3 {
	margin: 0.8rem 0 0.25rem;
}
.chat-panel p {
	max-width: 32rem;
	margin: 0.2rem 0 1rem;
	color: var(--color-text-tertiary);
	line-height: 1.5;
}
</style>
