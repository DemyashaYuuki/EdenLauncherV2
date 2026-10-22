<script setup lang="ts">
import { DownloadIcon } from '@modrinth/assets'
import { injectNotificationManager } from '@modrinth/ui'
import { convertFileSrc } from '@tauri-apps/api/core'
import dayjs from 'dayjs'
import { computed, ref } from 'vue'

import EdenIcon from '@/components/ui/eden/EdenIcon.vue'
import {
	type DownloadStage,
	JOB_KIND_LABELS,
	jobPercent,
	jobStage,
	jobTitle,
	PHASE_LABELS,
	useEdenDownloads,
} from '@/composables/eden/downloads'
import {
	formatBytes,
	formatDuration,
	useEdenWorldInstall,
} from '@/composables/eden/edenworld-install'
import { isUpdateInstalling } from '@/helpers/astralrinth/update'
import type { InstallJobSnapshot } from '@/helpers/install'
import { useRootBreadcrumb } from '@/providers/breadcrumbs'
import { injectAppUpdateDownloadProgress } from '@/providers/download-progress.ts'

const { handleError } = injectNotificationManager()
const downloads = useEdenDownloads()
const edenInstall = useEdenWorldInstall()
const launcherUpdate = injectAppUpdateDownloadProgress()

useRootBreadcrumb({
	slot: 'root',
	id: 'downloads',
	label: 'Загрузки',
	to: '/downloads',
	visual: { type: 'icon', component: DownloadIcon },
})

const tab = ref<'active' | 'finished'>('active')
const busyJob = ref<string | null>(null)

const STAGES: {
	id: DownloadStage
	label: string
	icon: 'check' | 'download' | 'shield' | 'play'
}[] = [
	{ id: 'prepare', label: 'Подготовка', icon: 'check' },
	{ id: 'download', label: 'Загрузка файлов', icon: 'download' },
	{ id: 'verify', label: 'Проверка', icon: 'shield' },
	{ id: 'done', label: 'Готово', icon: 'play' },
]
const STAGE_ORDER: DownloadStage[] = ['prepare', 'download', 'verify', 'done']

const showLauncherUpdate = computed(
	() =>
		isUpdateInstalling.value ||
		(launcherUpdate.progress.value > 0 && launcherUpdate.progress.value < 1),
)
const activeTotal = computed(() => downloads.activeCount.value + (showLauncherUpdate.value ? 1 : 0))
const edenStage = computed<DownloadStage>(() =>
	edenInstall.stage.value === 'installing' ? 'verify' : 'download',
)

function stageState(current: DownloadStage, stage: DownloadStage) {
	const currentIndex = STAGE_ORDER.indexOf(current)
	const index = STAGE_ORDER.indexOf(stage)
	if (index < currentIndex || current === 'done') return 'done'
	if (index === currentIndex) return 'current'
	return 'upcoming'
}

function jobIcon(job: InstallJobSnapshot) {
	const icon = job.display?.icon
	if (!icon) return null
	if (/^(https?:|data:|blob:|asset:|tauri:)/.test(icon)) return icon
	return convertFileSrc(icon)
}

function jobProgressText(job: InstallJobSnapshot) {
	const progress = job.progress?.secondary ?? job.progress
	if (!progress || progress.total <= 0) return null
	return `${progress.current} из ${progress.total}`
}

function formatWhen(value?: string | null) {
	if (!value) return ''
	const date = dayjs(value)
	const time = date.format('HH:mm')
	if (date.isSame(dayjs(), 'day')) return `Сегодня, ${time}`
	if (date.isSame(dayjs().subtract(1, 'day'), 'day')) return `Вчера, ${time}`
	return `${date.format('DD.MM.YYYY')}, ${time}`
}

function finishedLabel(job: InstallJobSnapshot) {
	switch (job.status) {
		case 'succeeded':
			return { text: 'Готово', tone: 'success', icon: 'check' as const }
		case 'canceled':
			return { text: 'Отменено', tone: 'muted', icon: 'close' as const }
		default:
			return { text: 'Ошибка', tone: 'error', icon: 'warning' as const }
	}
}

async function runJobAction(job: InstallJobSnapshot, action: 'cancel' | 'retry' | 'dismiss') {
	busyJob.value = job.job_id
	try {
		await downloads[action](job)
	} catch (error) {
		handleError(error as Error)
	} finally {
		busyJob.value = null
	}
}

async function clearFinished() {
	try {
		await downloads.clearFinished()
	} catch (error) {
		handleError(error as Error)
	}
}
</script>

