<script setup lang="ts">
import { UsersIcon } from '@modrinth/assets'
import { injectNotificationManager } from '@modrinth/ui'
import { openUrl } from '@tauri-apps/plugin-opener'
import { computed, inject, type Ref } from 'vue'

import EdenIcon from '@/components/ui/eden/EdenIcon.vue'
import FriendsList from '@/components/ui/friends/FriendsList.vue'
import { EDENWORLD_DISCORD_URL, EDENWORLD_TELEGRAM_URL } from '@/helpers/edenworld'
import type { ModrinthCredentials } from '@/helpers/mr_auth'
import { useRootBreadcrumb } from '@/providers/breadcrumbs'

const { handleError } = injectNotificationManager()
const credentials = inject<Ref<ModrinthCredentials | null | undefined>>('modrinthCredentials')
const requestSignIn = inject<() => void>('requestModrinthSignIn', () => undefined)
// Injected refs are not unwrapped in templates, so expose the plain value.
const currentCredentials = computed(() => credentials?.value ?? null)

useRootBreadcrumb({
	slot: 'root',
	id: 'friends',
	label: 'Друзья',
	to: '/friends',
	visual: { type: 'icon', component: UsersIcon },
})

async function openLink(url: string) {
	await openUrl(url).catch(handleError)
}
</script>

<template>
	<div class="eden-page eden-friends-page">
		<header class="eden-page-header">
			<div>
				<h1>Друзья</h1>
				<p>Люди, с которыми мир становится интереснее · друзья из Modrinth</p>
			</div>
		</header>

		<FriendsList variant="page" :credentials="currentCredentials" :sign-in="requestSignIn" />

		<section class="eden-friends-page__community" aria-labelledby="eden-community-title">
			<p class="eden-eyebrow">Ваше сообщество</p>
			<article class="eden-card eden-community-card">
				<span class="eden-icon-tile"><EdenIcon name="users" /></span>
				<div class="eden-community-card__copy">
					<h2 id="eden-community-title">EdenWorld рядом</h2>
					<p>Новости, помощь и общение в сообществах проекта.</p>
				</div>
				<div class="eden-community-card__actions">
					<button
						type="button"
						class="eden-btn eden-btn--secondary"
						@click="openLink(EDENWORLD_TELEGRAM_URL)"
					>
						<EdenIcon name="external" :size="18" /> Telegram
					</button>
					<button
						type="button"
						class="eden-btn eden-btn--secondary"
						@click="openLink(EDENWORLD_DISCORD_URL)"
					>
						<EdenIcon name="external" :size="18" /> Discord
					</button>
				</div>
			</article>
		</section>
	</div>
</template>

<style scoped lang="scss">
.eden-friends-page__community {
	display: flex;
	flex-direction: column;
	gap: 14px;
	margin-top: 16px;
}

.eden-community-card {
	display: flex;
	align-items: center;
	gap: 20px;
	padding: 24px;
}

.eden-community-card__copy {
	min-width: 0;
	flex: 1;

	h2 {
		margin: 0;
		color: var(--eden-text);
		font-size: 21px;
		font-weight: 650;
	}

	p {
		margin: 8px 0 0;
		color: var(--eden-text-secondary);
		font-size: 13px;
	}
}

.eden-community-card__actions {
	display: flex;
	flex-wrap: wrap;
	gap: 12px;
}

@media (max-width: 1099px) {
	.eden-community-card {
		flex-wrap: wrap;
	}
}
</style>
