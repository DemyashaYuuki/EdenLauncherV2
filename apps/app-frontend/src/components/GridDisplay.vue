<script setup>
import {
	ClipboardCopyIcon,
	EyeIcon,
	FolderOpenIcon,
	PlayIcon,
	PlusIcon,
	SearchIcon,
	StopCircleIcon,
	TrashIcon,
} from '@modrinth/assets'
import {
	Accordion,
	DropdownSelect,
	formatLoader,
	injectNotificationManager,
	StyledInput,
	useVIntl,
} from '@modrinth/ui'
import { useStorage } from '@vueuse/core'
import dayjs from 'dayjs'
import { computed, inject, ref } from 'vue'

import ContextMenu from '@/components/ui/ContextMenu.vue'
import Instance from '@/components/ui/Instance.vue'
import ConfirmDeleteInstanceModal from '@/components/ui/modal/ConfirmDeleteInstanceModal.vue'
import { install_duplicate_instance } from '@/helpers/install'
import { remove } from '@/helpers/instance'

const { handleError } = injectNotificationManager()

const { formatMessage } = useVIntl()

const props = defineProps({
	instances: {
		type: Array,
		default() {
			return []
		},
	},
	label: {
		type: String,
		default: '',
	},
})
const instanceOptions = ref(null)
const instanceComponents = ref(null)

const currentDeleteInstance = ref(null)
const confirmModal = ref(null)

async function deleteInstance() {
	if (currentDeleteInstance.value) {
		instanceComponents.value = instanceComponents.value.filter(
			(x) => x.instance.id !== currentDeleteInstance.value,
		)
		await remove(currentDeleteInstance.value).catch(handleError)
	}
}

async function duplicateInstance(p) {
	await install_duplicate_instance(p).catch(handleError)
}

const handleRightClick = (event, instanceId) => {
	const item = instanceComponents.value.find((x) => x.instance.id === instanceId)
	const baseOptions = [
		...(item.instance.quarantined ? [] : [{ name: 'add_content' }, { type: 'divider' }]),
		{ name: 'edit' },
		{ name: 'duplicate' },
		{ name: 'open' },
		{ name: 'copy' },
		{ type: 'divider' },
		{
			name: 'delete',
			color: 'danger',
		},
	]

	instanceOptions.value.showMenu(
		event,
		item,
		item.playing
			? [
					{
						name: 'stop',
						color: 'danger',
					},
					...baseOptions,
				]
			: [
					...(item.instance.quarantined
						? []
						: [
								{
									name: 'play',
									color: 'primary',
								},
							]),
					...baseOptions,
				],
	)
}

const handleOptionsClick = async (args) => {
	switch (args.option) {
		case 'play':
			args.item.play(null, 'InstanceGridContextMenu')
			break
		case 'stop':
			args.item.stop(null, 'InstanceGridContextMenu')
			break
		case 'add_content':
			await args.item.addContent()
			break
		case 'edit':
			await args.item.seeInstance()
			break
		case 'duplicate':
			if (args.item.instance.install_stage == 'installed')
				await duplicateInstance(args.item.instance.id)
			break
		case 'open':
			await args.item.openFolder()
			break
		case 'copy':
			await navigator.clipboard.writeText(args.item.instance.id)
			break
		case 'delete':
			currentDeleteInstance.value = args.item.instance.id
			confirmModal.value.show()
			break
	}
}

const state = useStorage(
	`${props.label}-grid-display-state`,
	{
		group: 'Group',
		sortBy: 'Name',
		collapsedGroups: [],
	},
	localStorage,
	{ mergeDefaults: true },
)

// The library page owns the search field; standalone grids keep their own.
const librarySearch = inject('librarySearch', null)
const localSearch = ref('')
const search = librarySearch ?? localSearch
const hasLibrarySearch = librarySearch !== null

