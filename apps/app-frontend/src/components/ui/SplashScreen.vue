<template>
	<Transition name="splash-fade" @after-leave="onAfterLeave">
		<div
			v-if="!doneLoading"
			class="splash-screen"
			role="status"
			aria-live="polite"
			:aria-label="`EdenLauncher: ${message}`"
		>
			<div class="splash-screen__art" aria-hidden="true"></div>
			<div class="splash-screen__particles" aria-hidden="true"></div>
			<div class="splash-screen__veil" aria-hidden="true"></div>

			<div class="splash-screen__corner splash-screen__corner--brand" data-tauri-drag-region>
				<EdenMark :size="30" />
				<span>EdenWorld</span>
			</div>

			<div class="splash-screen__center" data-tauri-drag-region>
				<div class="splash-screen__emblem">
					<img :src="splashRing" alt="" class="splash-screen__ring" />
					<span class="splash-screen__disc">
						<EdenMark :size="88" />
					</span>
				</div>
				<h1>EdenLauncher</h1>
				<p class="splash-screen__tagline">Путь в EdenWorld начинается здесь</p>
				<div
					class="splash-screen__progress"
					:class="{ 'splash-screen__progress--indeterminate': progress === null }"
					role="progressbar"
					aria-label="Загрузка EdenLauncher"
					aria-valuemin="0"
					aria-valuemax="100"
					:aria-valuenow="progress ?? undefined"
				>
					<span :style="progress !== null ? { width: `${progress}%` } : undefined"></span>
				</div>
				<p class="splash-screen__message">{{ message }}</p>
			</div>

			<p class="splash-screen__corner splash-screen__corner--motto" data-tauri-drag-region>
				Твой мир. Твой Eden.
			</p>
			<p v-if="version" class="splash-screen__corner splash-screen__corner--version">
				EdenLauncher / {{ version }}
			</p>
		</div>
	</Transition>
</template>

<script setup>
import { injectLoadingState } from '@modrinth/ui'
import { getVersion } from '@tauri-apps/api/app'
import { onUnmounted, ref, watch } from 'vue'

import splashRing from '@/assets/eden/overlays/splash-ring.svg?url'
import EdenMark from '@/components/ui/eden/EdenMark.vue'
import { loading_listener } from '@/helpers/events.js'

const doneLoading = ref(false)
// Real progress (0–100) only when the core reports it; null shows an indeterminate bar.
const progress = ref(null)
const message = ref('Запускаем EdenLauncher…')
const version = ref('')

const loading = injectLoadingState()

getVersion()
	.then((value) => (version.value = value))
	.catch(() => undefined)

function onAfterLeave() {
	loading.setEnabled(true)
}

watch(
	[loading.barEnabled, loading.pending],
	([barEnabled, pending]) => {
		if (barEnabled || pending) return
		// Close as soon as the app is ready; the fade itself is the only delay.
		doneLoading.value = true
	},
	{ immediate: true },
)

let unlisten = null
loading_listener((event) => {
	const type = event?.event?.type
	if (type === 'directory_move') {
		progress.value = event.fraction != null ? Math.round(event.fraction * 100) : null
		message.value = 'Переносим папку приложения…'
	} else if (type === 'checking_for_updates') {
		progress.value = event.fraction != null ? Math.round(event.fraction * 100) : null
		message.value = 'Проверяем обновления…'
	}
})
	.then((stop) => {
		unlisten = stop
		if (doneLoading.value) stop()
	})
	.catch(() => undefined)

watch(doneLoading, (done) => {
	if (done && unlisten) {
		unlisten()
		unlisten = null
	}
})

onUnmounted(() => unlisten?.())
</script>

<style scoped lang="scss">
.splash-screen {
	position: fixed;
	inset: 0;
	z-index: 10000;
	display: grid;
	place-items: center;
	overflow: hidden;
	color: #f5f3fa;
	background: #0d0d14;
	font-family: var(--font-standard);
	user-select: none;
}

.splash-screen__art,
.splash-screen__particles,
.splash-screen__veil {
	position: absolute;
	inset: 0;
	pointer-events: none;
}

.splash-screen__art {
	background: var(--eden-hero-image) 62% 50% / cover no-repeat;
}

.splash-screen__particles {
	background: url('@/assets/eden/overlays/portal-particles.svg') center / cover no-repeat;
	opacity: 0.55;
	animation: splash-drift 9s ease-in-out infinite alternate;
}

