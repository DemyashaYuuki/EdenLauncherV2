<script setup>
import { ModrinthApiError, TauriModrinthClient, VerboseLoggingFeature } from '@modrinth/api-client'
import {
	ChevronLeftIcon,
	ChevronRightIcon,
	CompassIcon,
	HomeIcon,
	LibraryIcon,
	LogInIcon,
	PlusIcon,
	SettingsIcon,
	ShirtIcon,
} from '@modrinth/assets'
import {
	Admonition,
	Avatar,
	ContentInstallModal,
	ContentUpdaterModal,
	CreationFlowModal,
	defineMessages,
	I18nDebugPanel,
	LoadingBar,
	NotificationPanel,
	PopupNotificationPanel,
	provideModalBehavior,
	provideModrinthClient,
	provideNotificationManager,
	providePageContext,
	providePopupNotificationManager,
	useDebugLogger,
	useVIntl,
} from '@modrinth/ui'
import { useQuery } from '@tanstack/vue-query'
import { getVersion } from '@tauri-apps/api/app'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { openUrl } from '@tauri-apps/plugin-opener'
import { type } from '@tauri-apps/plugin-os'
import { useMediaQuery } from '@vueuse/core'
import { computed, onMounted, onUnmounted, provide, ref, watch } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'

import pilotVideo from '@/assets/pilot.mp4'
import StudioExitGuard from '@/components/skin-studio/StudioExitGuard.vue'
import AccountSwitcherButton from '@/components/ui/AccountSwitcherButton.vue'
import AppActionBar from '@/components/ui/AppActionBar.vue'
import Breadcrumbs from '@/components/ui/Breadcrumbs.vue'
import EdenErrorFx from '@/components/ui/eden/EdenErrorFx.vue'
import EdenIcon from '@/components/ui/eden/EdenIcon.vue'
import EdenMark from '@/components/ui/eden/EdenMark.vue'
import EdenPlayersModal from '@/components/ui/eden/EdenPlayersModal.vue'
import EdenSidebar from '@/components/ui/eden/EdenSidebar.vue'
import WindowsTaskbarSearch from '@/components/ui/eden/WindowsTaskbarSearch.vue'
import ErrorModal from '@/components/ui/ErrorModal.vue'
import FirstRunSetup from '@/components/ui/FirstRunSetup.vue'
import AddServerToInstanceModal from '@/components/ui/install_flow/AddServerToInstanceModal.vue'
import UnknownPackWarningModal from '@/components/ui/install_flow/UnknownPackWarningModal.vue'
import MinecraftAuthErrorModal from '@/components/ui/minecraft-auth-error-modal/MinecraftAuthErrorModal.vue'
import MinecraftRequiredModal from '@/components/ui/minecraft-required-modal/MinecraftRequiredModal.vue'
import AppSettingsModal from '@/components/ui/modal/AppSettingsModal.vue'
import InstallToPlayModal from '@/components/ui/modal/InstallToPlayModal.vue'
import ModpackAlreadyInstalledModal from '@/components/ui/modal/ModpackAlreadyInstalledModal.vue'
import ModrinthAccountRequiredModal from '@/components/ui/modal/ModrinthAccountRequiredModal.vue'
import UpdateToPlayModal from '@/components/ui/modal/UpdateToPlayModal.vue'
import ModrinthCommunityModal from '@/components/ui/ModrinthCommunityModal.vue'
import SplashScreen from '@/components/ui/SplashScreen.vue'
import WindowControls from '@/components/ui/WindowControls.vue'
import WindowsDesktop from '@/components/ui/WindowsDesktop.vue'
import WindowsLogoIcon from '@/components/ui/WindowsLogoIcon.vue'
import { useEdenDownloads } from '@/composables/eden/downloads'
import { useEdenWorldInstall } from '@/composables/eden/edenworld-install'
import { useCheckDisableMouseover } from '@/composables/macCssFix.js'
import { config } from '@/config'
import { trackEvent } from '@/helpers/analytics'
import {
	downloadLatestRelease,
	fetchRemote,
	getPreferredInstaller,
	isUpdateAvailable,
	isUpdateInstalling,
} from '@/helpers/astralrinth/update'
import { check_reachable } from '@/helpers/auth.js'
import { get_user, get_version } from '@/helpers/cache.js'
import { command_listener, info_listener, warning_listener } from '@/helpers/events.js'
import { install_create_modpack_instance, install_get_modpack_preview } from '@/helpers/install'
import { get as getInstance, list as listInstances, run } from '@/helpers/instance'
import {
	get as getModrinthCredentials,
	login as loginModrinth,
	logout as logoutModrinth,
} from '@/helpers/mr_auth.ts'
import { mergeUrlQuery, parseModrinthLink } from '@/helpers/project-links.ts'
import { get as getSettings, set as setSettings } from '@/helpers/settings.ts'
import { get_opening_command, initialize_state } from '@/helpers/state'
import { getOS, isDev } from '@/helpers/utils.js'
import { start_join_server, start_join_singleplayer_world } from '@/helpers/worlds.ts'
import i18n from '@/i18n.config'
import { createBreadcrumbManager, provideBreadcrumbManager } from '@/providers/breadcrumbs'
import { createContentInstall, provideContentInstall } from '@/providers/content-install'
import { provideAppUpdateDownloadProgress } from '@/providers/download-progress.ts'
import { createServerInstall, provideServerInstall } from '@/providers/server-install'
import { setupProviders } from '@/providers/setup'
import { setupAuthProvider } from '@/providers/setup/auth'
import { setupLoadingStateProvider } from '@/providers/setup/loading-state'
import { useError } from '@/store/error.js'
import { useTheming } from '@/store/state'

import { generateSkinPreviews } from './helpers/rendering/batch-skin-renderer'
import { get_available_capes, get_available_skins } from './helpers/skins'
import { AppNotificationManager } from './providers/app-notifications'
import { AppPopupNotificationManager } from './providers/app-popup-notifications'

const themeStore = useTheming()
themeStore.initializeTheme()
const router = useRouter()
const route = useRoute()
const breadcrumbManager = createBreadcrumbManager()
provideBreadcrumbManager(breadcrumbManager)
const canNavigateBack = ref(false)
const canNavigateForward = ref(false)

function updateHistoryNavigationState() {
	const historyState = window.history.state
	canNavigateBack.value = historyState?.back != null
	canNavigateForward.value = historyState?.forward != null
}

updateHistoryNavigationState()

