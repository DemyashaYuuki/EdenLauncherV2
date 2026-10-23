<script setup lang="ts">
import {
	BadgeCheckIcon,
	CoffeeIcon,
	DownloadIcon,
	GameIcon,
	GaugeIcon,
	LanguagesIcon,
	PaintbrushIcon,
	RefreshCwIcon,
	Settings2Icon,
	SpinnerIcon,
	ToggleRightIcon,
} from '@modrinth/assets'
import {
	commonMessages,
	defineMessage,
	defineMessages,
	ProgressBar,
	UnsavedChangesPopup,
	useVIntl,
} from '@modrinth/ui'
import { getVersion } from '@tauri-apps/api/app'
import { platform as getOsPlatform, version as getOsVersion } from '@tauri-apps/plugin-os'
import { computed, inject, provide, type Ref, ref, watch } from 'vue'

import LauncherUpdateModal from '@/components/ui/astralrinth/LauncherUpdateModal.vue'
import EdenIcon from '@/components/ui/eden/EdenIcon.vue'
import EdenTabbedModal from '@/components/ui/eden/EdenTabbedModal.vue'
import type { EdenTab } from '@/components/ui/eden/tabs'
import ProfileSettings from '@/components/ui/settings/account/ProfileSettings.vue'
import ExternalAuthLibrarySettings from '@/components/ui/settings/astralrinth/ExternalAuthLibrarySettings.vue'
import UpdateSettings from '@/components/ui/settings/astralrinth/UpdateSettings.vue'
import AppearanceSettings from '@/components/ui/settings/display/AppearanceSettings.vue'
import BehaviorSettings from '@/components/ui/settings/display/BehaviorSettings.vue'
import FeatureFlagSettings from '@/components/ui/settings/display/FeatureFlagSettings.vue'
import LanguageSettings from '@/components/ui/settings/display/LanguageSettings.vue'
import AboutSettings from '@/components/ui/settings/eden/AboutSettings.vue'
import DefaultInstanceSettings from '@/components/ui/settings/instances/DefaultInstanceSettings.vue'
import JavaSettings from '@/components/ui/settings/instances/JavaSettings.vue'
import ResourceManagementSettings from '@/components/ui/settings/instances/ResourceManagementSettings.vue'
import {
	isUpdateAvailable,
	isUpdateInstalling,
	latestLauncherReleases,
} from '@/helpers/astralrinth/update'
import type { ModrinthCredentials } from '@/helpers/mr_auth'
import { get, set } from '@/helpers/settings.ts'
import {
	appSettingsModalContextKey,
	type UnsavedChangesController,
} from '@/providers/app-settings-modal'
import { injectAppUpdateDownloadProgress } from '@/providers/download-progress.ts'
import { useTheming } from '@/store/state'

// TODO: Apply COMPONENT_STRUCTURE.md here and extract out common setting option components
const themeStore = useTheming()
const { formatMessage } = useVIntl()

const devModeCounter = ref(0)
const launcherUpdateModal = ref<InstanceType<typeof LauncherUpdateModal> | null>(null)

const developerModeEnabled = defineMessage({
	id: 'app.settings.developer-mode-enabled',
	defaultMessage: 'Developer mode enabled.',
})

const tabCategories = defineMessages({
	appearance: {
		id: 'edenlauncher.app.settings.sidebar.label.appearance',
		defaultMessage: 'Оформление',
	},
	game: {
		id: 'edenlauncher.app.settings.sidebar.label.game',
		defaultMessage: 'Игра',
	},
	edenlauncher: {
		id: 'edenlauncher.app.settings.sidebar.label.edenlauncher',
		defaultMessage: 'EdenLauncher',
	},
	profile: {
		id: 'edenlauncher.app.settings.sidebar.label.profile',
		defaultMessage: 'Мой профиль',
	},
})

const credentials = inject<Ref<
	(ModrinthCredentials & { user?: unknown }) | null | undefined
> | null>('modrinthCredentials', null)
const signedInToModrinth = computed(() => !!credentials?.value?.user)

