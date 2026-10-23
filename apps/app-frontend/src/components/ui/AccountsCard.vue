<template>
	<div class="eden-accounts">
		<p v-if="accounts.length === 0" class="eden-accounts__empty">
			{{ formatMessage(messages.notSignedIn) }}
		</p>
		<ul v-else class="eden-accounts__list" aria-label="Игровые аккаунты">
			<li
				v-for="account in accounts"
				:key="account.profile.id"
				class="eden-accounts__item"
				:class="{ 'is-active': selectedAccount?.profile.id === account.profile.id }"
			>
				<button
					type="button"
					class="eden-accounts__select"
					:aria-pressed="selectedAccount?.profile.id === account.profile.id"
					@click="setAccount(account)"
				>
					<Avatar :src="getAccountAvatarUrl(account)" size="32px" />
					<span class="eden-accounts__copy">
						<strong>{{ account.profile.name }}</strong>
						<span>
							<component
								:is="getAccountType(account)"
								v-if="getAccountType(account)"
								class="vector-icon"
							/>
							{{ accountTypeLabel(account) }}
						</span>
					</span>
					<span
						v-if="selectedAccount?.profile.id === account.profile.id"
						class="eden-chip eden-chip--success"
					>
						Активен
					</span>
				</button>
				<button
					v-tooltip="formatMessage(messages.removeAccount)"
					type="button"
					class="eden-accounts__remove"
					:aria-label="`${formatMessage(messages.removeAccount)}: ${account.profile.name}`"
					@click="askRemove(account)"
				>
					<TrashIcon />
				</button>
			</li>
		</ul>
		<button
			type="button"
			class="eden-btn eden-btn--primary eden-btn--compact eden-btn--block"
			@click="showAccountLoginModal"
		>
			<PlusIcon />
			{{ formatMessage(messages.addAccount) }}
		</button>
	</div>
	<NewModal
		ref="removeModal"
		hide-header
		no-padding
		max-width="1052px"
		aria-label="Удалить аккаунт?"
	>
		<EdenAuthShell @close="removeModal?.hide()">
			<div v-if="pendingRemove" class="eden-auth-view">
				<h2>Удалить аккаунт?</h2>
				<p class="eden-auth-view__lead">
					Аккаунт будет удалён только из EdenLauncher.<br />
					Сборки, миры и скины на сервисе останутся.
				</p>
				<div class="eden-auth-methods">
					<div class="eden-auth-method" role="presentation">
						<span class="eden-auth-method__icon">
							<img :src="getAccountAvatarUrl(pendingRemove)" alt="" />
						</span>
						<span class="eden-auth-method__copy">
							<strong>{{ pendingRemove.profile.name }}</strong>
							<span>{{ accountTypeLabel(pendingRemove) }}</span>
						</span>
					</div>
				</div>
				<div class="eden-auth-actions">
					<button type="button" class="eden-btn eden-btn--secondary" @click="removeModal?.hide()">
						Отмена
					</button>
					<button
						type="button"
						class="eden-btn eden-btn--danger eden-auth-actions__end"
						@click="confirmRemove"
					>
						<TrashIcon /> Удалить из лаунчера
					</button>
				</div>
			</div>
		</EdenAuthShell>
	</NewModal>
	<AccountsInputModals
		ref="accountsInputModals"
		:offline-login-disabled="offlineLoginDisabled"
		:offline-player-name="offlinePlayerName"
		:login-disabled="loginDisabled"
		:external-auth-disabled="externalAuthDisabled"
		:external-auth-providers="externalAuthProviders"
		@login-microsoft="login"
		@login-external="addExternalProfile"
		@submit-offline="addOfflineProfile"
		@update:offline-player-name="offlinePlayerName = $event"
	/>
	<AccountsErrorModals
		ref="accountsErrorModals"
		:max-offline-player-name-length="maxOfflinePlayerNameLength"
		:min-offline-player-name-length="minOfflinePlayerNameLength"
		:name-exp="nameExp"
		@retry-offline="retryAddOfflineProfile"
	/>
</template>

