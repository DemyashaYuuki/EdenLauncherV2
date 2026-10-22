<script setup>
import {
	CheckIcon,
	CopyIcon,
	DropdownIcon,
	HammerIcon,
	LogInIcon,
	UpdatedIcon,
	WrenchIcon,
	XIcon,
} from '@modrinth/assets'
import { ButtonStyled, Collapsible, injectNotificationManager } from '@modrinth/ui'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import { ChatIcon } from '@/assets/icons'
import EdenIcon from '@/components/ui/eden/EdenIcon.vue'
import ModalWrapper from '@/components/ui/modal/ModalWrapper.vue'
import { trackEvent } from '@/helpers/analytics'
import { login as login_flow, set_default_user } from '@/helpers/auth.js'
import { install_existing_instance } from '@/helpers/install'
import { cancel_directory_change } from '@/helpers/settings.ts'
import { showLauncherLogsFolder } from '@/helpers/utils.js'
import { handleSevereError } from '@/store/error.js'

const { handleError } = injectNotificationManager()
const router = useRouter()

const errorModal = ref()
const error = ref()
const closable = ref(true)
const errorCollapsed = ref(false)

const title = ref('Что-то пошло не так')
const errorType = ref('unknown')
const supportLink = ref('https://edenworld.fun/')
const metadata = ref({})

defineExpose({
	async show(errorVal, context, canClose = true, source = null) {
		console.log(errorVal, context, canClose, source)
		closable.value = canClose
		metadata.value = {}

		if (errorVal.message && errorVal.message.includes('Minecraft authentication error:')) {
			title.value = 'Не удалось войти в Minecraft'
			errorType.value = 'minecraft_auth'
			supportLink.value = 'https://edenworld.fun/'

			if (
				errorVal.message.includes('existing connection was forcibly closed') ||
				errorVal.message.includes('error sending request for url')
			) {
				metadata.value.network = true
			}
			if (errorVal.message.includes('because the target machine actively refused it')) {
				metadata.value.hostsFile = true
			}
		} else if (errorVal.message && errorVal.message.includes('Move directory error:')) {
			title.value = 'Не удалось сменить папку приложения'
			errorType.value = 'directory_move'
			supportLink.value = 'https://edenworld.fun/'

			if (errorVal.message.includes('directory is not writable')) {
				metadata.value.readOnly = true
			}

			if (errorVal.message.includes('Not enough space')) {
				metadata.value.notEnoughSpace = true
			}
		} else if (errorVal.message && errorVal.message.includes('No loader version selected for')) {
			title.value = 'Не выбрана версия загрузчика'
			errorType.value = 'no_loader_version'
			supportLink.value = 'https://edenworld.fun/'
			metadata.value.instanceId = context.instanceId
		} else if (errorVal.code === 'external_auth_library_not_installed') {
			title.value = 'Нужна библиотека авторизации'
			errorType.value = 'external_auth_library_not_installed'
			supportLink.value = 'https://edenworld.fun/'
			metadata.value = {}
		} else if (source === 'state_init') {
			title.value = 'Не удалось запустить EdenLauncher'
			errorType.value = 'state_init'
			supportLink.value = 'https://edenworld.fun/'
		} else {
			title.value = context?.instanceId ? 'Не удалось запустить игру' : 'Что-то пошло не так'
			errorType.value = 'unknown'
			supportLink.value = 'https://edenworld.fun/'
			metadata.value = { instanceId: context?.instanceId }
		}

		error.value = errorVal
		errorModal.value.show()
	},
})

const loadingMinecraft = ref(false)
async function loginMinecraft() {
	try {
		loadingMinecraft.value = true
		const loggedIn = await login_flow()

		if (loggedIn) {
			await set_default_user(loggedIn.profile.id).catch(handleError)
		}

		await trackEvent('AccountLogIn', { source: 'ErrorModal' })
		loadingMinecraft.value = false
		errorModal.value.hide()
	} catch (err) {
		loadingMinecraft.value = false
		handleSevereError(err)
	}
}

async function cancelDirectoryChange() {
	try {
		await cancel_directory_change()
		window.location.reload()
	} catch (err) {
		handleError(err)
	}
}

function retryDirectoryChange() {
	window.location.reload()
}

const loadingRepair = ref(false)
async function repairInstance() {
	loadingRepair.value = true
	try {
		await install_existing_instance(metadata.value.instanceId, false)
		errorModal.value.hide()
	} catch (err) {
		handleSevereError(err)
	}
	loadingRepair.value = false
}