const tabs: EdenTab[] = [
	{
		name: defineMessage({
			id: 'edenlauncher.app.settings.tabs.appearance',
			defaultMessage: 'Оформление',
		}),
		category: tabCategories.appearance,
		description: 'Атмосфера, цвета и визуальные эффекты',
		icon: PaintbrushIcon,
		edenIcon: 'image',
		content: AppearanceSettings,
	},
	{
		name: defineMessage({
			id: 'edenlauncher.app.settings.tabs.behavior',
			defaultMessage: 'Поведение',
		}),
		category: tabCategories.appearance,
		description: 'Запуск, навигация и привычные действия',
		icon: Settings2Icon,
		edenIcon: 'sliders',
		content: BehaviorSettings,
	},
	{
		name: defineMessage({ id: 'edenlauncher.app.settings.tabs.language', defaultMessage: 'Язык' }),
		category: tabCategories.appearance,
		description: 'Язык интерфейса лаунчера',
		icon: LanguagesIcon,
		edenIcon: 'language',
		content: LanguageSettings,
		badge: commonMessages.beta,
	},
	{
		name: defineMessage({
			id: 'edenlauncher.app.settings.tabs.game',
			defaultMessage: 'Параметры игры',
		}),
		category: tabCategories.game,
		description: 'Окно, память и аргументы запуска по умолчанию для сборок',
		icon: GameIcon,
		edenIcon: 'play',
		content: DefaultInstanceSettings,
	},
	{
		name: defineMessage({ id: 'edenlauncher.app.settings.tabs.java', defaultMessage: 'Java' }),
		category: tabCategories.game,
		description: 'Установленные версии Java для разных версий Minecraft',
		icon: CoffeeIcon,
		edenIcon: 'java',
		content: JavaSettings,
	},
	{
		name: defineMessage({
			id: 'edenlauncher.app.settings.tabs.resources',
			defaultMessage: 'Ресурсы',
		}),
		category: tabCategories.game,
		description: 'Папка приложения, параллельные загрузки и кэш',
		icon: GaugeIcon,
		edenIcon: 'disk',
		content: ResourceManagementSettings,
	},
	{
		name: defineMessage({
			id: 'edenlauncher.app.settings.tabs.auth-libraries',
			defaultMessage: 'Библиотеки входа',
		}),
		category: tabCategories.edenlauncher,
		description: 'Библиотеки для входа через внешние сервисы, например Ely.by',
		icon: DownloadIcon,
		edenIcon: 'key',
		content: ExternalAuthLibrarySettings,
	},
	{
		name: defineMessage({
			id: 'edenlauncher.app.settings.tabs.updates',
			defaultMessage: 'Обновления',
		}),
		category: tabCategories.edenlauncher,
		description: 'Проверка и установка новых версий EdenLauncher',
		icon: RefreshCwIcon,
		edenIcon: 'refresh',
		content: UpdateSettings,
	},
	{
		name: defineMessage({
			id: 'edenlauncher.app.settings.tabs.about',
			defaultMessage: 'О лаунчере',
		}),
		category: tabCategories.edenlauncher,
		description: 'EdenWorld и сообщество проекта',
		icon: BadgeCheckIcon,
		edenIcon: 'info',
		content: AboutSettings,
	},
	{
		name: defineMessage({
			id: 'edenlauncher.app.settings.tabs.advanced',
			defaultMessage: 'Расширенные',
		}),
		category: tabCategories.edenlauncher,
		description: 'Дополнительные параметры для опытных пользователей',
		icon: ToggleRightIcon,
		edenIcon: 'code',
		content: FeatureFlagSettings,
		developerOnly: true,
	},
	{
		name: defineMessage({
			id: 'edenlauncher.app.settings.tabs.profile',
			defaultMessage: 'Профиль',
		}),
		category: tabCategories.profile,
		description: 'Профиль Modrinth для друзей и сообщества',
		icon: Settings2Icon,
		edenIcon: 'user',
		content: ProfileSettings,
	},
]

const availableTabs = computed(() =>
	tabs.filter(
		(tab) =>
			(!tab.developerOnly || themeStore.devMode) &&
			(tab.content !== ProfileSettings || signedInToModrinth.value),
	),
)

const modal = ref<InstanceType<typeof EdenTabbedModal> | null>(null)
const unsavedChangesPopup = ref<{ nudge: () => void } | null>(null)
const unsavedChangesController = ref<UnsavedChangesController | null>(null)
const emptyUnsavedChangesState: Record<string, unknown> = {}
const originalUnsavedChangesState = computed(
	() => unsavedChangesController.value?.getOriginal() ?? emptyUnsavedChangesState,
)
const modifiedUnsavedChangesState = computed(
	() => unsavedChangesController.value?.getModified() ?? emptyUnsavedChangesState,
)
const savingUnsavedChanges = computed(() => unsavedChangesController.value?.isSaving() ?? false)
const hasUnsavedChanges = computed(() => unsavedChangesController.value?.hasChanges() ?? false)

function canLeaveCurrentTab(): boolean {
	if (!unsavedChangesController.value?.hasChanges()) return true
	unsavedChangesPopup.value?.nudge()
	return false
}

function close(): boolean {
	return modal.value?.hide() ?? false
}

function registerUnsavedChangesController(controller: UnsavedChangesController | null): void {
	unsavedChangesController.value = controller
}

provide(appSettingsModalContextKey, {
	close,
	registerUnsavedChangesController,
})

function resetUnsavedChanges(): void {
	unsavedChangesController.value?.reset()
}

function saveUnsavedChanges(): void {
	void unsavedChangesController.value?.save()
}

function show() {
	modal.value?.show()
}

function showUpdateModal() {
	modal.value?.show()
	void launcherUpdateModal.value?.show()
}

defineExpose({ show, showUpdateModal })

const { progress, version: downloadingVersion } = injectAppUpdateDownloadProgress()

const version = await getVersion()
const osPlatform = getOsPlatform()
const osVersion = getOsVersion()
const settings = ref(await get())

watch(
	settings,
	async () => {
		await set(settings.value)
	},
	{ deep: true },
)