<script setup lang="ts">
import { MicrosoftIcon, OfflineIcon, PlusIcon, TrashIcon } from '@modrinth/assets'
import { Avatar, defineMessages, injectNotificationManager, NewModal, useVIntl } from '@modrinth/ui'
import type { Ref } from 'vue'
import { computed, onMounted, onUnmounted, ref } from 'vue'

import AccountsErrorModals from '@/components/ui/astralrinth/accounts/error/AccountsErrorModals.vue'
import AccountsInputModals from '@/components/ui/astralrinth/accounts/input/AccountsInputModals.vue'
import EdenAuthShell from '@/components/ui/eden/EdenAuthShell.vue'
import { trackEvent } from '@/helpers/analytics'
import {
	get_default_user,
	login as login_flow,
	offline_login,
	remove_user,
	set_default_user,
	users,
} from '@/helpers/auth'
import { process_listener } from '@/helpers/events'
import { getPlayerHeadUrl } from '@/helpers/rendering/batch-skin-renderer.ts'
import type { Skin } from '@/helpers/skins'
import { get_available_skins } from '@/helpers/skins'
import {
	externalAuthProviders,
	getExternalAuthProvider,
	loadExternalAuthProviders,
	type MinecraftCredential,
	useExternalAuthentication,
} from '@/models/astralrinth/authentication'
import { handleSevereError } from '@/store/error.js'

const { formatMessage } = useVIntl()
const { handleError } = injectNotificationManager()

const emit = defineEmits<{
	change: []
}>()

const props = defineProps<{
	/** Closes the surrounding account menu before a dialog opens. */
	closeMenu?: () => void
}>()

type AccountsInputModalsHandle = {
	hideAuth: () => void
	hideOffline: () => void
	showAuth: () => void
	showOffline: () => void
}

type AccountsErrorModalsHandle = {
	hideInputOfflineError: () => void
	showInputOfflineError: () => void
	showUnexpectedError: () => void
}

const offlineLoginCooldownMs = 1000
const minOfflinePlayerNameLength = 3
const maxOfflinePlayerNameLength = 20
const nameExp = 'a-zA-Z0-9_'
const nameRegex = new RegExp(`^[${nameExp}]+$`)

const accounts: Ref<MinecraftCredential[]> = ref([])
const loginDisabled = ref(false)
const offlineLoginDisabled = ref(false)
const defaultUser = ref<string | undefined>()
const equippedSkin = ref<Skin | null>(null)
const headUrlCache = ref(new Map<string, string>())

const accountsInputModals = ref<AccountsInputModalsHandle | null>(null)
const accountsErrorModals = ref<AccountsErrorModalsHandle | null>(null)

const offlinePlayerName = ref('')
const { authenticate: addExternalProfile, disabled: externalAuthDisabled } =
	useExternalAuthentication({
		onAuthenticated: async (credentials) => {
			await setAccount(credentials)
			accountsInputModals.value?.hideAuth()
		},
		onError: (error) => {
			handleError(error)
			accountsErrorModals.value?.showUnexpectedError()
		},
	})

function getAccountType(account?: MinecraftCredential) {
	switch (account?.account_type) {
		case 'microsoft':
			return MicrosoftIcon
		case 'offline':
			return OfflineIcon
		default:
			return getExternalAuthProvider(account?.account_type)?.icon ?? null
	}
}

const removeModal = ref<InstanceType<typeof NewModal> | null>(null)
const pendingRemove = ref<MinecraftCredential | null>(null)

function accountTypeLabel(account: MinecraftCredential) {
	if (account.account_type === 'microsoft') return 'Microsoft'
	if (account.account_type === 'offline') return 'Локальный профиль'
	return getExternalAuthProvider(account.account_type)?.name ?? 'Внешний сервис'
}

function askRemove(account: MinecraftCredential) {
	props.closeMenu?.()
	pendingRemove.value = account
	removeModal.value?.show()
}

async function confirmRemove() {
	const account = pendingRemove.value
	removeModal.value?.hide()
	pendingRemove.value = null
	if (account) await logout(account.profile.id)
}

function showOfflineLoginModal() {
	accountsInputModals.value?.showOffline()
}