const compactNavigation = useMediaQuery('(max-width: 1279px)')
const downloads = useEdenDownloads()
const edenWorldInstall = useEdenWorldInstall()
const playersModal = ref()
const clockNow = ref(new Date())
let clockTimer = null
const clockTime = computed(() =>
	clockNow.value.toLocaleTimeString(i18n.global.locale.value || 'ru-RU', {
		hour: '2-digit',
		minute: '2-digit',
	}),
)
const clockDate = computed(() =>
	clockNow.value.toLocaleDateString(i18n.global.locale.value || 'ru-RU', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
	}),
)
const clockIso = computed(() => clockNow.value.toISOString())
const credentials = ref()
const modrinthLoginModal = ref()
const modrinthCommunityModal = ref()
const desktopInstances = ref([])
const windowsDesktop = ref()
const startMenuOpen = ref(false)
const pilotActive = ref(false)
const pilotElement = ref()
const pilotBuffer = ref('')
let previousPilotTheme = null

const isWindowsTheme = computed(() => themeStore.visualTheme === 'windows10')
const showWindowsDesktop = computed(() => isWindowsTheme.value)

watch(
	isWindowsTheme,
	(enabled) => {
		if (clockTimer !== null) window.clearInterval(clockTimer)
		clockTimer = null
		if (!enabled) return
		clockNow.value = new Date()
		clockTimer = window.setInterval(() => (clockNow.value = new Date()), 15_000)
	},
	{ immediate: true },
)

const notificationManager = new AppNotificationManager()
provideNotificationManager(notificationManager)
const { handleError, addNotification } = notificationManager

const popupNotificationManager = new AppPopupNotificationManager()
providePopupNotificationManager(popupNotificationManager)

const appVersion = getVersion()
const tauriApiClient = new TauriModrinthClient({
	userAgent: async () => `EdenLauncher/${await appVersion} (https://edenworld.fun/)`,
	labrinthBaseUrl: config.labrinthBaseUrl,
	archonBaseUrl: config.archonBaseUrl,
	sharedInstancesBaseUrl: config.sharedInstancesBaseUrl,
	features: [new VerboseLoggingFeature()],
})
provideModrinthClient(tauriApiClient)
providePageContext({
	hierarchicalSidebarAvailable: ref(false),
	floatingActionBarOffsets: {
		left: ref('var(--left-bar-width, 0px)'),
		right: ref('0px'),
	},
	featureFlags: {
		serverRamAsBytesAlwaysOn: computed(() =>
			themeStore.getFeatureFlag('server_ram_as_bytes_always_on'),
		),
	},
	openExternalUrl: (url) => void openUrl(url),
})
provideModalBehavior({
	noblur: computed(() => !themeStore.advancedRendering),
})

const {
	installationModal,
	unknownPackWarningModal,
	fetchExistingInstanceNames,
	handleCreate,
	handleBrowseModpacks,
	searchModpacks,
	getProjectVersions,
	getLoaderManifest,
	setModpackAlreadyInstalledModal,
	handleModpackDuplicateCreateAnyway,
	handleModpackDuplicateGoToInstance,
} = setupProviders(notificationManager, popupNotificationManager)

const offline = ref(!navigator.onLine)
window.addEventListener('offline', () => {
	offline.value = true
})
window.addEventListener('online', () => {
	offline.value = false
})

const showOnboarding = ref(false)
let updateCheckTimer = null
let updateNotificationShown = false
const nativeDecorations = ref(false)

const os = ref('')
const isDevEnvironment = ref(false)

const stateInitialized = ref(false)

const isMaximized = ref(false)

const authUnreachableDebug = useDebugLogger('AuthReachableChecker')
const authServerQuery = useQuery({
	queryKey: ['authServerReachability'],
	queryFn: async () => {
		await check_reachable()
		authUnreachableDebug('Auth servers are reachable')
		return true
	},
	refetchInterval: 5 * 60 * 1000, // 5 minutes
	retry: false,
	refetchOnWindowFocus: false,
})

const authUnreachable = computed(() => {
	if (authServerQuery.isError.value && !authServerQuery.isLoading.value) {
		console.warn('Failed to reach auth servers', authServerQuery.error.value)
		return true
	}
	return false
})

function handlePilotKey(event) {
	if (pilotActive.value) {
		if (event.key === 'Escape') deactivatePilot()
		return
	}
	if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return
	pilotBuffer.value = `${pilotBuffer.value}${event.key.toLocaleLowerCase()}`.slice(-16)
	if (pilotBuffer.value.endsWith('pilot')) activatePilot()
}

function activatePilot() {
	if (pilotActive.value) return
	previousPilotTheme = {
		visual: themeStore.visualTheme,
		base: themeStore.selectedTheme,
		accent: themeStore.accentColor,
	}
	themeStore.setVisualTheme('standard')
	themeStore.setThemeState('dark')
	themeStore.setAccentColor('#7C3AED')
	pilotActive.value = true
	startMenuOpen.value = false
	if (!pilotElement.value) return
	pilotElement.value.currentTime = 0
	pilotElement.value.volume = 1
	void pilotElement.value.play().catch((error) => {
		console.warn('Не удалось запустить Pilot mode.', error)
	})
}

function deactivatePilot() {
	pilotElement.value?.pause()
	pilotActive.value = false
	pilotBuffer.value = ''
	if (previousPilotTheme) {
		themeStore.setVisualTheme(previousPilotTheme.visual)
		themeStore.setThemeState(previousPilotTheme.base)
		themeStore.setAccentColor(previousPilotTheme.accent)
		previousPilotTheme = null
	}
}

function openWindowsRoute(path) {
	startMenuOpen.value = false
	if (isWindowsTheme.value) windowsDesktop.value?.openPath(path)
	else void router.push(path)
}

function navigateFromWindowsDesktop(path) {
	startMenuOpen.value = false
	void router.push(path)
}

function createGameInstance() {
	startMenuOpen.value = false
	installationModal.value?.show()
}

function openWindowsSettings() {
	startMenuOpen.value = false
	appSettingsModal.value?.show()
}

onMounted(async () => {
	await useCheckDisableMouseover()

	document.querySelector('body').addEventListener('click', handleClick)
	document.querySelector('body').addEventListener('auxclick', handleAuxClick)
	window.addEventListener('keydown', handlePilotKey)
})

onUnmounted(async () => {
	document.querySelector('body').removeEventListener('click', handleClick)
	document.querySelector('body').removeEventListener('auxclick', handleAuxClick)
	window.removeEventListener('keydown', handlePilotKey)
	if (updateCheckTimer !== null) window.clearInterval(updateCheckTimer)
	if (clockTimer !== null) window.clearInterval(clockTimer)
})

const { formatMessage } = useVIntl()

