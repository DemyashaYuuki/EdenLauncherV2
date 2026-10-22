<script setup>
import { PlayIcon, SpinnerIcon, StopCircleIcon, TimerIcon } from '@modrinth/assets'
import { Avatar, ButtonStyled, injectNotificationManager, useRelativeTime } from '@modrinth/ui'
import { convertFileSrc } from '@tauri-apps/api/core'
import dayjs from 'dayjs'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import EdenIcon from '@/components/ui/eden/EdenIcon.vue'
import { trackEvent } from '@/helpers/analytics'
import { process_listener } from '@/helpers/events'
import { install_existing_instance, install_pack_to_existing_instance } from '@/helpers/install'
import { kill, run } from '@/helpers/instance'
import { get_by_instance_id } from '@/helpers/process'
import { showInstanceInFolder } from '@/helpers/utils.js'
import { handleSevereError } from '@/store/error.js'

const { handleError } = injectNotificationManager()
const formatRelativeTime = useRelativeTime()

const props = defineProps({
	instance: {
		type: Object,
		default() {
			return {}
		},
	},
	compact: {
		type: Boolean,
		default: false,
	},
	first: {
		type: Boolean,
		default: false,
	},
})

const playing = ref(false)
const loading = ref(false)
const modLoading = computed(
	() =>
		loading.value ||
		currentEvent.value === 'installing' ||
		(currentEvent.value === 'launched' && !playing.value),
)
const installing = computed(() => props.instance.install_stage.includes('installing'))
const installed = computed(() => props.instance.install_stage === 'installed')

const router = useRouter()

const iconSrc = computed(() =>
	props.instance.icon_path ? convertFileSrc(props.instance.icon_path) : null,
)
const isOfficial = computed(() => props.instance.name?.toLocaleLowerCase().includes('edenworld'))
const loaderLabel = computed(() => {
	const loader = props.instance.loader ?? ''
	return loader ? loader.charAt(0).toUpperCase() + loader.slice(1) : 'Minecraft'
})
const cardStatus = computed(() => {
	if (props.instance.quarantined) return { text: 'Недоступна', tone: 'error' }
	if (playing.value) return { text: 'Игра запущена', tone: 'success' }
	if (installing.value) return { text: 'Устанавливается…', tone: 'pending' }
	if (modLoading.value) return { text: 'Запуск…', tone: 'pending' }
	if (!installed.value) return { text: 'Требует установки', tone: 'error' }
	return { text: 'Готова к запуску', tone: 'success' }
})

function openActions(event) {
	const rect = event.currentTarget.getBoundingClientRect()
	event.currentTarget.dispatchEvent(
		new MouseEvent('contextmenu', {
			bubbles: true,
			cancelable: true,
			clientX: rect.left,
			clientY: rect.bottom + 4,
		}),
	)
}

const seeInstance = async () => {
	await router.push(`/instance/${encodeURIComponent(props.instance.id)}`)
}

const checkProcess = async () => {
	const runningProcesses = await get_by_instance_id(props.instance.id).catch(handleError)

	playing.value = runningProcesses.length > 0
}

const play = async (e, context) => {
	e?.stopPropagation()
	if (props.instance.quarantined) return
	loading.value = true
	await run(props.instance.id)
		.catch((err) => handleSevereError(err, { instanceId: props.instance.id }))
		.finally(() => {
			trackEvent('InstanceStart', {
				loader: props.instance.loader,
				game_version: props.instance.game_version,
				source: context,
			})
		})
	loading.value = false
}

const stop = async (e, context) => {
	e?.stopPropagation()
	playing.value = false

	await kill(props.instance.id).catch(handleError)

	trackEvent('InstanceStop', {
		loader: props.instance.loader,
		game_version: props.instance.game_version,
		source: context,
	})
}