const SORT_LABELS = {
	Name: 'По названию',
	'Last played': 'По последнему запуску',
	'Date created': 'По дате создания',
	'Date modified': 'По дате изменения',
	'Game version': 'По версии игры',
}
const GROUP_LABELS = {
	Group: 'По группам',
	Loader: 'По загрузчику',
	'Game version': 'По версии игры',
	None: 'Без группировки',
}
const groupTitle = (key) => (key === 'None' ? 'Без группы' : key)
const collapsedSectionKeys = computed(() => new Set(state.value.collapsedGroups ?? []))

const getSectionKey = (sectionName) => `${state.value.group}:${sectionName}`

const isSectionCollapsed = (sectionName) => {
	return collapsedSectionKeys.value.has(getSectionKey(sectionName))
}

const setSectionCollapsed = (sectionName, collapsed) => {
	const sectionKey = getSectionKey(sectionName)
	const collapsedSections = new Set(state.value.collapsedGroups ?? [])

	if (collapsed) {
		collapsedSections.add(sectionKey)
	} else {
		collapsedSections.delete(sectionKey)
	}

	state.value.collapsedGroups = [...collapsedSections]
}

const filteredResults = computed(() => {
	const { group = 'Group', sortBy = 'Name' } = state.value

	const instances = props.instances.filter((instance) => {
		return instance.name.toLowerCase().includes(search.value.toLowerCase())
	})

	if (sortBy === 'Name') {
		instances.sort((a, b) => {
			return a.name.localeCompare(b.name)
		})
	}

	if (sortBy === 'Game version') {
		instances.sort((a, b) => {
			return a.game_version.localeCompare(b.game_version, undefined, { numeric: true })
		})
	}

	if (sortBy === 'Last played') {
		instances.sort((a, b) => {
			return dayjs(b.last_played ?? 0).diff(dayjs(a.last_played ?? 0))
		})
	}

	if (sortBy === 'Date created') {
		instances.sort((a, b) => {
			return dayjs(b.date_created).diff(dayjs(a.date_created))
		})
	}

	if (sortBy === 'Date modified') {
		instances.sort((a, b) => {
			return dayjs(b.date_modified).diff(dayjs(a.date_modified))
		})
	}

	const instanceMap = new Map()

	if (group === 'Loader') {
		instances.forEach((instance) => {
			const loader = formatLoader(formatMessage, instance.loader)
			if (!instanceMap.has(loader)) {
				instanceMap.set(loader, [])
			}

			instanceMap.get(loader).push(instance)
		})
	} else if (group === 'Game version') {
		instances.forEach((instance) => {
			if (!instanceMap.has(instance.game_version)) {
				instanceMap.set(instance.game_version, [])
			}

			instanceMap.get(instance.game_version).push(instance)
		})
	} else if (group === 'Group') {
		instances.forEach((instance) => {
			if (instance.groups.length === 0) {
				instance.groups.push('None')
			}

			for (const category of instance.groups) {
				if (!instanceMap.has(category)) {
					instanceMap.set(category, [])
				}

				instanceMap.get(category).push(instance)
			}
		})
	} else {
		return instanceMap.set('None', instances)
	}

	// For 'name', we intuitively expect the sorting to apply to the name of the group first, not just the name of the instance
	// ie: Category A should come before B, even if the first instance in B comes before the first instance in A
	if (sortBy === 'Name') {
		const sortedEntries = [...instanceMap.entries()].sort((a, b) => {
			// None should always be first
			if (a[0] === 'None' && b[0] !== 'None') {
				return -1
			}
			if (a[0] !== 'None' && b[0] === 'None') {
				return 1
			}
			return a[0].localeCompare(b[0])
		})
		instanceMap.clear()
		sortedEntries.forEach((entry) => {
			instanceMap.set(entry[0], entry[1])
		})
	}
	// default sorting would do 1.20.4 < 1.8.9 because 2 < 8
	// localeCompare with numeric=true puts 1.8.9 < 1.20.4 because 8 < 20
	if (group === 'Game version') {
		const sortedEntries = [...instanceMap.entries()].sort((a, b) => {
			return a[0].localeCompare(b[0], undefined, { numeric: true })
		})
		instanceMap.clear()
		sortedEntries.forEach((entry) => {
			instanceMap.set(entry[0], entry[1])
		})
	}

	return instanceMap
})
</script>
<template>
	<div class="eden-grid-controls">
		<StyledInput
			v-if="!hasLibrarySearch"
			v-model="localSearch"
			:icon="SearchIcon"
			type="text"
			placeholder="Поиск"
			clearable
			wrapper-class="flex-1"
		/>
		<div v-else class="flex-1"></div>
		<DropdownSelect
			v-slot="{ selected }"
			v-model="state.sortBy"
			name="Сортировка"
			class="eden-grid-controls__select"
			:options="['Name', 'Last played', 'Date created', 'Date modified', 'Game version']"
			:display-name="(option) => SORT_LABELS[option] ?? option"
			placeholder="Выберите…"
		>
			<span class="text-secondary">{{ selected }}</span>
		</DropdownSelect>
		<DropdownSelect
			v-slot="{ selected }"
			v-model="state.group"
			class="eden-grid-controls__select"
			name="Группировка"
			:options="['Group', 'Loader', 'Game version', 'None']"
			:display-name="(option) => GROUP_LABELS[option] ?? option"
			placeholder="Выберите…"
		>
			<span class="text-secondary">{{ selected }}</span>
		</DropdownSelect>
	</div>
	<div
		v-if="
			filteredResults.size === 0 || [...filteredResults.values()].every((list) => list.length === 0)
		"
		class="eden-grid-empty"
	>
		{{ search ? `По запросу «${search}» сборок не найдено.` : 'В этом разделе пока нет сборок.' }}
	</div>
	<Accordion
		v-for="instanceSection in Array.from(filteredResults, ([key, value]) => ({
			key,
			value,
		}))"
		:key="instanceSection.key"
		:divider="instanceSection.key !== 'None'"
		:open-by-default="!isSectionCollapsed(instanceSection.key)"
		class="row"
		@on-open="setSectionCollapsed(instanceSection.key, false)"
		@on-close="setSectionCollapsed(instanceSection.key, true)"
	>
		<template v-if="instanceSection.key !== 'None'" #title>
			<span class="text-base">{{ groupTitle(instanceSection.key) }}</span>
		</template>
		<section class="instances">
			<Instance
				v-for="instance in instanceSection.value"
				ref="instanceComponents"
				:key="instance.id + instance.install_stage"
				:instance="instance"
				@contextmenu.prevent.stop="(event) => handleRightClick(event, instance.id)"
			/>
		</section>
	</Accordion>
	<ConfirmDeleteInstanceModal ref="confirmModal" @delete="deleteInstance" />
	<ContextMenu ref="instanceOptions" @option-clicked="handleOptionsClick">
		<template #play> <PlayIcon /> Играть </template>
		<template #stop> <StopCircleIcon /> Остановить </template>
		<template #add_content> <PlusIcon /> Добавить контент </template>
		<template #edit> <EyeIcon /> Открыть сборку </template>
		<template #duplicate> <ClipboardCopyIcon /> Создать копию</template>
		<template #delete> <TrashIcon /> Удалить </template>
		<template #open> <FolderOpenIcon /> Открыть папку </template>
		<template #copy> <ClipboardCopyIcon /> Скопировать ID </template>
	</ContextMenu>
</template>
<style lang="scss" scoped>
.row {
	width: 100%;
}

.eden-grid-controls {
	display: flex;
	align-items: center;
	gap: 12px;
}

.eden-grid-controls__select {
	max-width: 15rem;
}

.eden-grid-empty {
	padding: 24px;
	border: 1px dashed var(--eden-border);
	border-radius: var(--eden-radius-card);
	color: var(--eden-text-secondary);
	font-size: 13px;
	text-align: center;
}

.instances {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(17.5rem, 1fr));
	width: 100%;
	gap: 22px;
	margin-right: auto;
	scroll-behavior: smooth;
	overflow-y: auto;
}
</style>
