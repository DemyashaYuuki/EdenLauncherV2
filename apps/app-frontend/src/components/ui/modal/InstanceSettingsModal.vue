<script setup lang="ts">
import type { Labrinth } from '@modrinth/api-client'
import { CodeIcon, CoffeeIcon, InfoIcon, MonitorIcon, WrenchIcon } from '@modrinth/assets'
import { defineMessage } from '@modrinth/ui'
import type { PlatformTag } from '@modrinth/utils'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, nextTick, ref, watch } from 'vue'

import EdenTabbedModal from '@/components/ui/eden/EdenTabbedModal.vue'
import type { EdenTab } from '@/components/ui/eden/tabs'
import GeneralSettings from '@/components/ui/instance_settings/GeneralSettings.vue'
import HooksSettings from '@/components/ui/instance_settings/HooksSettings.vue'
import InstallationSettings from '@/components/ui/instance_settings/InstallationSettings.vue'
import JavaSettings from '@/components/ui/instance_settings/JavaSettings.vue'
import WindowSettings from '@/components/ui/instance_settings/WindowSettings.vue'
import { get_project_v3 } from '@/helpers/cache'
import { get_linked_modpack_info } from '@/helpers/instance'
import { get_loader_versions } from '@/helpers/metadata'
import { get_game_versions, get_loaders } from '@/helpers/tags'
import { provideInstanceSettings } from '@/providers/instance-settings'

import type { GameInstance } from '../../../helpers/types'

const queryClient = useQueryClient()

const props = defineProps<{
	instance: GameInstance
	offline?: boolean
}>()
const emit = defineEmits<{
	unlinked: []
}>()

const isMinecraftServer = ref(false)
const handleUnlinked = () => emit('unlinked')

const instanceRef = computed(() => props.instance)
const tabbedModal = ref<InstanceType<typeof EdenTabbedModal> | null>(null)

function hide() {
	tabbedModal.value?.hide()
}

provideInstanceSettings({
	instance: instanceRef,
	offline: props.offline,
	isMinecraftServer,
	onUnlinked: handleUnlinked,
	closeModal: hide,
})

watch(
	() => props.instance,
	(instance) => {
		isMinecraftServer.value = false
		if (instance.link?.project_id) {
			get_project_v3(instance.link.project_id, 'must_revalidate')
				.then((project: Labrinth.Projects.v3.Project | undefined) => {
					if (project?.minecraft_server != null) {
						isMinecraftServer.value = true
					}
				})
				.catch(() => {})
		}
	},
	{ immediate: true },
)

const tabs = computed<EdenTab[]>(() => [
	{
		name: defineMessage({
			id: 'instance.settings.tabs.general',
			defaultMessage: 'General',
		}),
		icon: InfoIcon,
		description: 'Имя, значок и группы сборки',
		edenIcon: 'info',
		content: GeneralSettings,
	},
	{
		name: defineMessage({
			id: 'instance.settings.tabs.installation',
			defaultMessage: 'Installation',
		}),
		icon: WrenchIcon,
		description: 'Версия игры, загрузчик и восстановление',
		edenIcon: 'download',
		content: InstallationSettings,
	},
	{
		name: defineMessage({
			id: 'instance.settings.tabs.window',
			defaultMessage: 'Window',
		}),
		icon: MonitorIcon,
		description: 'Размер окна Minecraft',
		edenIcon: 'monitor',
		content: WindowSettings,
	},
	{
		name: defineMessage({
			id: 'instance.settings.tabs.java',
			defaultMessage: 'Java and memory',
		}),
		icon: CoffeeIcon,
		description: 'Java, память и аргументы запуска',
		edenIcon: 'memory',
		content: JavaSettings,
	},
	{
		name: defineMessage({
			id: 'instance.settings.tabs.hooks',
			defaultMessage: 'Launch hooks',
		}),
		icon: CodeIcon,
		description: 'Команды до запуска, обёртка и после выхода',
		edenIcon: 'code',
		content: HooksSettings,
	},
])

function getSupportedModpackLoaders() {
	return get_loaders().then((value: PlatformTag[]) =>
		value
			.filter((item) => item.supported_project_types.includes('modpack') || item.name === 'vanilla')
			.sort((a, b) => (a.name === 'vanilla' ? -1 : b.name === 'vanilla' ? 1 : 0)),
	)
}

// Preload
useQuery({
	queryKey: ['instance-settings', 'loader-versions', 'fabric'],
	queryFn: () => get_loader_versions('fabric'),
})
useQuery({
	queryKey: ['instance-settings', 'loader-versions', 'forge'],
	queryFn: () => get_loader_versions('forge'),
})
useQuery({
	queryKey: ['instance-settings', 'loader-versions', 'quilt'],
	queryFn: () => get_loader_versions('quilt'),
})
useQuery({
	queryKey: ['instance-settings', 'loader-versions', 'neo'],
	queryFn: () => get_loader_versions('neo'),
})
useQuery({
	queryKey: ['instance-settings', 'game-versions'],
	queryFn: get_game_versions,
})
useQuery({
	queryKey: ['instance-settings', 'loaders', 'modpack'],
	queryFn: getSupportedModpackLoaders,
})
useQuery({
	queryKey: computed(() => ['linkedModpackInfo', props.instance.id]),
	queryFn: () => get_linked_modpack_info(props.instance.id, 'stale_while_revalidate'),
	enabled: computed(() => !!props.instance.link?.project_id && !props.offline),
})

function show(tabIndex?: number) {
	if (props.instance.link?.project_id) {
		queryClient.prefetchQuery({
			queryKey: ['linkedModpackInfo', props.instance.id],
			queryFn: () => get_linked_modpack_info(props.instance.id, 'stale_while_revalidate'),
		})
	}
	tabbedModal.value?.show()
	if (tabIndex !== undefined) {
		nextTick(() => tabbedModal.value?.setTab(tabIndex))
	}
}

defineExpose({ show, hide })
</script>
<template>
	<EdenTabbedModal
		ref="tabbedModal"
		:tabs="tabs"
		title="Настройки сборки"
		:sidebar-caption="instance.name"
		footer-note="Изменения относятся только к этой сборке"
	/>
</template>