const messages = defineMessages({
	authUnreachableHeader: {
		id: 'app.auth-servers.unreachable.header',
		defaultMessage: 'Cannot reach authentication servers',
	},
	authUnreachableBody: {
		id: 'app.auth-servers.unreachable.body',
		defaultMessage:
			'Minecraft authentication servers may be down right now. Check your internet connection and try again later.',
	},
	launcherUpdateAvailableTitle: {
		id: 'edenlauncher.app.launcher-update.available.title',
		defaultMessage: 'Доступно обновление EdenLauncher',
	},
	launcherUpdateAvailableText: {
		id: 'edenlauncher.app.launcher-update.available.text',
		defaultMessage: 'Новая версия готова к автоматической установке.',
	},
	launcherUpdateAvailableAction: {
		id: 'edenlauncher.app.launcher-update.available.action',
		defaultMessage: 'Открыть обновление',
	},
	home: {
		id: 'app.nav.home',
		defaultMessage: 'EdenWorld',
	},
	library: {
		id: 'app.nav.library',
		defaultMessage: 'Библиотека',
	},
	createNewInstance: {
		id: 'app.nav.create-new-instance',
		defaultMessage: 'Создать профиль',
	},
	restarting: {
		id: 'app.restarting',
		defaultMessage: 'Перезапуск...',
	},
})

async function checkForLauncherUpdate(autoInstall = true) {
	if (isUpdateInstalling.value) return
	await fetchRemote()
	if (!isUpdateAvailable.value) {
		updateNotificationShown = false
		return
	}

	if (!updateNotificationShown) {
		addNotification({
			title: formatMessage(messages.launcherUpdateAvailableTitle),
			text: formatMessage(messages.launcherUpdateAvailableText),
			type: 'info',
			autoCloseMs: 10000,
		})
		updateNotificationShown = true
	}

	const settings = await getSettings()
	if (autoInstall && settings.auto_download_updates !== false) {
		const installer = getPreferredInstaller()
		if (installer) await downloadLatestRelease(installer)
	}
}

async function installOnboardingPack() {
	addNotification({
		title: 'Установка EdenWorld',
		text: 'Сборка загружается и будет установлена автоматически.',
		type: 'info',
		autoCloseMs: 8000,
	})

	try {
		const job = await edenWorldInstall.install()
		const instanceId = job.instance_id ?? job.target?.instance_id
		addNotification({
			title: 'Сборка EdenWorld установлена',
			text: 'Профиль готов к запуску.',
			type: 'success',
			autoCloseMs: 8000,
		})
		if (instanceId) await router.push(`/instance/${encodeURIComponent(instanceId)}/`)
	} catch (installError) {
		handleError(installError)
	}
}

async function completeFirstRun({ autoUpdates, discordRpc, installPack, locale, memoryMb }) {
	const settings = await getSettings()
	settings.locale = locale
	settings.theme = 'dark'
	settings.auto_download_updates = autoUpdates
	settings.discord_rpc = discordRpc
	settings.memory.maximum = memoryMb
	settings.personalized_ads = false
	settings.telemetry = false
	settings.onboarded = true
	await setSettings(settings)

	i18n.global.locale.value = locale
	themeStore.setThemeState('dark')
	showOnboarding.value = false
	void checkForLauncherUpdate(autoUpdates)
	if (installPack) void installOnboardingPack()
}

async function setupApp() {
	const settings = await getSettings()
	const savedTheme =
		settings.theme === 'light' || settings.theme === 'system' ? settings.theme : 'dark'
	settings.theme = savedTheme
	if (!settings.onboarded) {
		settings.locale = 'ru-RU'
		settings.auto_download_updates ??= true
	}
	settings.personalized_ads = false
	settings.telemetry = false
	await setSettings(settings)

	const {
		native_decorations,
		locale,
		collapsed_navigation,
		hide_nametag_skins_page,
		advanced_rendering,
		onboarded,
		default_page,
		developer_mode,
		feature_flags,
		pending_update_toast_for_version,
	} = settings

	// Initialize locale from saved settings
	if (locale) {
		i18n.global.locale.value = locale
	}

	if (default_page === 'Library') {
		await router.push('/library')
	}

	os.value = await getOS()
	const dev = await isDev()
	isDevEnvironment.value = dev
	showOnboarding.value = !onboarded

	nativeDecorations.value = native_decorations
	if (os.value !== 'MacOS') await getCurrentWindow().setDecorations(native_decorations)

	themeStore.setThemeState(savedTheme)
	themeStore.collapsedNavigation = collapsed_navigation
	themeStore.advancedRendering = advanced_rendering
	themeStore.hideNametagSkinsPage = hide_nametag_skins_page
	themeStore.devMode = developer_mode
	themeStore.featureFlags = feature_flags
	stateInitialized.value = true
	desktopInstances.value = await listInstances().catch(() => [])
	await fetchModrinthCredentials()

	isMaximized.value = await getCurrentWindow().isMaximized()

	await getCurrentWindow().onResized(async () => {
		isMaximized.value = await getCurrentWindow().isMaximized()
	})

	if (!dev) document.addEventListener('contextmenu', (event) => event.preventDefault())

	const osType = await type()
	if (osType === 'macos') {
		document.getElementsByTagName('html')[0].classList.add('mac')
	} else {
		document.getElementsByTagName('html')[0].classList.add('windows')
	}

	await warning_listener((e) =>
		addNotification({
			title: 'Warning',
			text: e.message,
			type: 'warning',
		}),
	)

	await info_listener((e) =>
		addNotification({
			title: 'Info',
			text: e.message,
			type: 'info',
			autoCloseMs: 8000,
		}),
	)

	get_opening_command().then(handleCommand)

	try {
		const skins = (await get_available_skins()) ?? []
		const capes = (await get_available_capes()) ?? []
		generateSkinPreviews(skins, capes)
	} catch (error) {
		console.warn('Failed to generate skin previews in app setup.', error)
	}

	if (pending_update_toast_for_version !== null) {
		settings.pending_update_toast_for_version = null
		await setSettings(settings)
	}

	if (onboarded) void checkForLauncherUpdate(true)
	updateCheckTimer = window.setInterval(() => void checkForLauncherUpdate(true), 30 * 60 * 1000)
}

const stateFailed = ref(false)
initialize_state()
	.then(() => {
		setupApp().catch((err) => {
			stateFailed.value = true
			console.error(err)
			error.showError(err, null, false, 'state_init')
		})
	})
	.catch((err) => {
		stateFailed.value = true
		console.error('Failed to initialize app', err)
		error.showError(err, null, false, 'state_init')
	})

