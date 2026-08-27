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
	ButtonStyled,
	commonMessages,
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
import { computed, nextTick, onMounted, onUnmounted, provide, ref, watch } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'

import pilotVideo from '@/assets/pilot.mp4'
import AccountSwitcherButton from '@/components/ui/AccountSwitcherButton.vue'
import AppActionBar from '@/components/ui/AppActionBar.vue'
import Breadcrumbs from '@/components/ui/Breadcrumbs.vue'
import CreateHubModal from '@/components/ui/CreateHubModal.vue'
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
import NavButton from '@/components/ui/NavButton.vue'
import QuickInstanceSwitcher from '@/components/ui/QuickInstanceSwitcher.vue'
import SplashScreen from '@/components/ui/SplashScreen.vue'
import WindowControls from '@/components/ui/WindowControls.vue'
import WindowsDesktop from '@/components/ui/WindowsDesktop.vue'
import WindowsLogoIcon from '@/components/ui/WindowsLogoIcon.vue'
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
import { downloadAndInstallEdenWorld } from '@/helpers/edenworld'
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
import { appMessages } from '@/utils/app-messages'

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

const APP_LEFT_NAV_WIDTH = '4rem'
const credentials = ref()
const createHubModal = ref()
const modrinthLoginModal = ref()
const modrinthCommunityModal = ref()
const desktopInstances = ref([])
const startMenuOpen = ref(false)
const windowsDesktopOpen = ref(true)
const pilotActive = ref(false)
const pilotElement = ref()
const pilotBuffer = ref('')
let previousPilotTheme = null