<template>
	<div class="eden-page eden-downloads">
		<header class="eden-page-header">
			<div>
				<h1>Загрузки</h1>
				<p>Установка, обновления и последние действия</p>
			</div>
		</header>

		<div class="eden-tabs" role="tablist" aria-label="Загрузки">
			<button
				type="button"
				role="tab"
				class="eden-tab"
				:aria-selected="tab === 'active'"
				@click="tab = 'active'"
			>
				В процессе <span v-if="activeTotal">{{ activeTotal }}</span>
			</button>
			<button
				type="button"
				role="tab"
				class="eden-tab"
				:aria-selected="tab === 'finished'"
				@click="tab = 'finished'"
			>
				Завершённые
				<span v-if="downloads.finishedJobs.value.length">{{
					downloads.finishedJobs.value.length
				}}</span>
			</button>
		</div>

		<template v-if="tab === 'active'">
			<p v-if="downloads.loadError.value" class="eden-state eden-state--error" role="alert">
				Не удалось получить список загрузок: {{ downloads.loadError.value }}
			</p>

			<!-- Official EdenWorld pack: downloaded by the launcher itself before the install job. -->
			<article v-if="edenInstall.active.value" class="eden-card eden-download">
				<div class="eden-download__main">
					<span class="eden-download__thumb eden-download__thumb--art" aria-hidden="true"></span>
					<div class="eden-download__body">
						<div class="eden-download__title-row">
							<div>
								<p class="eden-eyebrow">Установка сборки</p>
								<h2>{{ edenInstall.instanceName }}</h2>
								<p class="eden-download__phase">
									{{
										edenInstall.stage.value === 'installing'
											? 'Устанавливаем сборку'
											: 'Загружаем архив сборки'
									}}
								</p>
							</div>
							<strong
								v-if="
									edenInstall.stage.value === 'downloading' && edenInstall.percent.value !== null
								"
								class="eden-download__percent"
							>
								{{ edenInstall.percent.value }}%
							</strong>
						</div>
						<div
							class="eden-progress"
							:class="{
								'eden-progress--indeterminate':
									edenInstall.stage.value === 'installing' || edenInstall.percent.value === null,
							}"
							role="progressbar"
							aria-label="Загрузка сборки EdenWorld"
							aria-valuemin="0"
							aria-valuemax="100"
							:aria-valuenow="edenInstall.percent.value ?? undefined"
						>
							<div
								class="eden-progress__bar"
								:style="
									edenInstall.stage.value === 'downloading' && edenInstall.percent.value !== null
										? { width: `${edenInstall.percent.value}%` }
										: undefined
								"
							></div>
						</div>
						<div class="eden-download__meta">
							<span v-if="edenInstall.stage.value === 'downloading'">
								{{ formatBytes(edenInstall.progress.value.downloaded) }}
								<template v-if="edenInstall.progress.value.total">
									из {{ formatBytes(edenInstall.progress.value.total) }}
								</template>
							</span>
							<span v-else>Архив загружен</span>
							<span
								v-if="edenInstall.bytesPerSecond.value && edenInstall.stage.value === 'downloading'"
							>
								{{ formatBytes(edenInstall.bytesPerSecond.value) }}/с
								<template v-if="edenInstall.secondsLeft.value !== null">
									· Осталось около {{ formatDuration(edenInstall.secondsLeft.value) }}
								</template>
							</span>
						</div>
					</div>
				</div>
				<ol class="eden-download__stages" aria-label="Этапы установки">
					<li
						v-for="stage in STAGES"
						:key="stage.id"
						:class="`is-${stageState(edenStage, stage.id)}`"
						:aria-current="stageState(edenStage, stage.id) === 'current' ? 'step' : undefined"
					>
						<EdenIcon
							:name="stageState(edenStage, stage.id) === 'done' ? 'check' : stage.icon"
							:size="18"
						/>
						{{ stage.label }}
					</li>
				</ol>
			</article>

			<article
				v-for="job in downloads.activeJobs.value"
				:key="job.job_id"
				class="eden-card eden-download"
			>
				<div class="eden-download__main">
					<img
						v-if="jobIcon(job)"
						:src="jobIcon(job) ?? undefined"
						alt=""
						class="eden-download__thumb"
					/>
					<span
						v-else
						class="eden-download__thumb eden-download__thumb--art"
						aria-hidden="true"
					></span>
					<div class="eden-download__body">
						<div class="eden-download__title-row">
							<div>
								<p class="eden-eyebrow">{{ JOB_KIND_LABELS[job.kind] }}</p>
								<h2>{{ jobTitle(job) }}</h2>
								<p class="eden-download__phase">
									{{ job.status === 'queued' ? 'В очереди' : PHASE_LABELS[job.phase] }}
								</p>
							</div>
							<strong v-if="jobPercent(job) !== null" class="eden-download__percent">
								{{ jobPercent(job) }}%
							</strong>
						</div>
						<div
							class="eden-progress"
							:class="{ 'eden-progress--indeterminate': jobPercent(job) === null }"
							role="progressbar"
							:aria-label="`Прогресс: ${jobTitle(job)}`"
							aria-valuemin="0"
							aria-valuemax="100"
							:aria-valuenow="jobPercent(job) ?? undefined"
						>
							<div
								class="eden-progress__bar"
								:style="jobPercent(job) !== null ? { width: `${jobPercent(job)}%` } : undefined"
							></div>
						</div>
						<div class="eden-download__meta">
							<span>{{ jobProgressText(job) ?? 'Объём уточняется' }}</span>
							<button
								type="button"
								class="eden-btn eden-btn--secondary eden-btn--compact"
								:disabled="busyJob === job.job_id"
								@click="runJobAction(job, 'cancel')"
							>
								<EdenIcon name="close" :size="16" />
								Отменить
							</button>
						</div>
					</div>
				</div>
				<ol class="eden-download__stages" aria-label="Этапы установки">
					<li
						v-for="stage in STAGES"
						:key="stage.id"
						:class="`is-${stageState(jobStage(job), stage.id)}`"
						:aria-current="stageState(jobStage(job), stage.id) === 'current' ? 'step' : undefined"
					>
						<EdenIcon
							:name="stageState(jobStage(job), stage.id) === 'done' ? 'check' : stage.icon"
							:size="18"
						/>
						{{ stage.label }}
					</li>
				</ol>
			</article>

			<article
				v-for="bar in downloads.bars.value"
				:key="String(bar.loading_bar_uuid ?? bar.id)"
				class="eden-card eden-download eden-download--compact"
			>
				<div class="eden-download__body">
					<div class="eden-download__title-row">
						<div>
							<p class="eden-eyebrow">Фоновая операция</p>
							<h2>
								{{
									bar.title ?? bar.bar_type?.pack_name ?? bar.bar_type?.instance_name ?? 'Загрузка'
								}}
							</h2>
							<p v-if="bar.message" class="eden-download__phase">{{ bar.message }}</p>
						</div>
						<strong v-if="bar.total" class="eden-download__percent">
							{{ Math.round(((bar.current ?? 0) / bar.total) * 100) }}%
						</strong>
					</div>
					<div class="eden-progress" :class="{ 'eden-progress--indeterminate': !bar.total }">
						<div
							class="eden-progress__bar"
							:style="
								bar.total
									? { width: `${Math.round(((bar.current ?? 0) / bar.total) * 100)}%` }
									: undefined
							"
						></div>
					</div>
				</div>
			</article>

			<article v-if="showLauncherUpdate" class="eden-card eden-download eden-download--compact">
				<div class="eden-download__body">
					<div class="eden-download__title-row">
						<div>
							<p class="eden-eyebrow">Обновление лаунчера</p>
							<h2>
								EdenLauncher<template v-if="launcherUpdate.version.value">
									{{ launcherUpdate.version.value }}</template
								>
							</h2>
							<p class="eden-download__phase">Загружаем установщик обновления</p>
						</div>
						<strong v-if="launcherUpdate.progress.value > 0" class="eden-download__percent">
							{{ Math.round(launcherUpdate.progress.value * 100) }}%
						</strong>
					</div>
					<div
						class="eden-progress"
						:class="{ 'eden-progress--indeterminate': !launcherUpdate.progress.value }"
					>
						<div
							class="eden-progress__bar"
							:style="{ width: `${Math.round(launcherUpdate.progress.value * 100)}%` }"
						></div>
					</div>
				</div>
			</article>

			<div v-if="downloads.loaded.value && activeTotal === 0" class="eden-state">
				<span class="eden-state__icon"><EdenIcon name="download" /></span>
				<h3>Сейчас ничего не загружается</h3>
				<p>Установка сборок, моды и обновления лаунчера появятся здесь вместе с прогрессом.</p>
				<RouterLink to="/library" class="eden-btn eden-btn--secondary">
					<EdenIcon name="library" :size="18" /> Открыть библиотеку
				</RouterLink>
			</div>
		</template>

		<section
			v-if="tab === 'finished' || downloads.finishedJobs.value.length"
			class="eden-downloads__history"
			aria-labelledby="eden-history-title"
		>
			<div class="eden-downloads__history-head">
				<h2 id="eden-history-title" class="eden-section-title">Последние действия</h2>
				<button
					v-if="downloads.finishedJobs.value.length"
					type="button"
					class="eden-btn eden-btn--ghost"
					@click="clearFinished"
				>
					Очистить список
				</button>
			</div>
			<p v-if="!downloads.finishedJobs.value.length" class="eden-downloads__empty">
				Завершённых операций пока нет.
			</p>
			<article
				v-for="job in downloads.finishedJobs.value"
				:key="job.job_id"
				class="eden-card eden-history-item"
			>
				<span
					class="eden-icon-tile eden-history-item__icon"
					:class="`eden-history-item__icon--${finishedLabel(job).tone}`"
				>
					<EdenIcon :name="finishedLabel(job).icon" />
				</span>
				<div class="eden-history-item__copy">
					<strong>{{ jobTitle(job) }}</strong>
					<span>
						{{ JOB_KIND_LABELS[job.kind] }} · {{ formatWhen(job.finished ?? job.modified) }}
					</span>
					<span v-if="job.error?.message" class="eden-history-item__error">
						<EdenIcon name="warning" :size="14" /> {{ job.error.message }}
					</span>
				</div>
				<span class="eden-chip" :class="`eden-chip--${finishedLabel(job).tone}`">
					{{ finishedLabel(job).text }}
				</span>
				<div class="eden-history-item__actions">
					<button
						v-if="job.status === 'failed' || job.status === 'interrupted'"
						type="button"
						class="eden-btn eden-btn--secondary eden-btn--compact"
						:disabled="busyJob === job.job_id"
						@click="runJobAction(job, 'retry')"
					>
						<EdenIcon name="refresh" :size="16" /> Повторить
					</button>
					<button
						type="button"
						class="eden-btn eden-btn--ghost eden-btn--icon eden-btn--compact"
						:disabled="busyJob === job.job_id"
						:aria-label="`Убрать «${jobTitle(job)}» из списка`"
						@click="runJobAction(job, 'dismiss')"
					>
						<EdenIcon name="close" :size="16" />
					</button>
				</div>
			</article>
		</section>
	</div>