const loading = setupLoadingStateProvider()
loading.setEnabled(false)
let initialLoadToken = loading.begin()
let routerToken = null
let suspenseToken = null

let suspensePending = false

router.beforeEach(() => {
	suspensePending = false
	if (routerToken) loading.end(routerToken)
	routerToken = loading.begin()
})
router.afterEach((to, from, failure) => {
	updateHistoryNavigationState()
	trackEvent('PageView', {
		path: to.path,
		fromPath: from.path,
		failed: failure,
	})
	setTimeout(() => {
		if (!suspensePending && stateInitialized.value) {
			if (initialLoadToken) {
				loading.end(initialLoadToken)
				initialLoadToken = null
			}
			if (routerToken) {
				loading.end(routerToken)
				routerToken = null
			}
		}
	}, 100)
})

function onSuspensePending() {
	suspensePending = true
	if (suspenseToken) loading.end(suspenseToken)
	suspenseToken = loading.begin()
}

function onSuspenseResolve() {
	if (suspenseToken) {
		loading.end(suspenseToken)
		suspenseToken = null
	}
	if (routerToken) {
		loading.end(routerToken)
		routerToken = null
	}
}

watch(stateInitialized, (ready) => {
	if (ready) {
		if (initialLoadToken) {
			loading.end(initialLoadToken)
			initialLoadToken = null
		}
		if (routerToken) {
			loading.end(routerToken)
			routerToken = null
		}
	}
})

const error = useError()
const errorModal = ref()
const minecraftAuthErrorModal = ref()
const minecraftRequiredModal = ref()

const contentInstall = createContentInstall({ router, handleError })
provideContentInstall(contentInstall)
const {
	instances: contentInstallInstances,
	compatibleLoaders: contentInstallLoaders,
	gameVersions: contentInstallGameVersions,
	loading: contentInstallLoading,
	defaultTab: contentInstallDefaultTab,
	preferredLoader: contentInstallPreferredLoader,
	preferredGameVersion: contentInstallPreferredGameVersion,
	releaseGameVersions: contentInstallReleaseGameVersions,
	projectInfo: contentInstallProjectInfo,
	handleInstallToInstance,
	handleCreateAndInstall,
	handleNavigate: handleContentInstallNavigate,
	handleCancel: handleContentInstallCancel,
	setContentInstallModal,
	setModpackAlreadyInstalledModal: setContentInstallModpackAlreadyInstalledModal,
	handleModpackDuplicateCreateAnyway: handleContentInstallModpackDuplicateCreateAnyway,
	handleModpackDuplicateGoToInstance: handleContentInstallModpackDuplicateGoToInstance,
	setIncompatibilityWarningModal: setContentIncompatibilityWarningModal,
	incompatibilityWarningVersions: contentInstallIncompatibilityWarningVersions,
	incompatibilityWarningCurrentGameVersion: contentInstallIncompatibilityWarningCurrentGameVersion,
	incompatibilityWarningCurrentLoader: contentInstallIncompatibilityWarningCurrentLoader,
	incompatibilityWarningProjectType: contentInstallIncompatibilityWarningProjectType,
	incompatibilityWarningProjectIconUrl: contentInstallIncompatibilityWarningProjectIconUrl,
	incompatibilityWarningProjectName: contentInstallIncompatibilityWarningProjectName,
	incompatibilityWarningMessage: contentInstallIncompatibilityWarningMessage,
	incompatibilityWarningInstalling: contentInstallIncompatibilityWarningInstalling,
	handleIncompatibilityWarningInstall: handleContentInstallIncompatibilityWarningInstall,
	handleIncompatibilityWarningCancel: handleContentInstallIncompatibilityWarningCancel,
} = contentInstall

const serverInstall = createServerInstall({ router, handleError, popupNotificationManager })
provideServerInstall(serverInstall)
const {
	setInstallToPlayModal: setServerInstallToPlayModal,
	setUpdateToPlayModal: setServerUpdateToPlayModal,
	setAddServerToInstanceModal: setServerAddServerToInstanceModal,
} = serverInstall

const modInstallModal = ref()
const modpackAlreadyInstalledModal = ref()
const contentInstallModpackAlreadyInstalledModal = ref()
const addServerToInstanceModal = ref()
const incompatibilityWarningModal = ref()
const installToPlayModal = ref()
const updateToPlayModal = ref()

const appSettingsModal = ref()

watch(incompatibilityWarningModal, (modal) => {
	if (modal) {
		setContentIncompatibilityWarningModal(modal)
	}
})

async function fetchModrinthCredentials() {
	credentials.value = undefined
	try {
		const value = await getModrinthCredentials()
		if (value?.user_id) {
			value.user = await get_user(value.user_id, 'bypass').catch(() => null)
		}
		credentials.value = value ?? null
	} catch (authError) {
		credentials.value = null
		console.warn('Не удалось загрузить аккаунт Modrinth.', authError)
	}
}

async function signInToModrinth(flow = 'sign-in') {
	try {
		await loginModrinth(flow)
		await fetchModrinthCredentials()
	} catch (authError) {
		if (!String(authError).toLocaleLowerCase().includes('cancel')) handleError(authError)
	}
}

async function requestModrinthSignIn(flow = 'sign-in') {
	await modrinthLoginModal.value?.showSigningIn(flow)
}

async function requestModrinthAuth(flow = 'sign-in') {
	await signInToModrinth(flow)
	return !!credentials.value?.session
}

async function logOutModrinth() {
	await logoutModrinth().catch(handleError)
	await fetchModrinthCredentials()
}

setupAuthProvider(credentials, async (_redirectPath, flow, options) => {
	if (options?.showModal === false) await signInToModrinth(flow)
	else await requestModrinthSignIn(flow)
})

watch(
	() => themeStore.visualTheme,
	(theme) => {
		if (theme !== 'windows10') startMenuOpen.value = false
	},
)

onMounted(() => {
	invoke('show_window')

	error.setErrorModal(errorModal.value)
	error.setMinecraftAuthErrorModal(minecraftAuthErrorModal.value)
	error.setMinecraftRequiredModal(minecraftRequiredModal.value)

	setContentIncompatibilityWarningModal(incompatibilityWarningModal.value)
	setContentInstallModal(modInstallModal.value)
	setContentInstallModpackAlreadyInstalledModal(contentInstallModpackAlreadyInstalledModal.value)
	setModpackAlreadyInstalledModal(modpackAlreadyInstalledModal.value)
	setServerAddServerToInstanceModal(addServerToInstanceModal.value)
	setServerInstallToPlayModal(installToPlayModal.value)
	setServerUpdateToPlayModal(updateToPlayModal.value)
})

