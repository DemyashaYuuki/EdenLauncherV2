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
	LAUNCHER_LATEST_RELEASE_API,
	latestLauncherReleaseHttpStatus,
	latestLauncherReleases,
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

<style scoped>
.update-option,
.update-card {
	border: 1px solid rgba(190, 120, 255, 0.22);
	border-radius: 18px;
	background: rgba(139, 61, 238, 0.065);
}
.update-option {
	display: flex;
	align-items: flex-start;
	gap: 1rem;
	padding: 1.15rem;
	cursor: pointer;
}
.update-option input {
	position: absolute;
	opacity: 0;
}
.update-option strong,
.update-option small {
	display: block;
}
.update-option small {
	margin-top: 0.35rem;
	color: var(--color-secondary);
	line-height: 1.5;
}
.update-switch {
	width: 46px;
	height: 26px;
	flex: none;
	padding: 3px;
	border-radius: 999px;
	background: var(--surface-5);
	transition: 0.2s ease;
}
.update-switch span {
	display: block;
	width: 20px;
	height: 20px;
	border-radius: 50%;
	background: white;
	transition: 0.2s ease;
}
.update-option input:checked + .update-switch {
	background: linear-gradient(135deg, #7d2be8, #b761ff);
}
.update-option input:checked + .update-switch span {
	transform: translateX(20px);
}
.update-card {
	padding: 1.2rem;
}
.update-card__header {
	display: flex;
	align-items: center;
	gap: 0.9rem;
}
.update-card__icon {
	display: grid;
	place-items: center;
	width: 42px;
	height: 42px;
	border-radius: 13px;
	background: rgba(180, 93, 255, 0.15);
	color: #c987ff;
}
.update-card__icon :deep(svg) {
	width: 21px;
}
.update-card h2,
.update-card p {
	margin: 0;
}
.update-card h2 {
	font-size: 1.05rem;
}
.update-card p {
	margin-top: 0.2rem;
	color: var(--color-secondary);
	font-size: 0.85rem;
}
.update-card dl {
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: 0.7rem;
	margin: 1rem 0;
}
.update-card dl div {
	min-width: 0;
	padding: 0.8rem;
	border-radius: 13px;
	background: rgba(0, 0, 0, 0.15);
}
.update-card dt {
	color: var(--color-secondary);
	font-size: 0.72rem;
	text-transform: uppercase;
}
.update-card dd {
	margin: 0.35rem 0 0;
	overflow: hidden;
	color: #d7a8ff;
	font-weight: 700;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.update-actions {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	flex-wrap: wrap;
}
.update-actions button {
	display: inline-flex;
	align-items: center;
	gap: 0.45rem;
	padding: 0.65rem 0.9rem;
	border: 1px solid rgba(190, 120, 255, 0.22);
	border-radius: 12px;
	background: rgba(255, 255, 255, 0.06);
	color: var(--color-contrast);
	font: inherit;
	font-weight: 650;
	cursor: pointer;
}
.update-actions button.primary {
	border: 0;
	background: linear-gradient(135deg, #7d2be8, #b761ff);
	color: white;
}
.update-actions button:disabled {
	opacity: 0.55;
	cursor: wait;
}
.update-actions :deep(svg),
.up-to-date :deep(svg) {
	width: 18px;
}
.up-to-date {
	display: inline-flex;
	align-items: center;
	gap: 0.45rem;
	color: #ca8dff;
	font-weight: 650;
}
.api-link {
	display: block;
	overflow: hidden;
	color: #b871ff;
	font-size: 0.78rem;
	text-overflow: ellipsis;
	white-space: nowrap;
}
</style>