</template>

<style scoped lang="scss">
.eden-download {
	display: flex;
	flex-direction: column;
	gap: 24px;
	padding: 24px;
}

.eden-download__main {
	display: flex;
	gap: 24px;
}

.eden-download__thumb {
	width: 136px;
	height: 136px;
	flex: 0 0 auto;
	border-radius: 12px;
	background: var(--eden-surface-raised);
	object-fit: cover;
}

.eden-download__thumb--art {
	background: var(--eden-hero-image) 30% 50% / cover no-repeat;
}

.eden-download__body {
	display: flex;
	min-width: 0;
	flex: 1;
	flex-direction: column;
	justify-content: center;
	gap: 14px;
}

.eden-download__title-row {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 16px;

	h2 {
		margin: 8px 0 0;
		color: var(--eden-text);
		font-size: 26px;
		font-weight: 650;
	}
}

.eden-download__phase {
	margin: 10px 0 0;
	color: var(--eden-text-secondary);
	font-size: 14px;
}

.eden-download__percent {
	color: var(--eden-accent-text);
	font-size: 34px;
	font-weight: 650;
	line-height: 1;
}

.eden-download__meta {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	color: var(--eden-text);
	font-size: 13px;

	> span:last-child:not(:first-child) {
		color: var(--eden-text-secondary);
	}
}