const accounts = ref(null)
provide('accountsCard', accounts)
provide('showEdenPlayers', () => playersModal.value?.show())
provide('modrinthCredentials', credentials)
provide('requestModrinthSignIn', () => requestModrinthSignIn())
provide('showImportModal', async () => {
	await installationModal.value?.show()
	installationModal.value?.ctx?.setImportMode()
})

command_listener(handleCommand)

async function handleCommand(e) {
	if (!e) return

	if (e.event === 'RunMRPack') {
		// RunMRPack should directly install a local mrpack given a path
		if (e.path.endsWith('.mrpack')) {
			const location = { type: 'fromFile', path: e.path }
			const preview = await install_get_modpack_preview(location).catch(handleError)
			if (preview?.unknownFile || preview?.externalFilesInModpack.length > 0) {
				const splitPath = e.path.split(/[\\/]/)
				const fileName = splitPath ? splitPath[splitPath.length - 1] : e.path
				unknownPackWarningModal.value?.show(
					() => install_create_modpack_instance(location).then(() => undefined),
					fileName,
					preview.externalFilesInModpack,
				)
			} else {
				await install_create_modpack_instance(location).catch(handleError)
			}
			trackEvent('InstanceCreate', {
				source: 'CreationModalFileDrop',
			})
		}
	} else if (e.event === 'LaunchInstance') {
		const instance = await getInstance(e.id).catch(handleError)
		if (!instance || instance.quarantined) return

		if (e.server) {
			await start_join_server(e.id, e.server).catch(handleError)
		} else if (e.singleplayer_world) {
			await start_join_singleplayer_world(e.id, e.singleplayer_world).catch(handleError)
		} else {
			await run(e.id).catch(handleError)
		}
	} else if (e.event === 'InstallVersion') {
		const version = await get_version(e.id, 'must_revalidate').catch(handleError)
		if (version) {
			await contentInstall
				.install(version.project_id, version.id, null, 'URLConfirmModal', undefined, undefined, {
					showProjectInfo: true,
				})
				.catch(handleError)
		}
	} else {
		await contentInstall
			.install(e.id, null, null, 'URLConfirmModal', undefined, undefined, { showProjectInfo: true })
			.catch(handleError)
	}
}

const appUpdateDownload = {
	progress: ref(0),
	version: ref(),
}

async function openModrinthProjectLinkInApp(parsed) {
	const { slug, pathSuffix, url } = parsed
	const loadToken = loading.begin()
	try {
		const { id } = await tauriApiClient.labrinth.projects_v2.check(slug)
		const query = mergeUrlQuery(route.query, url)
		await router.push({
			path: `/project/${id}${pathSuffix}`,
			query,
			hash: url.hash || undefined,
		})
	} catch (err) {
		if (err instanceof ModrinthApiError && err.statusCode === 404) {
			openUrl(url.href)
		} else {
			handleError(err)
		}
	} finally {
		loading.end(loadToken)
	}
}

function handleClick(e) {
	let target = e.target
	while (target != null) {
		if (target.matches('a')) {
			if (
				target.href &&
				['http://', 'https://', 'mailto:', 'tel:'].some((v) => target.href.startsWith(v)) &&
				!target.classList.contains('router-link-active') &&
				!target.href.startsWith('http://localhost') &&
				!target.href.startsWith('https://tauri.localhost') &&
				!target.href.startsWith('http://tauri.localhost')
			) {
				const parsed = parseModrinthLink(target.href)
				if (target.target !== '_blank' && parsed) {
					void openModrinthProjectLinkInApp(parsed)
				} else {
					openUrl(target.href)
				}
			}
			e.preventDefault()
			break
		}
		target = target.parentElement
	}
}

function handleAuxClick(e) {
	// disables middle click -> new tab
	if (e.button === 1) {
		e.preventDefault()
		// instead do a left click
		const event = new MouseEvent('click', {
			view: window,
			bubbles: true,
			cancelable: true,
		})
		e.target.dispatchEvent(event)
	}
}

provideAppUpdateDownloadProgress(appUpdateDownload)
</script>