function showAccountLoginModal() {
	props.closeMenu?.()
	accountsInputModals.value?.showAuth()
}

function retryAddOfflineProfile() {
	accountsErrorModals.value?.hideInputOfflineError()
	offlineLoginDisabled.value = false
	clearOfflineFields()
	showOfflineLoginModal()
}

function clearOfflineFields() {
	offlinePlayerName.value = ''
}

async function addOfflineProfile() {
	if (offlineLoginDisabled.value) {
		return
	}

	offlineLoginDisabled.value = true

	const name = offlinePlayerName.value.trim()
	const isValidName =
		nameRegex.test(name) &&
		name.length >= minOfflinePlayerNameLength &&
		name.length <= maxOfflinePlayerNameLength

	if (!isValidName) {
		accountsInputModals.value?.hideOffline()
		accountsErrorModals.value?.showInputOfflineError()
		offlineLoginDisabled.value = false
		clearOfflineFields()
		return
	}

	try {
		const result = await offline_login(name)
		accountsInputModals.value?.hideOffline()

		if (result) {
			await setAccount(result)
			await refreshValues()
		} else {
			accountsErrorModals.value?.showUnexpectedError()
		}
	} catch (error) {
		handleError(error)
		accountsErrorModals.value?.showUnexpectedError()
	} finally {
		clearOfflineFields()
		window.setTimeout(() => {
			offlineLoginDisabled.value = false
		}, offlineLoginCooldownMs)
	}
}

async function refreshValues() {
	defaultUser.value = await get_default_user().catch(handleError)
	const userList = await users().catch(handleError)
	accounts.value = Array.isArray(userList) ? [...userList] : []
	accounts.value.sort((a, b) => (a.profile?.name ?? '').localeCompare(b.profile?.name ?? ''))

	try {
		const skins = await get_available_skins()
		equippedSkin.value = skins.find((skin) => skin.is_equipped) ?? null

		if (equippedSkin.value) {
			try {
				const headUrl = await getPlayerHeadUrl(equippedSkin.value)
				headUrlCache.value = new Map(headUrlCache.value).set(
					equippedSkin.value.texture_key,
					headUrl,
				)
			} catch (error) {
				console.warn('Failed to get head render for equipped skin:', error)
			}
		}
	} catch {
		equippedSkin.value = null
	}
}

async function setEquippedSkin(skin: Skin) {
	equippedSkin.value = skin

	try {
		const headUrl = await getPlayerHeadUrl(skin)
		headUrlCache.value = new Map(headUrlCache.value).set(skin.texture_key, headUrl)
	} catch (error) {
		console.warn('Failed to get head render for equipped skin:', error)
	}
}

function setLoginDisabled(value: boolean) {
	loginDisabled.value = value
}

const selectedAccount = computed(() =>
	accounts.value.find((account) => account.profile.id === defaultUser.value),
)

const avatarUrl = computed(() => {
	if (equippedSkin.value?.texture_key) {
		const cachedUrl = headUrlCache.value.get(equippedSkin.value.texture_key)
		if (cachedUrl) {
			return cachedUrl
		}

		return `https://mc-heads.net/avatar/${equippedSkin.value.texture_key}/128`
	}

	if (selectedAccount.value?.profile?.id) {
		return `https://mc-heads.net/avatar/${selectedAccount.value.profile.id}/128`
	}

	return 'https://launcher-files.modrinth.com/assets/steve_head.png'
})

const activeAccountName = computed(() => selectedAccount.value?.profile?.name ?? null)
const activeAccountType = computed(() => selectedAccount.value?.account_type ?? null)
const accountCount = computed(() => accounts.value.length)

defineExpose({
	refreshValues,
	setEquippedSkin,
	setLoginDisabled,
	showAccountLoginModal,
	loginDisabled,
	activeAccountName,
	activeAccountType,
	accountCount,
	avatarUrl,
})

await refreshValues()

function getAccountAvatarUrl(account: MinecraftCredential) {
	if (
		account.profile.id === selectedAccount.value?.profile?.id &&
		equippedSkin.value?.texture_key
	) {
		const cachedUrl = headUrlCache.value.get(equippedSkin.value.texture_key)
		if (cachedUrl) {
			return cachedUrl
		}
	}

	return `https://mc-heads.net/avatar/${account.profile.id}/128`
}

