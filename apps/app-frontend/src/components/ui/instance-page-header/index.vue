<template>
	<section
		class="eden-hero eden-instance-hero"
		:class="{ 'eden-instance-hero--official': isOfficial }"
		aria-labelledby="eden-instance-title"
	>
		<div class="eden-hero__art" :style="artStyle" aria-hidden="true"></div>
		<div class="eden-hero__scrim" aria-hidden="true"></div>
		<div class="eden-hero__content eden-instance-hero__content">
			<div class="eden-instance-hero__identity">
				<Avatar
					v-if="!isOfficial"
					:src="iconSrc"
					:alt="instance.name"
					size="56px"
					:tint-by="instance.id"
					class="eden-instance-hero__avatar"
				/>
				<div class="min-w-0">
					<p class="eden-eyebrow eden-hero__eyebrow">
						{{ isOfficial ? 'Официальная сборка' : 'Игровая сборка' }}
					</p>
					<h1 id="eden-instance-title" class="eden-instance-hero__title">{{ instance.name }}</h1>
				</div>
			</div>

			<div class="eden-hero__chips eden-instance-hero__meta">
				<span v-if="instance.quarantined" class="eden-hero__chip eden-instance-hero__locked">
					<LockIcon aria-hidden="true" /> Сборка заблокирована
				</span>
				<template v-if="isServerInstance">
					<InstanceHeaderServerMetadata
						:loading-server-ping="loadingServerPing"
						:players-online="playersOnline"
						:status-online="statusOnline"
						:recent-plays="recentPlays"
						:ping="ping"
						:minecraft-server="minecraftServer"
						:linked-project-v3="linkedProjectV3"
						:instance-id="instance.id"
					/>
				</template>
				<template v-else>
					<span class="eden-hero__chip">Minecraft {{ instance.game_version }}</span>
					<span class="eden-hero__chip">{{ loaderLabel }}</span>
					<span v-if="showInstancePlayTime" class="eden-hero__chip">
						<TimerIcon aria-hidden="true" /> {{ playtimeLabel }}
					</span>
				</template>
			</div>

			<div class="eden-hero__actions">
				<button v-if="isInstalling" type="button" class="eden-btn eden-btn--primary" disabled>
					<SpinnerIcon class="animate-spin" />
					{{ formatMessage(commonMessages.installingLabel) }}
				</button>
				<button
					v-else-if="playing"
					type="button"
					class="eden-btn eden-btn--secondary eden-instance-hero__stop"
					:disabled="stopping"
					@click="emit('stop')"
				>
					<StopCircleIcon />
					{{
						stopping ? formatMessage(messages.stopping) : formatMessage(commonMessages.stopButton)
					}}
				</button>
				<button
					v-else-if="instance.quarantined"
					v-tooltip="formatMessage(messages.lockedPlayTooltip)"
					type="button"
					class="eden-btn eden-btn--primary"
					disabled
				>
					<PlayIcon />
					{{ formatMessage(commonMessages.playButton) }}
				</button>
				<button
					v-else-if="instance.install_stage !== 'installed'"
					type="button"
					class="eden-btn eden-btn--primary"
					@click="emit('repair')"
				>
					<DownloadIcon />
					{{ formatMessage(messages.repair) }}
				</button>
				<JoinedButtons
					v-else-if="!loading && isServerInstance"
					:actions="serverPlayActions"
					color="brand"
					size="large"
				/>
				<button
					v-else-if="!loading"
					type="button"
					class="eden-btn eden-btn--primary eden-instance-hero__play"
					@click="emit('play')"
				>
					<PlayIcon />
					{{ formatMessage(commonMessages.playButton) }}
				</button>
				<button
					v-else
					type="button"
					class="eden-btn eden-btn--primary eden-instance-hero__play"
					disabled
				>
					<SpinnerIcon class="animate-spin" />
					{{ formatMessage(messages.starting) }}
				</button>

				<button
					type="button"
					class="eden-btn eden-btn--secondary"
					:aria-label="formatMessage(messages.instanceSettings)"
					@click="emit('settings')"
				>
					<SettingsIcon />
					Настройки
				</button>
				<ButtonStyled circular size="large">
					<TeleportOverflowMenu
						:options="moreActions"
						:tooltip="formatMessage(messages.moreActions)"
						:aria-label="formatMessage(messages.moreActions)"
					>
						<MoreVerticalIcon />
					</TeleportOverflowMenu>
				</ButtonStyled>
			</div>
		</div>
	</section>
