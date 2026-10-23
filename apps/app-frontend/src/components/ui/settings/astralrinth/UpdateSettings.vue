<script setup lang="ts">
import { BadgeCheckIcon, DownloadIcon, RefreshCwIcon } from '@modrinth/assets'
import { getVersion } from '@tauri-apps/api/app'
import { computed, onMounted, ref } from 'vue'

import EdenLauncherSettingsPage from '@/components/ui/settings/astralrinth/EdenLauncherSettingsPage.vue'
import {
	downloadLatestRelease,
	fetchRemote,
	getPreferredInstaller,
	isUpdateAvailable,
	isUpdateInstalling,
	latestLauncherReleaseHttpStatus,
	latestLauncherReleases,
	LAUNCHER_LATEST_RELEASE_API,
} from '@/helpers/astralrinth/update'
import { get, set } from '@/helpers/settings'

const settings = ref(await get())
const currentVersion = await getVersion()
const checking = ref(false)
const autoUpdates = computed({
	get: () => settings.value.auto_download_updates !== false,
	set: async (enabled: boolean) => {
		settings.value.auto_download_updates = enabled
		await set(settings.value)
	},
})

const releaseTag = computed(() => latestLauncherReleases.value?.tag_name ?? 'Нет данных')
const releaseTitle = computed(() => latestLauncherReleases.value?.name ?? 'Нет данных')
const status = computed(() => latestLauncherReleaseHttpStatus.value?.toString() ?? '—')

async function checkNow() {
	checking.value = true
	try {
		await fetchRemote()
	} finally {
		checking.value = false
	}
}

async function installNow() {
	const installer = getPreferredInstaller()
	if (installer) await downloadLatestRelease(installer)
}

onMounted(() => void checkNow())
</script>

<template>
	<EdenLauncherSettingsPage
		title="Обновления"
		description="Проверка и автоматическая установка новых версий EdenLauncher из официального репозитория GitHub."
	>
		<div class="space-y-4">
			<label class="update-option">
				<input v-model="autoUpdates" type="checkbox" />
				<span class="update-switch"><span></span></span>
				<span>
					<strong>Автоматическое обновление</strong>
					<small>
						Проверять GitHub при запуске и каждые 30 минут, затем автоматически запускать
						проверенный установщик.
					</small>
				</span>
			</label>

			<section class="update-card">
				<div class="update-card__header">
					<div class="update-card__icon">
						<RefreshCwIcon :class="{ 'animate-spin': checking }" />
					</div>
					<div>
						<h2>Канал GitHub Releases</h2>
						<p>
							Текущая версия: <strong>v{{ currentVersion }}</strong>
						</p>
					</div>
				</div>

				<dl>
					<div>
						<dt>Последний релиз</dt>
						<dd>{{ releaseTag }}</dd>
					</div>
					<div>
						<dt>Название</dt>
						<dd>{{ releaseTitle }}</dd>
					</div>
					<div>
						<dt>Статус API</dt>
						<dd>{{ status }}</dd>
					</div>
				</dl>

				<div class="update-actions">
					<button :disabled="checking || isUpdateInstalling" @click="checkNow">
						<RefreshCwIcon /> Проверить сейчас
					</button>
					<button
						v-if="isUpdateAvailable"
						class="primary"
						:disabled="isUpdateInstalling"
						@click="installNow"
					>
						<DownloadIcon /> {{ isUpdateInstalling ? 'Установка…' : 'Установить обновление' }}
					</button>
					<span v-else-if="latestLauncherReleases" class="up-to-date">
						<BadgeCheckIcon /> Установлена последняя версия
					</span>
				</div>
			</section>

			<a
				class="api-link"
				:href="LAUNCHER_LATEST_RELEASE_API"
				target="_blank"
				rel="noopener noreferrer"
			>
				{{ LAUNCHER_LATEST_RELEASE_API }}
			</a>
		</div>
	</EdenLauncherSettingsPage>