.splash-screen__veil {
	background:
		linear-gradient(
			90deg,
			rgba(13, 13, 20, 0.92) 0%,
			rgba(13, 13, 20, 0.62) 38%,
			rgba(13, 13, 20, 0.35) 100%
		),
		radial-gradient(circle at 50% 46%, rgba(13, 13, 20, 0.15) 0, rgba(13, 13, 20, 0.55) 70%);
}

.splash-screen__center {
	position: relative;
	z-index: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
	text-align: center;

	h1 {
		margin: 26px 0 0;
		color: inherit;
		font-size: 49px;
		font-weight: 650;
		letter-spacing: -0.01em;
	}
}

.splash-screen__emblem {
	position: relative;
	display: grid;
	width: 236px;
	height: 236px;
	place-items: center;
	animation: splash-mark-in 360ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.splash-screen__ring {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
}

.splash-screen__disc {
	display: grid;
	width: 200px;
	height: 200px;
	place-items: center;
	border-radius: 50%;
	background: rgba(23, 22, 33, 0.92);
}

.splash-screen__tagline {
	margin: 14px 0 0;
	opacity: 0.84;
	font-size: 15px;
}

.splash-screen__progress {
	position: relative;
	width: 320px;
	height: 4px;
	margin-top: 46px;
	overflow: hidden;
	border-radius: 4px;
	background: rgba(245, 243, 250, 0.16);

	span {
		position: absolute;
		inset: 0 auto 0 0;
		border-radius: inherit;
		background: var(--eden-accent, #bc9bff);
		transition: width 200ms ease;
	}
}

.splash-screen__progress--indeterminate span {
	width: 34%;
	animation: splash-indeterminate 1.3s cubic-bezier(0.45, 0, 0.55, 1) infinite;
}

.splash-screen__message {
	min-height: 18px;
	margin: 18px 0 0;
	opacity: 0.78;
	font-size: 12px;
}

.splash-screen__corner {
	position: absolute;
	z-index: 1;
	margin: 0;
	font-size: 11px;
	font-weight: 700;
	letter-spacing: 0.18em;
	text-transform: uppercase;
	opacity: 0.86;
}

.splash-screen__corner--brand {
	top: 46px;
	left: 56px;
	display: flex;
	align-items: center;
	gap: 14px;
}

.splash-screen__corner--motto {
	bottom: 96px;
	left: 58px;
}

.splash-screen__corner--version {
	right: 58px;
	bottom: 56px;
	font-weight: 600;
	opacity: 0.66;
}

.splash-fade-leave-active {
	transition: opacity 210ms ease-out;
}

.splash-fade-leave-to {
	opacity: 0;
}

@keyframes splash-mark-in {
	from {
		opacity: 0;
		transform: scale(0.96);
	}
	to {
		opacity: 1;
		transform: none;
	}
}

@keyframes splash-indeterminate {
	from {
		transform: translateX(-105%);
	}
	to {
		transform: translateX(300%);
	}
}

@keyframes splash-drift {
	from {
		transform: translate3d(0, 0, 0);
	}
	to {
		transform: translate3d(4px, -5px, 0);
	}
}

@media (prefers-reduced-motion: reduce) {
	.splash-screen__emblem,
	.splash-screen__particles {
		animation: none;
	}

	.splash-screen__progress--indeterminate span {
		width: 100%;
		animation: none;
		opacity: 0.5;
	}

	.splash-fade-leave-active {
		transition-duration: 120ms;
	}
}

@media (max-height: 700px) {
	.splash-screen__emblem {
		width: 180px;
		height: 180px;
	}

	.splash-screen__disc {
		width: 150px;
		height: 150px;
	}

	.splash-screen__center h1 {
		font-size: 40px;
	}

	.splash-screen__corner--motto {
		bottom: 48px;
	}
}
</style>

<style lang="scss">
// Bloom and light custom themes get a light veil and dark text on the splash.
html[data-hero-tone='light'] .splash-screen {
	color: #332a28;
	background: #f7f4f0;

	.splash-screen__veil {
		background:
			linear-gradient(
				90deg,
				rgba(255, 251, 246, 0.92) 0%,
				rgba(255, 251, 246, 0.6) 40%,
				rgba(255, 251, 246, 0.3) 100%
			),
			radial-gradient(circle at 50% 46%, rgba(255, 251, 246, 0.1) 0, rgba(255, 251, 246, 0.5) 70%);
	}

	.splash-screen__disc {
		background: rgba(255, 252, 248, 0.94);
	}

	.splash-screen__progress {
		background: rgba(51, 42, 40, 0.14);
	}
}
</style>