<template>
	<StudioExitGuard v-if="stateInitialized" />
	<SplashScreen v-if="!stateFailed" ref="splashScreen" data-tauri-drag-region />
	<div id="teleports"></div>
	<div
		v-if="stateInitialized"
		class="app-grid-layout relative"
		:class="{ 'disable-advanced-rendering': !themeStore.advancedRendering }"
	>
		<Suspense>
			<AppSettingsModal ref="appSettingsModal" />
		</Suspense>
		<ModrinthAccountRequiredModal ref="modrinthLoginModal" :request-auth="requestModrinthAuth" />
		<ModrinthCommunityModal
			ref="modrinthCommunityModal"
			:credentials="credentials"
			:sign-in="requestModrinthSignIn"
			:log-out="logOutModrinth"
		/>
		<FirstRunSetup v-if="showOnboarding" @complete="completeFirstRun" />
		<CreationFlowModal
			ref="installationModal"
			type="instance"
			show-snapshot-toggle
			:fetch-existing-instance-names="fetchExistingInstanceNames"
			:search-modpacks="searchModpacks"
			:get-project-versions="getProjectVersions"
			:get-loader-manifest="getLoaderManifest"
			@create="handleCreate"
			@browse-modpacks="handleBrowseModpacks"
		/>
		<UnknownPackWarningModal ref="unknownPackWarningModal" />
		<EdenPlayersModal ref="playersModal" />
		<div v-if="isWindowsTheme && startMenuOpen" class="windows-start-menu">
			<header>
				<EdenMark :size="36" />
				<div>
					<strong>EdenLauncher</strong
					><span>{{ credentials?.user?.username ?? 'Локальный пользователь' }}</span>
				</div>
			</header>
			<button @click="openWindowsRoute('/')"><HomeIcon /> EdenWorld</button>
			<button @click="openWindowsRoute('/library')"><LibraryIcon /> Библиотека</button>
			<button @click="openWindowsRoute('/browse/modpack')"><CompassIcon /> Каталог Modrinth</button>
			<button @click="openWindowsRoute('/skins')"><ShirtIcon /> Скины</button>
			<button @click="openWindowsRoute('/friends')"><EdenIcon name="users" /> Друзья</button>
			<button @click="openWindowsRoute('/downloads')"><EdenIcon name="download" /> Загрузки</button>
			<button @click="createGameInstance"><PlusIcon /> Создать игровую сборку</button>
			<footer>
				<button @click="openWindowsSettings"><SettingsIcon /> Параметры</button>
			</footer>
		</div>
		<EdenSidebar
			v-if="!isWindowsTheme"
			class="app-grid-navbar"
			:compact="compactNavigation"
			:offline="offline"
			@settings="appSettingsModal?.show()"
			@create="createGameInstance"
			@players="playersModal?.show()"
		>
			<template #account>
				<Suspense>
					<AccountSwitcherButton ref="accounts" variant="sidebar" :compact="compactNavigation" />
				</Suspense>
			</template>
		</EdenSidebar>
		<div v-else class="app-grid-navbar windows-taskbar" role="toolbar" aria-label="Панель задач">
			<button
				type="button"
				class="windows-taskbar__start"
				:class="{ active: startMenuOpen }"
				:aria-expanded="startMenuOpen"
				aria-label="Меню «Пуск»"
				@click="startMenuOpen = !startMenuOpen"
			>
				<WindowsLogoIcon />
			</button>
			<WindowsTaskbarSearch :instances="desktopInstances" @open="openWindowsRoute" />
			<div class="windows-taskbar__tray">
				<RouterLink
					to="/downloads"
					class="windows-taskbar__tray-button"
					:aria-label="`Загрузки${downloads.activeCount.value ? `, активных: ${downloads.activeCount.value}` : ''}`"
					@click.prevent="openWindowsRoute('/downloads')"
				>
					<EdenIcon name="download" :size="18" />
					<span v-if="downloads.activeCount.value" class="windows-taskbar__badge">{{
						downloads.activeCount.value
					}}</span>
				</RouterLink>
				<Suspense>
					<AccountSwitcherButton ref="accounts" />
				</Suspense>
				<time class="windows-taskbar__clock" :datetime="clockIso">
					<span>{{ clockTime }}</span>
					<span>{{ clockDate }}</span>
				</time>
			</div>
		</div>
		<div data-tauri-drag-region class="app-grid-statusbar eden-titlebar">
			<div data-tauri-drag-region class="eden-titlebar__start">
				<span data-tauri-drag-region class="eden-titlebar__brand">
					<EdenMark :size="20" />
					<span data-tauri-drag-region>EdenLauncher</span>
				</span>
				<div class="eden-titlebar__history">
					<button
						type="button"
						class="eden-titlebar__icon-button"
						:disabled="!canNavigateBack"
						aria-label="Назад"
						data-tauri-drag-region-exclude
						@click="router.back()"
					>
						<ChevronLeftIcon />
					</button>
					<button
						type="button"
						class="eden-titlebar__icon-button"
						:disabled="!canNavigateForward"
						aria-label="Вперёд"
						data-tauri-drag-region-exclude
						@click="router.forward()"
					>
						<ChevronRightIcon />
					</button>
				</div>
				<div data-tauri-drag-region class="eden-titlebar__breadcrumbs">
					<Breadcrumbs />
				</div>
			</div>
			<section data-tauri-drag-region class="eden-titlebar__end">
				<Suspense>
					<AppActionBar />
				</Suspense>
				<button
					type="button"
					class="eden-titlebar__modrinth"
					:title="credentials?.user ? `Modrinth: ${credentials.user.username}` : 'Войти в Modrinth'"
					:aria-label="
						credentials?.user
							? `Аккаунт Modrinth: ${credentials.user.username}`
							: 'Войти в Modrinth'
					"
					data-tauri-drag-region-exclude
					@click="credentials?.user ? modrinthCommunityModal?.show() : requestModrinthSignIn()"
				>
					<Avatar v-if="credentials?.user" :src="credentials.user.avatar_url" size="24px" circle />
					<LogInIcon v-else />
				</button>
				<WindowControls />
			</section>
		</div>
	</div>
	<div
		v-if="stateInitialized"
		class="app-contents"
		:class="{
			'disable-advanced-rendering': !themeStore.advancedRendering,
		}"
	>
		<div class="app-viewport flex-grow router-view">
			<div
				class="loading-indicator-container h-8 fixed z-50 pointer-events-none"
				:style="{
					top: 'calc(var(--top-bar-height))',
					left: 'calc(var(--left-bar-width))',
					width: 'calc(100% - var(--left-bar-width) - var(--right-bar-width))',
				}"
			>
				<LoadingBar position="absolute" />
			</div>
			<div
				v-if="themeStore.featureFlags.page_path"
				class="absolute bottom-0 left-0 m-2 bg-tooltip-bg text-tooltip-text font-semibold rounded-full px-2 py-1 text-xs z-50"
			>
				{{ route.fullPath }}
			</div>
			<div
				id="background-teleport-target"
				class="absolute h-full w-full -z-10 rounded-tl-[--radius-xl] overflow-hidden"
			></div>
			<Admonition
				v-if="authUnreachable"
				type="warning"
				:header="formatMessage(messages.authUnreachableHeader)"
				class="m-6 mb-0"
			>
				{{ formatMessage(messages.authUnreachableBody) }}
			</Admonition>
			<WindowsDesktop
				v-if="showWindowsDesktop"
				ref="windowsDesktop"
				:instances="desktopInstances"
				:active-path="route.fullPath"
				@navigate="navigateFromWindowsDesktop"
				@create="createGameInstance"
				@settings="appSettingsModal?.show()"
			>
				<RouterView v-slot="{ Component }">
					<template v-if="Component">
						<Suspense @pending="onSuspensePending" @resolve="onSuspenseResolve">
							<component :is="Component"></component>
						</Suspense>
					</template>
				</RouterView>
			</WindowsDesktop>
			<RouterView v-else v-slot="{ Component }">
				<template v-if="Component">
					<Suspense @pending="onSuspensePending" @resolve="onSuspenseResolve">
						<component :is="Component"></component>
					</Suspense>
				</template>
			</RouterView>
		</div>
	</div>
	<EdenErrorFx :editor-active="route.path === '/skins'" />
	<I18nDebugPanel />
	<NotificationPanel :has-sidebar="false" />
	<PopupNotificationPanel :has-sidebar="false" />
	<ErrorModal ref="errorModal" />
	<MinecraftAuthErrorModal ref="minecraftAuthErrorModal" />
	<MinecraftRequiredModal ref="minecraftRequiredModal" />
	<ContentInstallModal
		ref="modInstallModal"
		:instances="contentInstallInstances"
		:compatible-loaders="contentInstallLoaders"
		:game-versions="contentInstallGameVersions"
		:loading="contentInstallLoading"
		:default-tab="contentInstallDefaultTab"
		:preferred-loader="contentInstallPreferredLoader"
		:preferred-game-version="contentInstallPreferredGameVersion"
		:release-game-versions="contentInstallReleaseGameVersions"
		:project-info="contentInstallProjectInfo"
		@install="handleInstallToInstance"
		@create-and-install="handleCreateAndInstall"
		@navigate="handleContentInstallNavigate"
		@cancel="handleContentInstallCancel"
	/>
	<ModpackAlreadyInstalledModal
		ref="modpackAlreadyInstalledModal"
		@create-anyway="handleModpackDuplicateCreateAnyway"
		@go-to-instance="handleModpackDuplicateGoToInstance"
	/>
	<AddServerToInstanceModal ref="addServerToInstanceModal" />
	<ContentUpdaterModal
		ref="incompatibilityWarningModal"
		mode="incompatibility-warning"
		:versions="contentInstallIncompatibilityWarningVersions"
		:current-game-version="contentInstallIncompatibilityWarningCurrentGameVersion"
		:current-loader="contentInstallIncompatibilityWarningCurrentLoader"
		current-version-id=""
		:is-app="true"
		:project-type="contentInstallIncompatibilityWarningProjectType"
		:project-icon-url="contentInstallIncompatibilityWarningProjectIconUrl"
		:project-name="contentInstallIncompatibilityWarningProjectName"
		:warning="contentInstallIncompatibilityWarningMessage"
		:action-loading="contentInstallIncompatibilityWarningInstalling"
		@update="handleContentInstallIncompatibilityWarningInstall"
		@cancel="handleContentInstallIncompatibilityWarningCancel"
	/>
	<ModpackAlreadyInstalledModal
		ref="contentInstallModpackAlreadyInstalledModal"
		@create-anyway="handleContentInstallModpackDuplicateCreateAnyway"
		@go-to-instance="handleContentInstallModpackDuplicateGoToInstance"
	/>
	<InstallToPlayModal ref="installToPlayModal" :show-external-warnings="false" />
	<UpdateToPlayModal ref="updateToPlayModal" :show-external-warnings="false" />
	<div v-show="pilotActive" class="pilot-easter-egg" :aria-hidden="!pilotActive">
		<video ref="pilotElement" :src="pilotVideo" preload="auto" loop playsinline></video>
		<div class="pilot-easter-egg__veil"></div>
		<div class="pilot-easter-egg__label">
			<strong>PILOT MODE</strong><span>Нажмите Esc, чтобы вернуться</span>
		</div>
		<button aria-label="Закрыть Pilot mode" @click="deactivatePilot">×</button>
	</div>
