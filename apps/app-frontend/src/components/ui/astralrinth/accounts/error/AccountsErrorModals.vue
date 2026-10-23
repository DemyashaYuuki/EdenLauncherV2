<script setup lang="ts">
import { defineMessages, NewModal, useVIntl } from '@modrinth/ui'
import { ref } from 'vue'

import EdenAuthShell from '@/components/ui/eden/EdenAuthShell.vue'
import EdenIcon from '@/components/ui/eden/EdenIcon.vue'

const props = defineProps<{
	maxOfflinePlayerNameLength: number
	minOfflinePlayerNameLength: number
	nameExp: string
}>()

const emit = defineEmits<{
	(event: 'retry-offline'): void
}>()

const { formatMessage } = useVIntl()
const inputOfflineErrorModal = ref<InstanceType<typeof NewModal> | null>(null)
const unexpectedErrorModal = ref<InstanceType<typeof NewModal> | null>(null)

const messages = defineMessages({
	inputOfflineHeader: {
		id: 'edenlauncher.app.minecraft-account.error.input-offline.header',
		defaultMessage: 'Не удалось добавить профиль',
	},
	inputOfflineDescription: {
		id: 'edenlauncher.app.minecraft-account.error.input-offline.description',
		defaultMessage: 'Ник не подходит для локального профиля.',
	},
	inputOfflineLengthHint: {
		id: 'edenlauncher.app.minecraft-account.error.input-offline.length-hint',
		defaultMessage: 'Длина ника — от {min} до {max} символов.',
	},
	inputOfflineFormatHint: {
		id: 'edenlauncher.app.minecraft-account.error.input-offline.format-hint',
		defaultMessage: 'Разрешённые символы: {nameExp}',
	},
	unexpectedHeader: {
		id: 'edenlauncher.app.minecraft-account.error.unexpected.header',
		defaultMessage: 'Не удалось войти',
	},
	unexpectedDescription: {
		id: 'edenlauncher.app.minecraft-account.error.unexpected.description',
		defaultMessage: 'Авторизация не завершена. Попробуйте ещё раз позже.',
	},
	retryAction: {
		id: 'edenlauncher.app.minecraft-account.error.retry-action',
		defaultMessage: 'Попробовать снова',
	},
})

defineExpose({
	hideInputOfflineError: () => inputOfflineErrorModal.value?.hide(),
	showInputOfflineError: () => inputOfflineErrorModal.value?.show(),
	showUnexpectedError: () => unexpectedErrorModal.value?.show(),
})
</script>

<template>
	<NewModal
		ref="inputOfflineErrorModal"
		hide-header
		no-padding
		max-width="1052px"
		:aria-label="formatMessage(messages.inputOfflineHeader)"
	>
		<EdenAuthShell @close="inputOfflineErrorModal?.hide()">
			<div class="eden-auth-view">
				<h2>{{ formatMessage(messages.inputOfflineHeader) }}</h2>
				<p class="eden-auth-view__lead">{{ formatMessage(messages.inputOfflineDescription) }}</p>
				<div class="eden-auth-waiting eden-auth-waiting--error" role="alert">
					<span class="eden-auth-waiting__icon"><EdenIcon name="warning" /></span>
					<strong>Проверьте ник</strong>
					<p>
						{{
							formatMessage(messages.inputOfflineLengthHint, {
								min: props.minOfflinePlayerNameLength,
								max: props.maxOfflinePlayerNameLength,
							})
						}}
						{{ formatMessage(messages.inputOfflineFormatHint, { nameExp: 'a–z, A–Z, 0–9, _' }) }}
					</p>
				</div>
				<div class="eden-auth-actions">
					<button type="button" class="eden-btn eden-btn--primary" @click="emit('retry-offline')">
						<EdenIcon name="refresh" :size="18" /> {{ formatMessage(messages.retryAction) }}
					</button>
				</div>
			</div>
		</EdenAuthShell>
	</NewModal>
	<NewModal
		ref="unexpectedErrorModal"
		hide-header
		no-padding
		max-width="1052px"
		:aria-label="formatMessage(messages.unexpectedHeader)"
	>
		<EdenAuthShell @close="unexpectedErrorModal?.hide()">
			<div class="eden-auth-view">
				<h2>{{ formatMessage(messages.unexpectedHeader) }}</h2>
				<p class="eden-auth-view__lead">
					Подробности ошибки показаны в уведомлении. Существующие аккаунты не изменены.
				</p>
				<div class="eden-auth-waiting eden-auth-waiting--error" role="alert">
					<span class="eden-auth-waiting__icon"><EdenIcon name="warning" /></span>
					<strong>Авторизация не завершена</strong>
					<p>{{ formatMessage(messages.unexpectedDescription) }}</p>
				</div>
				<div class="eden-auth-actions">
					<button
						type="button"
						class="eden-btn eden-btn--secondary"
						@click="unexpectedErrorModal?.hide()"
					>
						Закрыть
					</button>
				</div>
			</div>
		</EdenAuthShell>
	</NewModal>
</template>