</template>

<script setup lang="ts">
import type { Labrinth } from '@modrinth/api-client'
import {
	DownloadIcon,
	ExternalIcon,
	FolderOpenIcon,
	LockIcon,
	MoreVerticalIcon,
	PackageIcon,
	PlayIcon,
	SettingsIcon,
	SpinnerIcon,
	StopCircleIcon,
	TimerIcon,
} from '@modrinth/assets'
import {
	Avatar,
	ButtonStyled,
	commonMessages,
	defineMessages,
	formatLoaderLabel,
	type JoinedButtonAction,
	JoinedButtons,
	type ServerLoader,
	TeleportOverflowMenu,
	type TeleportOverflowMenuItem,
	useVIntl,
} from '@modrinth/ui'
import { computed } from 'vue'

import type { GameInstance } from '@/helpers/types'

import InstanceHeaderServerMetadata from './instance-page-header-server-metadata.vue'

const messages = defineMessages({
	createShortcut: {
		id: 'instance.action.create-shortcut',
		defaultMessage: 'Create shortcut',
	},
	exportModpack: {
		id: 'instance.action.export-modpack',
		defaultMessage: 'Export modpack',
	},
	instanceSettings: {
		id: 'instance.action.settings',
		defaultMessage: 'Instance settings',
	},
	launchInstance: {
		id: 'instance.action.launch-instance',
		defaultMessage: 'Launch instance',
	},
	moreActions: {
		id: 'instance.action.more-actions',
		defaultMessage: 'More actions',
	},
	neverPlayed: {
		id: 'instance.playtime.never-played',
		defaultMessage: 'Never played',
	},
	openFolder: {
		id: 'instance.action.open-folder',
		defaultMessage: 'Open folder',
	},
	repair: {
		id: 'instance.action.repair',
		defaultMessage: 'Repair',
	},
	lockedPlayTooltip: {
		id: 'instance.locked.play-tooltip',
		defaultMessage: 'This instance has been locked',
	},
	starting: {
		id: 'instance.action.starting',
		defaultMessage: 'Starting...',
	},
	stopping: {
		id: 'instance.action.stopping',
		defaultMessage: 'Stopping...',
	},
})

const props = withDefaults(
	defineProps<{
		instance: GameInstance
		iconSrc?: string | null
		isServerInstance?: boolean
		showInstancePlayTime?: boolean
		timePlayed?: number
		playing?: boolean
		loading?: boolean
		stopping?: boolean
		loadingServerPing?: boolean
		playersOnline?: number
		statusOnline?: boolean
		recentPlays?: number
		ping?: number
		minecraftServer?: Labrinth.Projects.v3.Project['minecraft_server']
		linkedProjectV3?: Labrinth.Projects.v3.Project
	}>(),
	{
		iconSrc: null,
		isServerInstance: false,
		showInstancePlayTime: false,
		timePlayed: 0,
		playing: false,
		loading: false,
		stopping: false,
		loadingServerPing: false,
		playersOnline: undefined,
		statusOnline: false,
		recentPlays: undefined,
		ping: undefined,
		minecraftServer: undefined,
		linkedProjectV3: undefined,
	},
)

const emit = defineEmits<{
	repair: []
	stop: []
	play: []
	playServer: []
	settings: []
	openFolder: []
	export: []
	createShortcut: []
}>()

const installingStages = [
	'installing',
	'pack_installing',
	'pack_installed',
	'not_installed',
	'minecraft_installing',
]

const { formatMessage } = useVIntl()