function devModeCount() {
	devModeCounter.value++
	if (devModeCounter.value > 5) {
		const selectedTab = modal.value ? availableTabs.value[modal.value.selectedTab] : undefined

		themeStore.devMode = !themeStore.devMode
		settings.value.developer_mode = !!themeStore.devMode
		devModeCounter.value = 0

		if (modal.value) {
			const selectedTabIndex = selectedTab ? availableTabs.value.indexOf(selectedTab) : -1
			modal.value.setTab(selectedTabIndex >= 0 ? selectedTabIndex : 0)
		}
	}
}

const messages = defineMessages({
	downloading: {
		id: 'app.settings.downloading',
		defaultMessage: 'Downloading v{version}',
	},
	updateInstalling: {
		id: 'edenlauncher.app.settings.update-installing',
		defaultMessage: 'Установка обновления…',
	},
	updatesInstalled: {
		id: 'edenlauncher.app.settings.updates-installed',
		defaultMessage: 'Установлена последняя версия',
	},
	viewUpdateInfo: {
		id: 'edenlauncher.app.settings.view-update-info',
		defaultMessage: 'Открыть сведения об обновлении',
	},
	appVersion: {
		id: 'app.settings.app-version',
		defaultMessage: 'EdenLauncher {version}',
	},
	macos: {
		id: 'app.settings.operating-system.macos',
		defaultMessage: 'macOS',
	},
	developerModeButtonLabel: {
		id: 'app.settings.developer-mode-button.label',
		defaultMessage: 'Toggle developer mode',
	},
})
</script>

<template>
	<EdenTabbedModal
		ref="modal"
		:tabs="availableTabs"
		:title="formatMessage(commonMessages.settingsLabel)"
		:before-hide="canLeaveCurrentTab"
		:before-tab-change="canLeaveCurrentTab"
		:floating-action-bar-shown="hasUnsavedChanges"
	>
		<template #floating-action-bar>
			<UnsavedChangesPopup
				ref="unsavedChangesPopup"
				:original="originalUnsavedChangesState"
				:modified="modifiedUnsavedChangesState"
				:saving="savingUnsavedChanges"
				inline
				@reset="resetUnsavedChanges"
				@save="saveUnsavedChanges"
			/>
		</template>
		<template #footer>
			<div class="eden-settings-footer">
				<template v-if="progress > 0 && progress < 1">
					<p>{{ formatMessage(messages.downloading, { version: downloadingVersion }) }}</p>
					<ProgressBar :progress="progress" />
				</template>
				<p v-if="themeStore.devMode" class="eden-settings-footer__dev">
					{{ formatMessage(developerModeEnabled) }}
				</p>
				<div class="eden-settings-footer__row">
					<button
						type="button"
						class="eden-settings-footer__version"
						:aria-label="formatMessage(messages.developerModeButtonLabel)"
						@click="devModeCount"
					>
						{{ formatMessage(messages.appVersion, { version }) }}
					</button>
					<button
						v-if="isUpdateAvailable"
						v-tooltip="
							formatMessage(
								isUpdateInstalling ? messages.updateInstalling : messages.viewUpdateInfo,
							)
						"
						type="button"
						class="eden-settings-footer__update"
						:disabled="isUpdateInstalling"
						:aria-label="formatMessage(messages.viewUpdateInfo)"
						@click="showUpdateModal()"
					>
						<SpinnerIcon v-if="isUpdateInstalling" class="animate-spin" />
						<EdenIcon v-else name="download" :size="16" />
					</button>
					<BadgeCheckIcon
						v-else-if="latestLauncherReleases"
						v-tooltip.top="formatMessage(messages.updatesInstalled)"
						class="eden-settings-footer__ok"
					/>
				</div>
				<p class="eden-settings-footer__os">
					<span v-if="osPlatform === 'macos'">{{ formatMessage(messages.macos) }}</span>
					<span v-else class="capitalize">{{ osPlatform }}</span>
					{{ osVersion }}
				</p>
			</div>
		</template>
	</EdenTabbedModal>

	<LauncherUpdateModal ref="launcherUpdateModal" :version="version" />
</template>

<style lang="scss" scoped>
.eden-settings-footer {
	display: flex;
	flex-direction: column;
	gap: 6px;

	p {
		margin: 0;
	}
}

.eden-settings-footer__dev {
	color: var(--eden-accent-text);
	font-weight: 600;
}

.eden-settings-footer__row {
	display: flex;
	align-items: center;
	gap: 8px;
}

.eden-settings-footer__version {
	padding: 0;
	border: 0;
	color: var(--eden-text-secondary);
	background: transparent;
	font: inherit;
	cursor: default;
}

.eden-settings-footer__update {
	display: grid;
	width: 26px;
	height: 26px;
	place-items: center;
	padding: 0;
	border: 0;
	border-radius: 6px;
	color: var(--eden-on-accent);
	background: var(--eden-accent);
	cursor: pointer;

	svg {
		width: 16px;
		height: 16px;
	}
}

.eden-settings-footer__ok {
	width: 16px;
	height: 16px;
	color: var(--eden-success);
}

.eden-settings-footer__os {
	opacity: 0.8;
}
</style>