const repair = async (e) => {
	e?.stopPropagation()
	if (props.instance.quarantined) return

	if (
		props.instance.install_stage !== 'pack_installed' &&
		(props.instance.link?.type === 'modrinth_modpack' ||
			props.instance.link?.type === 'server_project_modpack')
	) {
		await install_pack_to_existing_instance(props.instance.id, {
			type: 'fromVersionId',
			project_id: props.instance.link.project_id ?? props.instance.link.server_project_id ?? '',
			version_id: props.instance.link.version_id ?? props.instance.link.content_version_id ?? '',
			title: props.instance.name,
		}).catch(handleError)
	} else {
		await install_existing_instance(props.instance.id, false).catch(handleError)
	}
}

const openFolder = async () => {
	await showInstanceInFolder(props.instance.id)
}

const addContent = async () => {
	if (props.instance.quarantined) return
	await router.push({
		path: `/browse/${props.instance.loader === 'vanilla' ? 'datapack' : 'mod'}`,
		query: { i: props.instance.id },
	})
}

defineExpose({
	play,
	stop,
	seeInstance,
	openFolder,
	addContent,
	instance: props.instance,
})

const currentEvent = ref(null)

const unlisten = await process_listener((e) => {
	if (e.instance_id === props.instance.id) {
		currentEvent.value = e.event
		if (e.event === 'finished') {
			playing.value = false
		}
	}
})

onMounted(() => {
	checkProcess()
})
onUnmounted(() => unlisten())
</script>

<template>
	<template v-if="compact">
		<div
			class="card-shadow grid grid-cols-[auto_1fr_auto] bg-bg-raised rounded-xl p-3 pl-4 gap-2 cursor-pointer hover:brightness-90 transition-all"
			@click="seeInstance"
			@mouseenter="checkProcess"
		>
			<Avatar
				size="48px"
				:src="instance.icon_path ? convertFileSrc(instance.icon_path) : null"
				:tint-by="instance.id"
				alt="Mod card"
			/>
			<div class="h-full flex items-center font-bold text-contrast leading-normal">
				<span class="line-clamp-2">{{ instance.name }}</span>
			</div>
			<div class="flex items-center">
				<ButtonStyled v-if="playing" color="red" circular @mousehover="checkProcess">
					<button v-tooltip="'Stop'" @click="(e) => stop(e, 'InstanceCard')">
						<StopCircleIcon />
					</button>
				</ButtonStyled>
				<ButtonStyled v-else-if="modLoading" color="standard" circular>
					<button v-tooltip="'Instance is loading...'" disabled>
						<SpinnerIcon class="animate-spin" />
					</button>
				</ButtonStyled>
				<ButtonStyled
					v-else-if="!instance.quarantined"
					:color="first ? 'brand' : 'standard'"
					circular
				>
					<button
						v-tooltip="'Play'"
						@click="(e) => play(e, 'InstanceCard')"
						@mousehover="checkProcess"
					>
						<!-- Translate for optical centering -->
						<PlayIcon class="translate-x-[1px]" />
					</button>
				</ButtonStyled>
			</div>
			<div class="flex items-center col-span-3 gap-1 text-secondary font-semibold">
				<TimerIcon />
				<span class="text-sm">
					<template v-if="instance.last_played">
						Played {{ formatRelativeTime(dayjs(instance.last_played).toISOString()) }}
					</template>
					<template v-else> Never played </template>
				</span>
			</div>
		</div>
	</template>
	<article
		v-else
		class="eden-instance-card"
		:class="{ 'eden-instance-card--official': isOfficial }"
		tabindex="0"
		:aria-label="`Сборка ${instance.name}`"
		@click="seeInstance"
		@keydown.enter.self="seeInstance"
		@mouseenter="checkProcess"
	>
		<div class="eden-instance-card__cover" aria-hidden="true">
			<template v-if="isOfficial">
				<span class="eden-instance-card__tag">EdenWorld</span>
			</template>
			<template v-else>
				<img v-if="iconSrc" :src="iconSrc" alt="" class="eden-instance-card__cover-blur" />
				<Avatar
					size="72px"
					:src="iconSrc"
					:tint-by="instance.id"
					alt=""
					class="eden-instance-card__icon"
				/>
			</template>
		</div>
		<div class="eden-instance-card__body">
			<h3>{{ instance.name }}</h3>
			<p>
				{{ instance.game_version }} / {{ loaderLabel
				}}<template v-if="isOfficial"> / Официальная</template>
			</p>
			<span
				class="eden-status"
				:class="{
					'eden-status--success': cardStatus.tone === 'success',
					'eden-status--error': cardStatus.tone === 'error',
					'eden-status--pending': cardStatus.tone === 'pending',
				}"
			>
				<span class="eden-status-dot"></span>
				{{ cardStatus.text }}
			</span>
			<div class="eden-instance-card__actions">
				<button
					v-if="playing"
					type="button"
					class="eden-btn eden-btn--secondary eden-btn--compact eden-instance-card__main"
					@click.stop="(e) => stop(e, 'InstanceCard')"
				>
					<EdenIcon name="close" :size="16" />
					Остановить
				</button>
				<button
					v-else-if="modLoading || installing"
					type="button"
					class="eden-btn eden-btn--primary eden-btn--compact eden-instance-card__main"
					disabled
				>
					<SpinnerIcon class="animate-spin" />
					{{ installing ? 'Установка…' : 'Запуск…' }}
				</button>
				<button
					v-else-if="!installed && !instance.quarantined"
					type="button"
					class="eden-btn eden-btn--secondary eden-btn--compact eden-instance-card__main"
					@click.stop="(e) => repair(e)"
				>
					<EdenIcon name="download" :size="16" />
					Восстановить
				</button>
				<button
					v-else
					type="button"
					class="eden-btn eden-btn--primary eden-btn--compact eden-instance-card__main"
					:disabled="instance.quarantined"
					@click.stop="(e) => play(e, 'InstanceCard')"
				>
					<EdenIcon name="play" :size="16" />
					Играть
				</button>
				<button
					type="button"
					class="eden-btn eden-btn--ghost eden-btn--icon eden-btn--compact"
					:aria-label="`Действия со сборкой ${instance.name}`"
					@click.stop="openActions"
				>
					<EdenIcon name="more" :size="18" />
				</button>
			</div>
		</div>
	</article>