</template>

<style lang="scss" scoped>
@import '../../../packages/assets/styles/astralrinth/neon-icon.scss';
@import '../../../packages/assets/styles/astralrinth/neon-text.scss';
.app-grid-layout,
.app-contents {
	--top-bar-height: var(--eden-titlebar-height);
	--left-bar-width: var(--eden-sidebar-width);
	--right-bar-width: 0px;
}

.app-grid-layout {
	display: grid;
	grid-template: 'status status' 'nav dummy';
	grid-template-columns: var(--left-bar-width) 1fr;
	grid-template-rows: var(--top-bar-height) 1fr;
	position: relative;
	height: 100vh;
	background-color: var(--eden-canvas);
}

.app-grid-navbar {
	grid-area: nav;
	position: relative;
	z-index: 2;
	min-height: 0;
}

.app-grid-statusbar {
	grid-area: status;
	position: relative;
	z-index: 3;
	padding-right: var(--window-controls-width, 0px);
}

[data-tauri-drag-region-exclude] {
	-webkit-app-region: no-drag;
}

.app-contents {
	position: absolute;
	z-index: 1;
	left: var(--left-bar-width);
	top: var(--top-bar-height);
	right: 0;
	bottom: 0;
	height: calc(100vh - var(--top-bar-height));
	background-color: var(--eden-canvas);
	display: block;
}

.loading-indicator-container {
	overflow: hidden;
}

.disable-advanced-rendering {
	*,
	:deep(*) {
		box-shadow: none !important;
		--tw-drop-shadow:;
	}
}

.app-viewport {
	flex-grow: 1;
	height: 100%;
	overflow: auto;
	overflow-x: hidden;
	scrollbar-gutter: stable;
}

// ---------- Title bar ----------

.eden-titlebar {
	display: flex;
	height: var(--eden-titlebar-height);
	box-sizing: border-box;
	align-items: center;
	gap: 12px;
	border-bottom: 1px solid var(--eden-border);
	color: var(--eden-text);
	background: var(--eden-canvas);
}

.eden-titlebar__start {
	display: flex;
	min-width: 0;
	height: 100%;
	flex: 1;
	align-items: center;
	gap: 14px;
	padding-left: 18px;
}

.eden-titlebar__brand {
	display: flex;
	flex: 0 0 auto;
	align-items: center;
	gap: 10px;
	font-size: 13px;
	font-weight: 650;
	white-space: nowrap;
}

.eden-titlebar__history {
	display: flex;
	flex: 0 0 auto;
	gap: 2px;
	margin-left: 18px;
}

.eden-titlebar__icon-button,
.eden-titlebar__modrinth {
	display: grid;
	width: 28px;
	height: 28px;
	place-items: center;
	padding: 0;
	border: 0;
	border-radius: 7px;
	color: var(--eden-text-secondary);
	background: transparent;
	cursor: pointer;
	transition:
		color var(--eden-motion-hover) ease,
		background-color var(--eden-motion-hover) ease;

	svg {
		width: 16px;
		height: 16px;
	}

	&:hover:not(:disabled) {
		color: var(--eden-text);
		background: var(--eden-surface-raised);
	}

	&:disabled {
		cursor: default;
		opacity: 0.35;
	}

	&:focus-visible {
		outline: 2px solid var(--eden-focus);
		outline-offset: 2px;
	}
}

.eden-titlebar__modrinth {
	width: 32px;
	height: 32px;
	border-radius: 50%;
}

.eden-titlebar__breadcrumbs {
	display: flex;
	min-width: 0;
	flex: 1;
	align-items: center;
	overflow: hidden;
	color: var(--eden-text-secondary);
	font-size: 12px;
}

.eden-titlebar__end {
	display: flex;
	height: 100%;
	flex: 0 0 auto;
	align-items: center;
	gap: 8px;
	margin-left: auto;

	:deep(.app-action-bar),
	:deep(> .flex) {
		font-size: 12px;
	}
}

// ---------- Windows 10 taskbar ----------