const isWindowsTheme = computed(() => themeStore.visualTheme === 'windows10')
const showWindowsDesktop = computed(
	() => isWindowsTheme.value && windowsDesktopOpen.value && route.path === '/',
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
		left: ref(APP_LEFT_NAV_WIDTH),
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
	void nextTick(() => {
		if (!pilotElement.value) return
		pilotElement.value.currentTime = 0
		pilotElement.value.volume = 1
		void pilotElement.value.play().catch(() => undefined)
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
	windowsDesktopOpen.value = false
	void router.push(path)
}

function openHome() {
	if (isWindowsTheme.value) {
		startMenuOpen.value = false
		windowsDesktopOpen.value = true
		void router.push('/')
	} else {
		void router.push('/')
	}
}

function openCreateMenu() {
	if (isWindowsTheme.value) startMenuOpen.value = !startMenuOpen.value
	else createHubModal.value?.show()
}

function createGameInstance() {
	startMenuOpen.value = false
	installationModal.value?.show()
}

function createLocalServer() {
	startMenuOpen.value = false
	createHubModal.value?.showServerCreate()
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
		const job = await downloadAndInstallEdenWorld(() => undefined)
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
		if (theme === 'windows10') windowsDesktopOpen.value = true
		else startMenuOpen.value = false
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
		<CreateHubModal ref="createHubModal" @create-instance="createGameInstance" />
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
		<div v-if="isWindowsTheme && startMenuOpen" class="windows-start-menu">
			<header>
				<WindowsLogoIcon />
				<div>
					<strong>EdenLauncher</strong
					><span>{{ credentials?.user?.username ?? 'Локальный пользователь' }}</span>
				</div>
			</header>
			<button @click="openWindowsRoute('/')"><HomeIcon /> EdenWorld</button>
			<button @click="openWindowsRoute('/library')"><LibraryIcon /> Библиотека</button>
			<button @click="openWindowsRoute('/browse/modpack')"><CompassIcon /> Каталог Modrinth</button>
			<button @click="createGameInstance"><PlusIcon /> Создать игровую сборку</button>
			<button @click="createLocalServer"><WindowsLogoIcon /> Создать сервер</button>
			<footer>
				<button @click="openWindowsSettings"><SettingsIcon /> Параметры</button>
			</footer>
		</div>
		<div
			class="app-grid-navbar bg-bg-raised flex flex-col p-[0.5rem] pt-0 gap-[0.25rem] w-[--left-bar-width]"
		>
			<NavButton v-tooltip.right="formatMessage(messages.home)" :to="openHome">
				<HomeIcon />
			</NavButton>
			<NavButton
				v-tooltip.right="formatMessage(commonMessages.discoverContentLabel)"
				to="/browse/modpack"
				:is-primary="() => route.path.startsWith('/browse') && !route.query.i"
				:is-subpage="(route) => route.path.startsWith('/project') && !route.query.i"
			>
				<CompassIcon />
			</NavButton>
			<NavButton v-tooltip.right="formatMessage(appMessages.skinSelectorLabel)" to="/skins">
				<ShirtIcon />
			</NavButton>
			<NavButton
				v-tooltip.right="formatMessage(messages.library)"
				to="/library"
				:is-primary="(r) => r.path === '/library' || r.path === '/library'"
				:is-subpage="
					() =>
						route.path.startsWith('/instance') ||
						((route.path.startsWith('/browse') || route.path.startsWith('/project')) &&
							route.query.i)
				"
			>
				<LibraryIcon />
			</NavButton>
			<suspense>
				<QuickInstanceSwitcher />
			</suspense>
			<NavButton
				v-tooltip.right="formatMessage(messages.createNewInstance)"
				:to="openCreateMenu"
				:disabled="offline"
				class="windows-start-button"
			>
				<WindowsLogoIcon v-if="isWindowsTheme" />
				<PlusIcon v-else />
			</NavButton>
			<div class="flex flex-grow"></div>
			<NavButton
				v-tooltip.right="formatMessage(commonMessages.settingsLabel)"
				:to="() => appSettingsModal?.show()"
			>
				<SettingsIcon />
			</NavButton>
		</div>
		<div data-tauri-drag-region class="app-grid-statusbar bg-bg-raised h-[--top-bar-height] flex">
			<div data-tauri-drag-region class="flex min-w-0 flex-1 items-center overflow-hidden p-2">
				<div data-tauri-drag-region class="ml-2 flex shrink-0 items-center gap-2">
					<ButtonStyled type="outlined" circular>
						<button
							class="!h-7 !min-w-7 !w-7 !border !border-surface-4 !p-0 !opacity-100"
							:disabled="!canNavigateBack"
							aria-label="Назад"
							@click="router.back()"
						>
							<ChevronLeftIcon
								class="!size-4 !text-primary"
								:class="{ 'opacity-20': !canNavigateBack }"
							/>
						</button>
					</ButtonStyled>
					<ButtonStyled type="outlined" circular>
						<button
							class="!h-7 !min-w-7 !w-7 !border !border-surface-4 !p-0 !opacity-100"
							:disabled="!canNavigateForward"
							aria-label="Вперёд"
							@click="router.forward()"
						>
							<ChevronRightIcon
								class="!size-4 !text-primary"
								:class="{ 'opacity-20': !canNavigateForward }"
							/>
						</button>
					</ButtonStyled>
				</div>
				<Breadcrumbs />
			</div>
			<section data-tauri-drag-region class="flex shrink-0 ml-auto items-center">
				<button
					class="modrinth-account-button"
					:title="credentials?.user ? `Modrinth: ${credentials.user.username}` : 'Войти в Modrinth'"
					@click="credentials?.user ? modrinthCommunityModal?.show() : requestModrinthSignIn()"
				>
					<Avatar v-if="credentials?.user" :src="credentials.user.avatar_url" size="28px" circle />
					<LogInIcon v-else />
				</button>
				<div class="mr-2">
					<Suspense>
						<AccountSwitcherButton ref="accounts" />
					</Suspense>
				</div>
				<div class="flex mr-3">
					<Suspense>
						<AppActionBar />
					</Suspense>
				</div>
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
				:instances="desktopInstances"
				@navigate="openWindowsRoute"
				@create="createHubModal?.show()"
				@servers="createHubModal?.showServers()"
				@settings="appSettingsModal?.show()"
			/>
			<RouterView v-else v-slot="{ Component }">
				<template v-if="Component">
					<Suspense @pending="onSuspensePending" @resolve="onSuspenseResolve">
						<component :is="Component"></component>
					</Suspense>
				</template>
			</RouterView>
		</div>
	</div>
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
	<div v-if="pilotActive" class="pilot-easter-egg">
		<video ref="pilotElement" :src="pilotVideo" autoplay loop playsinline></video>
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
	--top-bar-height: 3rem;
	--left-bar-width: 4rem;
	--right-bar-width: 0px;
}

.app-grid-layout {
	display: grid;
	grid-template: 'status status' 'nav dummy';
	grid-template-columns: auto 1fr;
	grid-template-rows: auto 1fr;
	position: relative;
	//z-index: 0;
	background-color: var(--color-raised-bg);
	height: 100vh;
}

.app-grid-navbar {
	grid-area: nav;
	position: relative;
	z-index: 2;
}

.app-grid-statusbar {
	grid-area: status;
	padding-right: var(--window-controls-width, 0px);
	position: relative;
	z-index: 2;
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
	background-color: var(--color-bg);
	border-top-left-radius: var(--radius-xl);

	display: block;
}

.loading-indicator-container {
	border-top-left-radius: var(--radius-xl);
	overflow: hidden;
}

.disable-advanced-rendering {
	&.app-contents::before {
		box-shadow: none;
	}

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

.app-contents::before {
	z-index: 30;
	content: '';
	position: fixed;
	left: var(--left-bar-width);
	top: var(--top-bar-height);
	right: calc(-1 * var(--left-bar-width));
	bottom: calc(-1 * var(--left-bar-width));
	border-radius: var(--radius-xl);
	box-shadow: 1px 1px 15px rgba(0, 0, 0, 0.1) inset;
	border-color: var(--surface-5);
	border-width: 1px;
	border-style: solid;
	pointer-events: none;
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

.modrinth-account-button {
	display: grid;
	width: 2.25rem;
	height: 2.25rem;
	margin-right: 0.45rem;
	padding: 0;
	place-items: center;
	border: 1px solid var(--color-button-border);
	border-radius: 50%;
	color: var(--color-brand);
	background: var(--color-button-bg);
	cursor: pointer;
}

.modrinth-account-button:hover {
	border-color: var(--color-brand);
}

.modrinth-account-button svg {
	width: 1rem;
	height: 1rem;
}

.windows-start-menu {
	position: fixed;
	bottom: 3rem;
	left: 0;
	z-index: 120;
	display: flex;
	width: 23rem;
	max-height: min(37rem, calc(100vh - 5rem));
	box-sizing: border-box;
	flex-direction: column;
	padding: 0.55rem;
	border: 1px solid rgba(255, 255, 255, 0.18);
	border-radius: 0;
	color: white;
	background: rgba(20, 31, 45, 0.98);
	box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.42);
	font-family: 'Segoe UI', sans-serif;
}

.windows-start-menu header {
	display: flex;
	align-items: center;
	gap: 0.7rem;
	padding: 0.65rem;
	border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}

.windows-start-menu header > svg {
	width: 2.2rem;
	height: 2.2rem;
	color: #39a9ff;
}

.windows-start-menu header > div {
	display: flex;
	flex-direction: column;
}

.windows-start-menu header span {
	color: #b8c2ce;
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
	color: white;
	background: transparent;
	font: inherit;
	text-align: left;
	cursor: pointer;
}

.windows-start-menu button:hover {
	background: rgba(255, 255, 255, 0.12);
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