const hasDebugInfo = computed(
	() =>
		errorType.value === 'directory_move' ||
		errorType.value === 'minecraft_auth' ||
		errorType.value === 'state_init' ||
		errorType.value === 'no_loader_version' ||
		errorType.value === 'external_auth_library_not_installed',
)

const debugInfo = computed(() => error.value?.message ?? error.value ?? 'Причина не указана.')

async function openLogs() {
	errorModal.value.hide()
	if (metadata.value.instanceId) {
		await router.push(`/instance/${encodeURIComponent(metadata.value.instanceId)}/logs`)
	} else {
		await showLauncherLogsFolder().catch(handleError)
	}
}

const copied = ref(false)

async function copyToClipboard(text) {
	await navigator.clipboard.writeText(text)
	copied.value = true
	setTimeout(() => {
		copied.value = false
	}, 3000)
}
</script>

<template>
	<ModalWrapper ref="errorModal" :header="title" :closable="closable">
		<div class="modal-body max-w-[550px]">
			<div class="markdown-body">
				<template v-if="errorType === 'minecraft_auth'">
					<template v-if="metadata.network">
						<h3>Проблема с сетью</h3>
						<p>
							EdenLauncher не смог связаться с серверами Microsoft. Обычно это временная проблема
							соединения — попробуйте ещё раз. Если ошибка повторяется, загляните в
							<a href="https://edenworld.fun/">раздел помощи</a>.
						</p>
					</template>
					<template v-else-if="metadata.hostsFile">
						<h3>Проблема с сетью</h3>
						<p>
							Сервисы Microsoft, Xbox или Minecraft отклонили подключение. Возможно, они
							заблокированы в файле hosts. Подробности — в
							<a href="https://edenworld.fun/">разделе помощи</a>.
						</p>
					</template>
					<template v-else>
						<h3>Попробуйте другой аккаунт Microsoft</h3>
						<p>
							Проверьте, что вы вошли в нужный аккаунт: Minecraft может быть куплен на другом
							аккаунте Microsoft.
						</p>
						<div class="cta-button">
							<button class="btn btn-primary" :disabled="loadingMinecraft" @click="loginMinecraft">
								<LogInIcon /> Войти в другой аккаунт
							</button>
						</div>
						<h3>PC Game Pass, Bedrock или игра только что куплена?</h3>
						<p>
							Сначала войдите через
							<a href="https://www.minecraft.net/en-us/download">официальный Minecraft Launcher</a>,
							затем вернитесь сюда.
						</p>
					</template>
					<div class="cta-button">
						<button class="btn btn-primary" :disabled="loadingMinecraft" @click="loginMinecraft">
							<LogInIcon /> Войти ещё раз
						</button>
					</div>
				</template>
				<template v-if="errorType === 'directory_move'">
					<template v-if="metadata.readOnly">
						<h3>Нет прав на запись</h3>
						<p>
							EdenLauncher не может записывать файлы в выбранную папку. Измените права доступа и
							повторите попытку или отмените смену папки.
						</p>
					</template>
					<template v-else-if="metadata.notEnoughSpace">
						<h3>Недостаточно места</h3>
						<p>
							На диске с выбранной папкой не хватает места. Освободите место и повторите попытку или
							отмените смену папки.
						</p>
					</template>
					<template v-else>
						<p>
							EdenLauncher не смог перенести данные в новую папку. Обратитесь в поддержку или
							отмените смену папки.
						</p>
					</template>

					<div class="cta-button">
						<button class="btn" @click="retryDirectoryChange">
							<UpdatedIcon /> Повторить перенос
						</button>
						<button class="btn btn-danger" @click="cancelDirectoryChange">
							<XIcon /> Отменить смену папки
						</button>
					</div>
				</template>
				<template v-else-if="errorType === 'state_init'">
					<p>
						EdenLauncher не смог корректно загрузиться. Возможно, повреждён или отсутствует файл
						приложения.
					</p>
					<p>Что можно сделать:</p>
					<ul>
						<li>Проверьте подключение к интернету и перезапустите лаунчер.</li>
						<li>Скачайте и установите лаунчер заново.</li>
					</ul>
				</template>
				<template v-else-if="errorType === 'no_loader_version'">
					<p>EdenLauncher не нашёл версию загрузчика для этой сборки.</p>
					<p>Исправьте сборку — кнопка ниже переустановит недостающие файлы.</p>
					<div class="cta-button">
						<button class="btn btn-primary" :disabled="loadingRepair" @click="repairInstance">
							<HammerIcon /> Исправить сборку
						</button>
					</div>
				</template>
				<template v-else-if="errorType === 'external_auth_library_not_installed'">
					<p>{{ debugInfo }}</p>
					<p>
						Выберите и установите версию в разделе «Настройки → EdenLauncher → Библиотеки
						аутентификации», затем снова запустите сборку.
					</p>
				</template>
				<template v-else>
					<div class="eden-error-reason" role="alert">
						<span class="eden-error-reason__icon"><EdenIcon name="warning" :size="22" /></span>
						<div>
							<strong>Причина</strong>
							<p>{{ debugInfo }}</p>
						</div>
					</div>
				</template>
				<template v-if="hasDebugInfo">
					<div class="w-full h-[1px] bg-surface-5 mb-3"></div>
					<p>
						Если ничего не помогает, обратитесь в
						<a :href="supportLink">поддержку EdenWorld</a> и приложите сведения для отладки ниже.
					</p>
				</template>
			</div>
			<div class="flex flex-wrap items-center gap-2">
				<button
					v-if="errorType === 'unknown'"
					type="button"
					class="eden-btn eden-btn--secondary eden-btn--compact"
					@click="openLogs"
				>
					<EdenIcon name="folder" :size="16" />
					{{ metadata.instanceId ? 'Открыть журнал' : 'Папка журналов' }}
				</button>
				<ButtonStyled>
					<a :href="supportLink" @click="errorModal.hide()"><ChatIcon /> Поддержка</a>
				</ButtonStyled>
				<ButtonStyled v-if="closable">
					<button @click="errorModal.hide()"><XIcon /> Закрыть</button>
				</ButtonStyled>
			</div>
			<template v-if="hasDebugInfo">
				<div class="flex flex-col gap-2">
					<div class="w-full h-[1px] bg-surface-5"></div>

					<div class="overflow-clip">
						<button
							class="flex items-center justify-between w-full bg-transparent border-0 py-4 cursor-pointer"
							@click="errorCollapsed = !errorCollapsed"
						>
							<span class="flex items-center gap-2 text-contrast font-extrabold m-0">
								<WrenchIcon class="h-4 w-4" />
								Сведения для отладки
							</span>
							<DropdownIcon
								class="h-5 w-5 text-secondary transition-transform"
								:class="{ 'rotate-180': !errorCollapsed }"
							/>
						</button>
						<Collapsible :collapsed="errorCollapsed">
							<div
								class="p-3 bg-surface-2 rounded-2xl text-xs grid grid-cols-[1fr_auto] max-w-full items-start"
							>
								<div
									class="m-0 p-0 rounded-none bg-transparent text-sm font-mono break-words overflow-auto"
								>
									{{ debugInfo }}
								</div>
								<ButtonStyled circular>
									<button
										v-tooltip="'Скопировать сведения'"
										:disabled="copied"
										@click="copyToClipboard(debugInfo)"
									>
										<template v-if="copied"> <CheckIcon class="text-green" /> </template>
										<template v-else> <CopyIcon /> </template>
									</button>
								</ButtonStyled>
							</div>
						</Collapsible>
					</div>
				</div>
			</template>
		</div>
	</ModalWrapper>