.eden-download__stages {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 12px;
	margin: 0;
	padding: 0;
	list-style: none;

	li {
		display: flex;
		align-items: center;
		gap: 12px;
		color: var(--eden-text-secondary);
		font-size: 13px;
	}

	.is-done :deep(.eden-icon) {
		color: var(--eden-success);
	}

	.is-current {
		color: var(--eden-text);
		font-weight: 650;

		:deep(.eden-icon) {
			color: var(--eden-accent-text);
		}
	}
}

.eden-download--compact {
	gap: 0;
	padding: 20px 24px;

	.eden-download__title-row h2 {
		font-size: 19px;
	}

	.eden-download__percent {
		font-size: 24px;
	}
}

.eden-downloads__history {
	display: flex;
	flex-direction: column;
	gap: 14px;
	margin-top: 8px;
}

.eden-downloads__history-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
}

.eden-downloads__empty {
	margin: 0;
	color: var(--eden-text-secondary);
	font-size: 13px;
}

.eden-history-item {
	display: flex;
	align-items: center;
	gap: 18px;
	padding: 18px 22px;
}

.eden-history-item__icon--success {
	color: var(--eden-success);
}

.eden-history-item__icon--error {
	color: var(--eden-error);
}

.eden-history-item__icon--muted {
	color: var(--eden-text-secondary);
}

.eden-history-item__copy {
	display: flex;
	min-width: 0;
	flex: 1;
	flex-direction: column;
	gap: 6px;

	strong {
		color: var(--eden-text);
		font-size: 16px;
		font-weight: 600;
	}

	> span {
		color: var(--eden-text-secondary);
		font-size: 12px;
	}
}

.eden-history-item__error {
	display: flex;
	align-items: center;
	gap: 6px;
	color: var(--eden-error) !important;
}

.eden-history-item__actions {
	display: flex;
	align-items: center;
	gap: 6px;
}

@media (max-width: 1099px) {
	.eden-download__thumb {
		width: 96px;
		height: 96px;
	}

	.eden-download__stages {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}
</style>
