<script setup lang="ts">
import { MicrosoftIcon, SpinnerIcon } from '@modrinth/assets'
import { defineMessages, NewModal, useVIntl } from '@modrinth/ui'
import { computed, nextTick, ref, watch } from 'vue'

import EdenAuthShell from '@/components/ui/eden/EdenAuthShell.vue'
import EdenIcon from '@/components/ui/eden/EdenIcon.vue'
import type { ExternalAuthProvider } from '@/models/astralrinth/authentication'

type View = 'choose' | 'microsoft' | 'external' | 'local'

const props = defineProps<{
	offlineLoginDisabled: boolean
	offlinePlayerName: string
	loginDisabled: boolean
	externalAuthDisabled: boolean
	externalAuthProviders: ExternalAuthProvider[]
}>()

const emit = defineEmits<{
	(event: 'submit-offline' | 'login-microsoft'): void
	(event: 'update:offlinePlayerName', value: string): void
	(event: 'login-external', provider: ExternalAuthProvider): void
}>()

const MIN_NAME_LENGTH = 3
const MAX_NAME_LENGTH = 20
const NAME_PATTERN = /^[a-zA-Z0-9_]+$/

const { formatMessage } = useVIntl()
const modal = ref<InstanceType<typeof NewModal> | null>(null)
const view = ref<View>('choose')
const provider = ref<ExternalAuthProvider | null>(null)
const nameInput = ref<HTMLInputElement | null>(null)
const nameTouched = ref(false)
/** Becomes true once the core reports the browser sign-in as started. */
const signInStarted = ref(false)

const messages = defineMessages({
	addAccountHeader: {
		id: 'edenlauncher.app.minecraft-account.input.auth.header',
		defaultMessage: 'Добавить аккаунт',
	},
	microsoftAccountDescription: {
		id: 'edenlauncher.app.minecraft-account.input.auth.microsoft-description',
		defaultMessage: 'Minecraft: Java Edition на официальном аккаунте',
	},
	externalAccountDescription: {
		id: 'edenlauncher.app.minecraft-account.input.auth.external-description',
		defaultMessage: 'Для серверов с поддержкой {providerName}',
	},
	offlineAccount: {
		id: 'edenlauncher.app.minecraft-account.input.auth.offline-label',
		defaultMessage: 'Локальный профиль',
	},
	offlineAccountDescription: {
		id: 'edenlauncher.app.minecraft-account.input.auth.offline-description',
		defaultMessage: 'Без авторизации на внешнем сервисе',
	},
})

const busy = computed(() =>
	view.value === 'microsoft' ? props.loginDisabled : props.externalAuthDisabled,
)
const providerName = computed(() =>
	view.value === 'microsoft' ? 'Microsoft' : (provider.value?.name ?? ''),
)
const signInFailed = computed(
	() =>
		(view.value === 'microsoft' || view.value === 'external') && signInStarted.value && !busy.value,
)
const nameError = computed(() => {
	const name = props.offlinePlayerName.trim()
	if (!nameTouched.value) return null
	if (name.length < MIN_NAME_LENGTH || name.length > MAX_NAME_LENGTH)
		return `Ник должен быть длиной от ${MIN_NAME_LENGTH} до ${MAX_NAME_LENGTH} символов.`
	if (!NAME_PATTERN.test(name)) return 'Можно использовать только латинские буквы, цифры и «_».'
	return null
})

watch(busy, (value) => {
	if (value) signInStarted.value = true
})

function open(next: View) {
	view.value = next
	signInStarted.value = false
	nameTouched.value = false
	modal.value?.show()
	if (next === 'local') nextTick(() => nameInput.value?.focus())
}

function close() {
	modal.value?.hide()
}

function chooseMicrosoft() {
	view.value = 'microsoft'
	signInStarted.value = false
	emit('login-microsoft')
}

function chooseExternal(selected: ExternalAuthProvider) {
	provider.value = selected
	view.value = 'external'
	signInStarted.value = false
	emit('login-external', selected)
}

function retry() {
	if (view.value === 'microsoft') chooseMicrosoft()
	else if (provider.value) chooseExternal(provider.value)
}

function chooseLocal() {
	view.value = 'local'
	nameTouched.value = false
	nextTick(() => nameInput.value?.focus())
}

function submitLocal() {
	nameTouched.value = true
	if (nameError.value) return
	emit('submit-offline')
}

defineExpose({
	hideAuth: close,
	hideOffline: close,
	showAuth: () => open('choose'),
	showOffline: () => open('local'),
})
</script>

