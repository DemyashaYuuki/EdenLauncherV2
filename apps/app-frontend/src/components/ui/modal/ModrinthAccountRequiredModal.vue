<template>
	<NewModal
		ref="modal"
		:on-hide="handleHide"
		hide-header
		no-padding
		max-width="1052px"
		aria-label="Вход в Modrinth"
	>
		<EdenAuthShell @close="modal?.hide()">
			<div v-if="authenticating === null" class="eden-auth-view">
				<h2>Войти через Modrinth</h2>
				<p class="eden-auth-view__lead">
					Аккаунт сообщества нужен для друзей, профиля и подписок.<br />
					Он отделён от игрового аккаунта Minecraft.
				</p>
				<div class="eden-auth-methods">
					<button type="button" class="eden-auth-method" @click="authenticate('sign-in')">
						<span class="eden-auth-method__icon"><EdenIcon name="user" :size="22" /></span>
						<span class="eden-auth-method__copy">
							<strong>Войти в Modrinth</strong>
							<span>Вход откроется в браузере</span>
						</span>
						<EdenIcon name="chevron" :size="18" />
					</button>
					<button type="button" class="eden-auth-method" @click="authenticate('sign-up')">
						<span class="eden-auth-method__icon"><EdenIcon name="plus" :size="22" /></span>
						<span class="eden-auth-method__copy">
							<strong>Создать аккаунт</strong>
							<span>Регистрация на сайте Modrinth</span>
						</span>
						<EdenIcon name="chevron" :size="18" />
					</button>
				</div>
				<p class="eden-auth-note">
					<EdenIcon name="shield" :size="18" />
					<span>
						Пароль Modrinth не вводится в лаунчере.
						<button type="button" class="eden-btn eden-btn--link" @click="openSupport">
							Помощь со входом
						</button>
					</span>
				</p>
			</div>

			<div v-else class="eden-auth-view">
				<h2>Войти через Modrinth</h2>
				<p class="eden-auth-view__lead">
					В браузере открылась страница входа.<br />
					Заверши вход там и вернись в лаунчер.
				</p>
				<div class="eden-auth-waiting" role="status" aria-live="polite">
					<span class="eden-auth-waiting__icon"><EdenIcon name="external" /></span>
					<strong>Ожидание подтверждения</strong>
					<p>Аккаунт появится автоматически после входа.</p>
				</div>
				<div class="eden-auth-actions">
					<button
						type="button"
						class="eden-btn eden-btn--primary"
						:disabled="reopeningBrowser"
						@click="reopenBrowser"
					>
						<SpinnerIcon v-if="reopeningBrowser" class="animate-spin" />
						<EdenIcon v-else name="refresh" :size="18" />
						Открыть браузер снова
					</button>
					<button type="button" class="eden-btn eden-btn--secondary" @click="modal?.hide()">
						Отмена
					</button>
				</div>
			</div>
		</EdenAuthShell>
	</NewModal>
</template>

<script setup lang="ts">
import { SpinnerIcon } from '@modrinth/assets'
import { NewModal } from '@modrinth/ui'
import { openUrl } from '@tauri-apps/plugin-opener'
import { ref } from 'vue'

import EdenAuthShell from '@/components/ui/eden/EdenAuthShell.vue'
import EdenIcon from '@/components/ui/eden/EdenIcon.vue'
import { cancelLogin, type ModrinthAuthFlow } from '@/helpers/mr_auth'

const props = defineProps<{
	requestAuth: (flow: ModrinthAuthFlow) => Promise<boolean>
}>()

const modal = ref<InstanceType<typeof NewModal>>()
const authenticating = ref<ModrinthAuthFlow | null>(null)
const reopeningBrowser = ref(false)
let resolveShow: ((signedIn: boolean) => void) | undefined
let authenticationId = 0
let activeAuthentication: Promise<void> | undefined

function show(event?: MouseEvent) {
	resetAuthentication(true)
	resolveShow?.(false)
	const modalInstance = modal.value
	if (!modalInstance) return Promise.resolve(false)

	return new Promise<boolean>((resolve) => {
		resolveShow = resolve
		modalInstance.show(event)
	})
}

function showSigningIn(flow: ModrinthAuthFlow = 'sign-in', event?: MouseEvent) {
	const result = show(event)
	authenticate(flow)
	return result
}

function finish(signedIn: boolean) {
	resolveShow?.(signedIn)
	resolveShow = undefined
}

function authenticate(flow: ModrinthAuthFlow) {
	const id = ++authenticationId
	authenticating.value = flow

	const authentication = (async () => {
		try {
			if ((await props.requestAuth(flow)) && authenticationId === id) {
				authenticating.value = null
				activeAuthentication = undefined
				finish(true)
				modal.value?.hide()
			}
		} finally {
			if (authenticationId === id) {
				authenticating.value = null
				activeAuthentication = undefined
			}
		}
	})()

	activeAuthentication = authentication
}

async function reopenBrowser() {
	const flow = authenticating.value
	if (!flow || reopeningBrowser.value) return

	reopeningBrowser.value = true
	const previousAuthentication = activeAuthentication
	++authenticationId

	try {
		await cancelLogin()
		await previousAuthentication?.catch(() => undefined)
		if (authenticating.value === flow) authenticate(flow)
	} finally {
		reopeningBrowser.value = false
	}
}

function resetAuthentication(cancelActive: boolean) {
	const wasAuthenticating = authenticating.value !== null
	++authenticationId
	activeAuthentication = undefined
	authenticating.value = null
	reopeningBrowser.value = false

	if (cancelActive && wasAuthenticating) void cancelLogin()
}

function handleHide() {
	resetAuthentication(true)
	finish(false)
}

function openSupport() {
	openUrl('https://support.modrinth.com')
}

defineExpose({ show, showSigningIn })
</script>