const isInstalling = computed(() => installingStages.includes(props.instance.install_stage))
const loaderDisplayName = computed(() => formatLoaderLabel(props.instance.loader) as ServerLoader)
const loaderLabel = computed(() =>
	[loaderDisplayName.value, props.instance.loader_version].filter(Boolean).join(' '),
)
const playtimeLabel = computed(() => {
	if (props.timePlayed <= 0) return formatMessage(messages.neverPlayed)

	const hours = Math.floor(props.timePlayed / 3600)
	const minutes = Math.floor((props.timePlayed % 3600) / 60)
	if (hours >= 1) return `${hours} ч ${String(minutes).padStart(2, '0')} мин в игре`
	if (minutes >= 1) return `${minutes} мин в игре`
	return 'Меньше минуты в игре'
})
const isOfficial = computed(() => props.instance.name.toLocaleLowerCase().includes('edenworld'))
const artStyle = computed(() => {
	if (isOfficial.value) return undefined
	if (props.iconSrc) {
		return {
			backgroundImage: `url(${JSON.stringify(props.iconSrc)})`,
			backgroundPosition: 'center',
			filter: 'blur(36px) saturate(1.15)',
			transform: 'scale(1.3)',
			opacity: '0.6',
		}
	}
	return { background: 'linear-gradient(120deg, var(--eden-surface-raised), var(--eden-canvas))' }
})
const serverPlayActions = computed<JoinedButtonAction[]>(() => [
	{
		id: 'join_server',
		label: formatMessage(commonMessages.playButton),
		icon: PlayIcon,
		action: () => emit('playServer'),
	},
	{
		id: 'launch_instance',
		label: formatMessage(messages.launchInstance),
		icon: PlayIcon,
		action: () => emit('play'),
	},
])
const moreActions = computed<TeleportOverflowMenuItem[]>(() => {
	const actions: TeleportOverflowMenuItem[] = [
		{
			id: 'open-folder',
			label: formatMessage(messages.openFolder),
			icon: FolderOpenIcon,
			action: () => emit('openFolder'),
		},
	]

	if (!props.instance.quarantined) {
		actions.push(
			{
				id: 'export-mrpack',
				label: formatMessage(messages.exportModpack),
				icon: PackageIcon,
				action: () => emit('export'),
			},
			{
				id: 'create-shortcut',
				label: formatMessage(messages.createShortcut),
				icon: ExternalIcon,
				action: () => emit('createShortcut'),
			},
		)
	}

	return actions
})
</script>

<style scoped lang="scss">
.eden-instance-hero,
.eden-instance-hero .eden-hero__content {
	min-height: 236px;
}

.eden-instance-hero:not(.eden-instance-hero--official) {
	--hero-text: var(--eden-text);
	--hero-text-secondary: var(--eden-text-secondary);
	--hero-chip-bg: var(--eden-surface-raised);
	--hero-scrim: linear-gradient(
		90deg,
		color-mix(in srgb, var(--eden-canvas) 92%, transparent) 0%,
		color-mix(in srgb, var(--eden-canvas) 60%, transparent) 60%,
		color-mix(in srgb, var(--eden-canvas) 30%, transparent) 100%
	);
	background: var(--eden-canvas);
}

.eden-instance-hero__content {
	max-width: 760px;
	padding: 28px 30px;
}

.eden-instance-hero__identity {
	display: flex;
	align-items: center;
	gap: 18px;
}

.eden-instance-hero__avatar {
	flex: 0 0 auto;
	border-radius: 12px;
}

.eden-instance-hero__title {
	margin: 10px 0 0;
	overflow: hidden;
	color: var(--hero-text);
	font-size: clamp(32px, 3.4vw, 44px);
	font-weight: 700;
	line-height: 1.1;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.eden-instance-hero__meta {
	align-items: center;
	margin-top: 16px;

	.eden-hero__chip {
		gap: 6px;
	}

	:deep(svg) {
		width: 14px;
		height: 14px;
	}
}

.eden-instance-hero__locked {
	color: var(--eden-error);
}

.eden-instance-hero__play {
	min-width: 184px;
	justify-content: flex-start;
}

.eden-instance-hero__stop {
	color: var(--eden-error);
}

@media (max-width: 1099px) {
	.eden-instance-hero__content {
		padding: 22px;
	}
}
</style>