<template>
	<NewModal ref="modal" hide-header no-padding max-width="1052px" aria-label="Игровой аккаунт">
		<EdenAuthShell @close="close">
			<div v-if="view === 'choose'" class="eden-auth-view">
				<h2>{{ formatMessage(messages.addAccountHeader) }}</h2>
				<p class="eden-auth-view__lead">
					Выбери способ входа в Minecraft.<br />
					Существующие профили останутся доступны.
				</p>
				<div class="eden-auth-methods">
					<button
						type="button"
						class="eden-auth-method"
						:disabled="loginDisabled"
						@click="chooseMicrosoft"
					>
						<span class="eden-auth-method__icon"><MicrosoftIcon /></span>
						<span class="eden-auth-method__copy">
							<strong>Microsoft</strong>
							<span>{{ formatMessage(messages.microsoftAccountDescription) }}</span>
						</span>
						<EdenIcon name="chevron" :size="18" />
					</button>
					<button
						v-for="item in externalAuthProviders"
						:key="item.id"
						type="button"
						class="eden-auth-method"
						:disabled="externalAuthDisabled"
						@click="chooseExternal(item)"
					>
						<span class="eden-auth-method__icon"><component :is="item.icon" /></span>
						<span class="eden-auth-method__copy">
							<strong>{{ item.name }}</strong>
							<span>
								{{
									formatMessage(messages.externalAccountDescription, { providerName: item.name })
								}}
							</span>
						</span>
						<EdenIcon name="chevron" :size="18" />
					</button>
					<button
						type="button"
						class="eden-auth-method"
						:disabled="offlineLoginDisabled"
						@click="chooseLocal"
					>
						<span class="eden-auth-method__icon"><EdenIcon name="user" :size="22" /></span>
						<span class="eden-auth-method__copy">
							<strong>{{ formatMessage(messages.offlineAccount) }}</strong>
							<span>{{ formatMessage(messages.offlineAccountDescription) }}</span>
						</span>
						<EdenIcon name="chevron" :size="18" />
					</button>
				</div>
				<p class="eden-auth-note">
					<EdenIcon name="shield" :size="18" />
					<span>
						Вход у провайдера открывается в браузере.<br />
						Пароли Microsoft и Ely.by не вводятся в лаунчере.
					</span>
				</p>
			</div>

			<div v-else-if="view === 'microsoft' || view === 'external'" class="eden-auth-view">
				<h2>Войти через {{ providerName }}</h2>
				<p class="eden-auth-view__lead">
					Мы открыли страницу входа {{ providerName }}.<br />
					Заверши вход там — данные не вводятся в лаунчере.
				</p>
				<div
					class="eden-auth-waiting"
					:class="{ 'eden-auth-waiting--error': signInFailed }"
					role="status"
					aria-live="polite"
				>
					<span class="eden-auth-waiting__icon">
						<EdenIcon v-if="signInFailed" name="warning" />
						<EdenIcon v-else name="external" />
					</span>
					<template v-if="signInFailed">
						<strong>Вход не завершён</strong>
						<p>
							Окно входа закрыто или сервис не подтвердил аккаунт. Можно попробовать ещё раз или
							выбрать другой способ.
						</p>
					</template>
					<template v-else>
						<strong>Ожидание подтверждения</strong>
						<p>Вернись в лаунчер после входа — аккаунт появится автоматически.</p>
					</template>
				</div>
				<div class="eden-auth-actions">
					<button
						v-if="signInFailed"
						type="button"
						class="eden-btn eden-btn--primary"
						@click="retry"
					>
						<EdenIcon name="refresh" :size="18" /> Повторить вход
					</button>
					<button v-else type="button" class="eden-btn eden-btn--primary" disabled>
						<SpinnerIcon class="animate-spin" /> Ожидание браузера
					</button>
					<button type="button" class="eden-btn eden-btn--secondary" @click="view = 'choose'">
						Другой способ
					</button>
				</div>
			</div>

			<form v-else class="eden-auth-view" novalidate @submit.prevent="submitLocal">
				<h2>Локальный профиль</h2>
				<p class="eden-auth-view__lead">
					Профиль без входа во внешний сервис.<br />
					Подходит для серверов, которые не проверяют лицензию.
				</p>
				<div class="eden-auth-field">
					<label for="eden-local-name">Ник игрока</label>
					<div class="eden-input" :class="{ 'eden-input--invalid': nameError }">
						<EdenIcon name="user" :size="18" />
						<input
							id="eden-local-name"
							ref="nameInput"
							:value="offlinePlayerName"
							type="text"
							autocomplete="off"
							spellcheck="false"
							maxlength="32"
							placeholder="Например, Steve"
							:aria-invalid="!!nameError"
							aria-describedby="eden-local-name-hint"
							@input="emit('update:offlinePlayerName', ($event.target as HTMLInputElement).value)"
							@blur="nameTouched = offlinePlayerName.length > 0"
						/>
					</div>
					<p v-if="nameError" id="eden-local-name-hint" class="eden-field-error">
						<EdenIcon name="warning" :size="14" /> {{ nameError }}
					</p>
					<small v-else id="eden-local-name-hint">
						От {{ MIN_NAME_LENGTH }} до {{ MAX_NAME_LENGTH }} символов: латиница, цифры и «_».
					</small>
				</div>
				<p class="eden-auth-note">
					<EdenIcon name="info" :size="18" />
					<span>Скин и вход на лицензионные серверы для локального профиля недоступны.</span>
				</p>
				<div class="eden-auth-actions">
					<button type="submit" class="eden-btn eden-btn--primary" :disabled="offlineLoginDisabled">
						<EdenIcon name="plus" :size="18" /> Добавить профиль
					</button>
					<button type="button" class="eden-btn eden-btn--secondary" @click="view = 'choose'">
						Назад
					</button>
				</div>
			</form>
		</EdenAuthShell>
	</NewModal>
</template>