</template>

<style scoped lang="scss">
.update-option,
.update-card {
	border: 1px solid var(--eden-border);
	border-radius: 14px;
	background: var(--eden-surface);
}

.update-option {
	position: relative;
	display: flex;
	align-items: flex-start;
	gap: 1rem;
	padding: 18px 20px;
	cursor: pointer;

	&:focus-within {
		outline: 2px solid var(--eden-focus);
		outline-offset: 3px;
	}

	input {
		position: absolute;
		opacity: 0;
	}

	strong,
	small {
		display: block;
	}

	strong {
		color: var(--eden-text);
		font-size: 16px;
		font-weight: 650;
	}

	small {
		margin-top: 0.35rem;
		color: var(--eden-text-secondary);
		font-size: 13px;
		line-height: 1.5;
	}
}

.update-switch {
	width: 44px;
	height: 24px;
	flex: none;
	order: 2;
	margin-left: auto;
	padding: 3px;
	box-sizing: border-box;
	border-radius: 999px;
	background: var(--eden-border);
	transition: background-color var(--eden-motion-hover) ease;

	span {
		display: block;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: var(--eden-text-secondary);
		transition: transform var(--eden-motion-hover) ease;
	}
}

.update-option input:checked + .update-switch {
	background: var(--eden-accent);

	span {
		background: var(--eden-on-accent);
		transform: translateX(20px);
	}
}

.update-card {
	padding: 20px;
}

.update-card__header {
	display: flex;
	align-items: center;
	gap: 0.9rem;
}

.update-card__icon {
	display: grid;
	width: 42px;
	height: 42px;
	place-items: center;
	border-radius: 10px;
	color: var(--eden-accent-text);
	background: var(--eden-surface-raised);

	:deep(svg) {
		width: 21px;
	}
}

.update-card h2,
.update-card p {
	margin: 0;
}

.update-card h2 {
	color: var(--eden-text);
	font-size: 16px;
	font-weight: 650;
}

.update-card p {
	margin-top: 0.2rem;
	color: var(--eden-text-secondary);
	font-size: 13px;
}

.update-card dl {
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: 10px;
	margin: 16px 0;

	div {
		min-width: 0;
		padding: 12px;
		border-radius: 10px;
		background: var(--eden-surface-raised);
	}
}

.update-card dt {
	color: var(--eden-text-secondary);
	font-size: 11px;
	font-weight: 700;
	letter-spacing: 0.12em;
	text-transform: uppercase;
}

.update-card dd {
	margin: 0.35rem 0 0;
	overflow: hidden;
	color: var(--eden-text);
	font-weight: 650;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.update-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.75rem;

	button {
		display: inline-flex;
		min-height: 40px;
		align-items: center;
		gap: 0.45rem;
		padding: 0 16px;
		border: 1px solid var(--eden-border);
		border-radius: var(--eden-radius-control);
		color: var(--eden-text);
		background: var(--eden-surface-raised);
		font: inherit;
		font-size: 13px;
		font-weight: 650;
		cursor: pointer;

		&:hover:not(:disabled) {
			border-color: var(--eden-border-strong);
		}

		&.primary {
			border-color: transparent;
			color: var(--eden-on-accent);
			background: var(--eden-accent);
		}

		&:disabled {
			cursor: wait;
			opacity: 0.55;
		}

		&:focus-visible {
			outline: 2px solid var(--eden-focus);
			outline-offset: 3px;
		}
	}

	:deep(svg) {
		width: 18px;
	}
}

.up-to-date {
	display: inline-flex;
	align-items: center;
	gap: 0.45rem;
	color: var(--eden-success);
	font-weight: 650;

	:deep(svg) {
		width: 18px;
	}
}

.api-link {
	display: block;
	overflow: hidden;
	color: var(--eden-accent-text);
	font-size: 12px;
	text-overflow: ellipsis;
	white-space: nowrap;
}
</style>
