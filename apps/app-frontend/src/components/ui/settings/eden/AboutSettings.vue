<script setup lang="ts">
import { injectNotificationManager } from '@modrinth/ui'
import { getVersion } from '@tauri-apps/api/app'
import { openUrl } from '@tauri-apps/plugin-opener'

import EdenIcon from '@/components/ui/eden/EdenIcon.vue'
import EdenMark from '@/components/ui/eden/EdenMark.vue'
import { LAUNCHER_REPOSITORY_URL } from '@/helpers/astralrinth/update'
import {
	EDENWORLD_DISCORD_URL,
	EDENWORLD_PROJECT_URL,
	EDENWORLD_TELEGRAM_URL,
} from '@/helpers/edenworld'

const { handleError } = injectNotificationManager()
const version = await getVersion().catch(() => null)

async function open(url: string) {
	await openUrl(url).catch(handleError)
}
</script>

<template>
	<div class="eden-about">
		<div class="eden-about__identity">
			<EdenMark :size="112" />
			<h3>EdenLauncher</h3>
			<p>Твой мир. Твой Eden.</p>
		</div>
		<p class="eden-about__lead">
			Лаунчер проекта EdenWorld на базе AstralRinth / Theseus.<br />
			Играй, исследуй и оставайся на связи с сообществом.
		</p>
		<div class="eden-about__actions">
			<button
				type="button"
				class="eden-btn eden-btn--secondary"
				@click="open(EDENWORLD_PROJECT_URL)"
			>
				<EdenIcon name="globe" :size="18" /> Сайт проекта
			</button>
			<button
				type="button"
				class="eden-btn eden-btn--secondary"
				@click="open(LAUNCHER_REPOSITORY_URL)"
			>
				<EdenIcon name="external" :size="18" /> GitHub
			</button>
			<button
				type="button"
				class="eden-btn eden-btn--primary"
				@click="open(EDENWORLD_TELEGRAM_URL)"
			>
				<EdenIcon name="users" :size="18" /> Telegram
			</button>
			<button
				type="button"
				class="eden-btn eden-btn--secondary"
				@click="open(EDENWORLD_DISCORD_URL)"
			>
				<EdenIcon name="users" :size="18" /> Discord
			</button>
		</div>
		<p class="eden-about__meta">
			<template v-if="version">Версия {{ version }} · </template>
			Лицензия GPL-3.0, уведомления Modrinth Theseus и AstralRinth сохранены в репозитории
		</p>
	</div>
</template>

<style scoped lang="scss">
.eden-about {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 22px;
	padding: 8px 0 12px;
	text-align: center;
}

.eden-about__identity {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 10px;
	padding-bottom: 26px;
	border-bottom: 1px solid var(--eden-border);

	h3 {
		margin: 12px 0 0;
		color: var(--eden-text);
		font-size: 36px;
		font-weight: 650;
	}

	p {
		margin: 0;
		color: var(--eden-text-secondary);
		font-size: 16px;
	}
}

.eden-about__lead {
	margin: 0;
	color: var(--eden-text-secondary);
	font-size: 14px;
	line-height: 1.8;
}

.eden-about__actions {
	display: flex;
	flex-wrap: wrap;
	justify-content: center;
	gap: 12px;
}

.eden-about__meta {
	margin: 6px 0 0;
	color: var(--eden-text-secondary);
	font-size: 12px;
}
</style>