</template>

<style scoped lang="scss">
.eden-instance-card {
	display: flex;
	min-width: 0;
	flex-direction: column;
	overflow: hidden;
	border: 1px solid var(--eden-border);
	border-radius: var(--eden-radius-card);
	color: var(--eden-text);
	background: var(--eden-surface);
	cursor: pointer;
	transition: border-color var(--eden-motion-hover) ease;

	&:hover {
		border-color: var(--eden-border-strong);
	}

	&:focus-visible {
		outline: 2px solid var(--eden-focus);
		outline-offset: 3px;
	}
}

.eden-instance-card__cover {
	position: relative;
	display: grid;
	height: 138px;
	overflow: hidden;
	place-items: center;
	background: linear-gradient(135deg, var(--eden-surface-raised), var(--eden-canvas));

	.eden-instance-card--official & {
		place-items: start;
		background: var(--eden-hero-image) 70% 45% / cover no-repeat;
	}
}

.eden-instance-card__cover-blur {
	position: absolute;
	inset: -20px;
	width: calc(100% + 40px);
	height: calc(100% + 40px);
	object-fit: cover;
	filter: blur(22px) saturate(1.1);
	opacity: 0.55;
}

.eden-instance-card__icon {
	position: relative;
	border-radius: 14px;
	box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

.eden-instance-card__tag {
	margin: 14px;
	padding: 5px 12px;
	border-radius: 6px;
	color: #f5f3fa;
	background: rgba(20, 19, 29, 0.82);
	font-size: 12px;
	font-weight: 600;
	letter-spacing: 0.04em;
	text-transform: uppercase;
}

.eden-instance-card__body {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 16px 18px 12px;

	h3 {
		margin: 0;
		overflow: hidden;
		color: var(--eden-text);
		font-size: 19px;
		font-weight: 650;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	p {
		margin: 0;
		color: var(--eden-text-secondary);
		font-size: 12px;
	}
}

.eden-instance-card__actions {
	display: flex;
	align-items: center;
	gap: 10px;
	margin-top: 8px;
}

.eden-instance-card__main {
	flex: 1;
	justify-content: flex-start;
	min-height: 32px;
	padding: 0 14px;
}
</style>