</template>

<style>
.light-mode {
	--color-orange-bg: rgba(255, 163, 71, 0.2);
}

.dark-mode,
.oled-mode {
	--color-orange-bg: rgba(224, 131, 37, 0.2);
}
</style>

<style scoped lang="scss">
.cta-button {
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 0.5rem;
	gap: 0.5rem;
}

.warning-banner {
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
	padding: var(--gap-lg);
	background-color: var(--color-orange-bg);
	border: 2px solid var(--color-orange);
	border-radius: var(--radius-md);
	margin-bottom: 1rem;
}

.warning-banner__title {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	font-weight: 700;

	svg {
		color: var(--color-orange);
		height: 1.5rem;
		width: 1.5rem;
	}
}

.eden-error-reason {
	display: flex;
	align-items: flex-start;
	gap: 14px;
	padding: 16px;
	border: 1px solid var(--eden-border);
	border-radius: var(--eden-radius-card);
	background: var(--eden-surface);

	strong {
		color: var(--eden-text);
		font-size: 14px;
	}

	p {
		margin: 6px 0 0;
		color: var(--eden-text-secondary);
		font-size: 13px;
		line-height: 1.6;
		overflow-wrap: anywhere;
	}
}

.eden-error-reason__icon {
	display: grid;
	width: 44px;
	height: 44px;
	flex: 0 0 auto;
	place-items: center;
	border-radius: 10px;
	color: var(--eden-error);
	background: var(--eden-error-soft);
}

.modal-body {
	display: flex;
	flex-direction: column;
	gap: var(--gap-md);
}

.markdown-body {
	overflow: auto;
}
</style>