async function setAccount(account: MinecraftCredential) {
	defaultUser.value = account.profile.id
	await set_default_user(account.profile.id).catch(handleError)
	await refreshValues()
	emit('change')
}

async function login() {
	loginDisabled.value = true
	const loggedIn = await login_flow().catch(handleSevereError)

	if (loggedIn) {
		await setAccount(loggedIn)
		accountsInputModals.value?.hideAuth()
	}

	trackEvent('AccountLogIn')
	loginDisabled.value = false
}

async function logout(id: string) {
	await remove_user(id).catch(handleError)
	await refreshValues()

	if (!selectedAccount.value && accounts.value.length > 0) {
		await setAccount(accounts.value[0])
	} else {
		emit('change')
	}

	trackEvent('AccountLogOut')
}

const unlisten = await process_listener(async (e) => {
	if (e.event === 'launched') {
		await refreshValues()
	}
})

onMounted(() => {
	void loadExternalAuthProviders().catch(handleError)
})

onUnmounted(() => {
	unlisten()
})

const messages = defineMessages({
	notSignedIn: {
		id: 'minecraft-account.not-signed-in',
		defaultMessage: 'Not signed in',
	},
	addAccount: {
		id: 'minecraft-account.add-account',
		defaultMessage: 'Add account',
	},
	removeAccount: {
		id: 'minecraft-account.remove-account',
		defaultMessage: 'Remove account',
	},
	selectAccount: {
		id: 'minecraft-account.select-account',
		defaultMessage: 'Select account',
	},
	minecraftAccount: {
		id: 'minecraft-account.label',
		defaultMessage: 'Minecraft account',
	},
})
</script>

<style scoped lang="scss">
.vector-icon {
	width: 0.875rem;
	height: 0.875rem;
}

.eden-accounts {
	display: flex;
	flex-direction: column;
	gap: 10px;
	margin-top: 8px;
}

.eden-accounts__empty {
	margin: 0;
	padding: 12px;
	border-radius: var(--eden-radius-control);
	color: var(--eden-text-secondary);
	background: var(--eden-surface-raised);
	font-size: 12px;
}

.eden-accounts__list {
	display: flex;
	max-height: 18rem;
	flex-direction: column;
	gap: 8px;
	overflow-y: auto;
	margin: 0;
	padding: 0;
	list-style: none;
}

.eden-accounts__item {
	display: flex;
	align-items: center;
	gap: 4px;
	padding-right: 6px;
	border: 1px solid var(--eden-border);
	border-radius: 12px;
	background: var(--eden-surface);

	&.is-active {
		border-color: var(--eden-accent);
		box-shadow: inset 0 0 0 1px var(--eden-accent);
	}
}

.eden-accounts__select {
	display: flex;
	min-width: 0;
	flex: 1;
	align-items: center;
	gap: 10px;
	padding: 8px 10px;
	border: 0;
	border-radius: 12px;
	color: var(--eden-text);
	background: transparent;
	font: inherit;
	text-align: left;
	cursor: pointer;

	&:focus-visible {
		outline: 2px solid var(--eden-focus);
		outline-offset: 2px;
	}

	:deep(.avatar) {
		border-radius: 8px;
	}
}

.eden-accounts__copy {
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

	span {
		display: flex;
		align-items: center;
		gap: 4px;
		color: var(--eden-text-secondary);
		font-size: 11px;
	}
}

.eden-accounts__remove {
	display: grid;
	width: 30px;
	height: 30px;
	flex: 0 0 auto;
	place-items: center;
	padding: 0;
	border: 0;
	border-radius: 8px;
	color: var(--eden-text-secondary);
	background: transparent;
	cursor: pointer;

	svg {
		width: 16px;
		height: 16px;
	}

	&:hover {
		color: var(--eden-error);
		background: var(--eden-error-soft);
	}

	&:focus-visible {
		outline: 2px solid var(--eden-focus);
		outline-offset: 2px;
	}
}
</style>
