<script setup lang="ts">
import { NewModal } from '@modrinth/ui'
import { computed, ref } from 'vue'

import EdenIcon from '@/components/ui/eden/EdenIcon.vue'
import PlayerHead from '@/components/ui/PlayerHead.vue'
import { useEdenServerStatus } from '@/composables/eden/server-status'

const server = useEdenServerStatus()
const modal = ref<InstanceType<typeof NewModal> | null>(null)

const players = computed(() => server.status.value?.players?.sample ?? [])
const hiddenPlayers = computed(() =>
	Math.max(0, (server.playersOnline.value ?? 0) - players.value.length),
)

async function show() {
	modal.value?.show()
	await server.refresh()
}

defineExpose({ show })
</script>

<template>
	<NewModal ref="modal" header="Игроки EdenWorld" max-width="560px">
		<div class="eden-players" aria-live="polite">
			<div class="eden-players__summary">
				<span class="eden-icon-tile"><EdenIcon name="server" /></span>
				<div>
					<strong>{{ server.address }}</strong>
					<span
						class="eden-status"
						:class="{
							'eden-status--success': server.online.value,
							'eden-status--error': server.failed.value,
							'eden-status--pending': server.loading.value && !server.online.value,
						}"
					>
						<span class="eden-status-dot"></span>
						{{ server.stateLabel.value }}
						<template v-if="server.ping.value !== null"> · {{ server.ping.value }} мс</template>
					</span>
				</div>
				<strong v-if="server.playersLabel.value" class="eden-players__count">
					{{ server.playersLabel.value }}
				</strong>
			</div>

			<div v-if="server.loading.value && !server.status.value" class="eden-players__state">
				Обновляем список игроков…
			</div>
			<div v-else-if="server.failed.value" class="eden-players__state">
				Сервер сейчас не отвечает. Попробуйте обновить позже.
			</div>
			<div v-else-if="(server.playersOnline.value ?? 0) === 0" class="eden-players__state">
				Сейчас на сервере никого нет.
			</div>
			<template v-else>
				<ul v-if="players.length" class="eden-players__list">
					<li v-for="player in players" :key="player.id || player.name">
						<PlayerHead :name="player.name" :uuid="player.id" />
						<span>{{ player.name }}</span>
					</li>
				</ul>
				<p v-else class="eden-players__note">
					Сервер сообщил количество игроков, но скрыл их ники.
				</p>
				<p v-if="hiddenPlayers > 0 && players.length" class="eden-players__note">
					Ещё {{ hiddenPlayers }} не отображаются в публичном ответе сервера.
				</p>
			</template>

			<div class="eden-players__actions">
				<button
					type="button"
					class="eden-btn eden-btn--secondary eden-btn--compact"
					:disabled="server.loading.value"
					@click="server.refresh()"
				>
					<EdenIcon name="refresh" :size="16" />
					Обновить
				</button>
			</div>
		</div>
	</NewModal>
</template>

<style scoped lang="scss">
.eden-players {
	display: flex;
	min-width: min(480px, 80vw);
	flex-direction: column;
	gap: 16px;
}

.eden-players__summary {
	display: flex;
	align-items: center;
	gap: 14px;
	padding: 14px;
	border: 1px solid var(--eden-border);
	border-radius: var(--eden-radius-card);
	background: var(--eden-surface);

	> div {
		display: flex;
		min-width: 0;
		flex: 1;
		flex-direction: column;
		gap: 4px;
	}

	strong {
		color: var(--eden-text);
		font-size: 14px;
	}
}

.eden-players__count {
	white-space: nowrap;
}

.eden-players__state,
.eden-players__note {
	margin: 0;
	padding: 18px;
	border-radius: var(--eden-radius-control);
	color: var(--eden-text-secondary);
	background: var(--eden-surface-raised);
	font-size: 13px;
}

.eden-players__list {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
	margin: 0;
	padding: 0;
	list-style: none;

	li {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 10px;
		border: 1px solid var(--eden-border);
		border-radius: var(--eden-radius-control);
		color: var(--eden-text);
		background: var(--eden-surface);
		font-size: 13px;
	}

	:deep(.player-head) {
		width: 28px;
		height: 28px;
		border-radius: 6px;
	}
}

.eden-players__actions {
	display: flex;
	justify-content: flex-end;
}
</style>