.windows-taskbar {
	position: fixed;
	right: 0;
	bottom: 0;
	left: 0;
	z-index: 100;
	display: flex;
	height: 48px;
	box-sizing: border-box;
	align-items: stretch;
	border-top: 1px solid rgba(255, 255, 255, 0.08);
	color: #f5f3fa;
	background: rgba(13, 13, 20, 0.94);
	backdrop-filter: blur(20px);
	font-family: var(--font-standard);

	> * {
		flex: 0 0 auto;
	}

	:deep(.windows-open-apps) {
		order: 2;
	}
}

.windows-taskbar__start {
	display: grid;
	width: 56px;
	order: 0;
	place-items: center;
	border: 0;
	color: #f5f3fa;
	background: transparent;
	cursor: pointer;

	svg {
		width: 22px;
		height: 22px;
	}

	&:hover,
	&.active {
		background: rgba(255, 255, 255, 0.1);
	}

	&:focus-visible {
		outline: 2px solid var(--eden-focus);
		outline-offset: -2px;
	}
}

.windows-taskbar__tray {
	display: flex;
	order: 10;
	align-items: center;
	gap: 6px;
	margin-left: auto;
	padding: 0 14px 0 8px;
}

.windows-taskbar__tray-button {
	position: relative;
	display: grid;
	width: 40px;
	height: 40px;
	place-items: center;
	border-radius: 4px;
	color: #f5f3fa;

	&:hover {
		background: rgba(255, 255, 255, 0.1);
	}
}

.windows-taskbar__badge {
	position: absolute;
	top: 4px;
	right: 4px;
	display: grid;
	min-width: 16px;
	height: 16px;
	place-items: center;
	border-radius: 8px;
	color: var(--eden-on-accent);
	background: var(--eden-accent);
	font-size: 10px;
	font-weight: 700;
}

.windows-taskbar__clock {
	display: flex;
	min-width: 76px;
	flex-direction: column;
	align-items: flex-end;
	justify-content: center;
	gap: 2px;
	padding-left: 8px;
	font-size: 12px;
	line-height: 1.15;

	span:last-child {
		color: #c9c7d6;
		font-size: 11px;
	}
}

@media (prefers-reduced-motion: no-preference) {
	.nav-button-animated-enter-active {
		transition: all 0.5s cubic-bezier(0.15, 1.4, 0.64, 0.96);
	}

	.nav-button-animated-leave-active {
		transition: all 0.25s ease;
	}

	.nav-button-animated-enter-active {
		position: relative;
	}

	.nav-button-animated-enter-active::before {
		content: '';
		inset: 0;
		border-radius: 100vw;
		background-color: var(--color-brand-highlight);
		position: absolute;
		animation: pop 0.5s ease-in forwards;
		opacity: 0;
	}

	@keyframes pop {
		0% {
			scale: 0.5;
		}
		50% {
			opacity: 0.5;
		}
		100% {
			scale: 1.5;
		}
	}

	.nav-button-animated-enter-from {
		scale: 0.5;
		translate: -2rem 0;
		opacity: 0;
	}

	.nav-button-animated-leave-to {
		scale: 0.75;
		opacity: 0;
	}

	.fade-enter-active {
		transition: 0.25s ease-in-out;
	}

	.fade-enter-from {
		opacity: 0;
	}
}

.windows-start-menu {
	position: fixed;
	bottom: 48px;
	left: 0;
	z-index: 120;
	display: flex;
	width: 23rem;
	max-height: min(37rem, calc(100vh - 6rem));
	box-sizing: border-box;
	flex-direction: column;
	overflow-y: auto;
	padding: 0.55rem;
	border: 1px solid #32313f;
	border-radius: 0;
	color: #f5f3fa;
	background: rgba(17, 17, 25, 0.98);
	box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.42);
	font-family: var(--font-standard);
}

.windows-start-menu header {
	display: flex;
	align-items: center;
	gap: 0.7rem;
	padding: 0.65rem;
	border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}

.windows-start-menu header > svg {
	color: var(--eden-accent);
}

.windows-start-menu header > div {
	display: flex;
	flex-direction: column;
}

.windows-start-menu header span {
	color: #aaa8bc;
	font-size: 0.75rem;
}

.windows-start-menu > button,
.windows-start-menu footer button {
	display: flex;
	align-items: center;
	gap: 0.7rem;
	min-height: 2.8rem;
	padding: 0.55rem 0.7rem;
	border: 0;
	border-radius: 0;
	color: #f5f3fa;
	background: transparent;
	font: inherit;
	text-align: left;
	cursor: pointer;
}

.windows-start-menu button:hover {
	background: rgba(255, 255, 255, 0.08);
}

.windows-start-menu button:focus-visible {
	outline: 2px solid var(--eden-focus);
	outline-offset: -2px;
}

.windows-start-menu button svg {
	width: 1.15rem;
	height: 1.15rem;
}

.windows-start-menu footer {
	margin-top: 1rem;
	border-top: 1px solid rgba(255, 255, 255, 0.12);
}

.pilot-easter-egg {
	position: fixed;
	inset: 0;
	z-index: 10000;
	overflow: hidden;
	background: #000;
}

.pilot-easter-egg video {
	width: 100%;
	height: 100%;
	object-fit: cover;
}

.pilot-easter-egg__veil {
	position: absolute;
	inset: 0;
	pointer-events: none;
	background: linear-gradient(180deg, rgba(0, 0, 0, 0.05), rgba(0, 0, 0, 0.55));
}

.pilot-easter-egg__label {
	position: absolute;
	right: 2rem;
	bottom: 2rem;
	display: flex;
	flex-direction: column;
	align-items: flex-end;
	color: white;
	font-family: ui-monospace, Consolas, monospace;
	text-shadow: 0 2px 8px #000;
}

.pilot-easter-egg__label strong {
	font-size: 1.4rem;
	letter-spacing: 0.16em;
}

.pilot-easter-egg > button {
	position: absolute;
	top: 1rem;
	right: 1rem;
	display: grid;
	width: 2.5rem;
	height: 2.5rem;
	padding: 0;
	place-items: center;
	border: 1px solid rgba(255, 255, 255, 0.45);
	border-radius: 50%;
	color: white;
	background: rgba(0, 0, 0, 0.45);
	font-size: 1.5rem;
	cursor: pointer;
}
</style>
<style>
.os-theme-dark,
.os-theme-light {
	--os-handle-bg: var(--color-scrollbar) !important;
	--os-handle-bg-hover: var(--color-scrollbar) !important;
	--os-handle-bg-active: var(--color-scrollbar) !important;
}

.mac {
	.app-grid-statusbar {
		padding-left: 5rem;
	}
}

.windows {
	.fake-appbar {
		height: 2.5rem !important;
	}

	.info-card {
		right: 22rem;
	}

	.profile-card {
		right: 8rem;
	}
}
</style>
