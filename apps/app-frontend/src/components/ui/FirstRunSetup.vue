<script setup lang="ts">
import { CheckIcon, DownloadIcon, GlobeIcon, RocketIcon, ShieldCheckIcon } from '@modrinth/assets'
import { ref } from 'vue'

import edenWorldLogo from '@/assets/edenworld-logo.jpg'

const emit = defineEmits<{
	complete: [settings: { autoUpdates: boolean }]
}>()

const step = ref(0)
const autoUpdates = ref(true)

function finish() {
	emit('complete', { autoUpdates: autoUpdates.value })
}
</script>

<template>
	<div class="eden-onboarding" role="dialog" aria-modal="true" aria-label="Настройка EdenLauncher">
		<div class="eden-onboarding__glow eden-onboarding__glow--one"></div>
		<div class="eden-onboarding__glow eden-onboarding__glow--two"></div>

		<section class="eden-onboarding__card">
			<header class="eden-onboarding__header">
				<img :src="edenWorldLogo" alt="EdenWorld" class="eden-onboarding__logo" />
				<div>
					<p class="eden-onboarding__eyebrow">EDENLAUNCHER</p>
					<h1>Первоначальная настройка</h1>
				</div>
			</header>

			<div class="eden-onboarding__steps" aria-hidden="true">
				<span v-for="index in 3" :key="index" :class="{ active: step >= index - 1 }"></span>
			</div>

			<div v-if="step === 0" class="eden-onboarding__content">
				<div class="eden-onboarding__hero-icon"><RocketIcon /></div>
				<h2>Добро пожаловать в EdenLauncher</h2>
				<p>
					Лаунчер уже настроен для EdenWorld: русский язык, фиолетовая тема и быстрая установка
					проектной сборки доступны сразу после запуска.
				</p>
				<div class="eden-onboarding__features">
					<div><DownloadIcon /><span>Установка сборки в один клик</span></div>
					<div><GlobeIcon /><span>Сайт и сообщества EdenWorld</span></div>
					<div><ShieldCheckIcon /><span>Режим соединения для РФ</span></div>
				</div>
			</div>

			<div v-else-if="step === 1" class="eden-onboarding__content">
				<h2>Обновления лаунчера</h2>
				<p>
					EdenLauncher проверяет официальный репозиторий GitHub при запуске и каждые 30 минут.
					Загруженный установщик проверяется по SHA-256.
				</p>
				<label class="eden-onboarding__option">
					<input v-model="autoUpdates" type="checkbox" />
					<span class="eden-onboarding__check"><CheckIcon /></span>
					<span>
						<strong>Автоматически устанавливать обновления</strong>
						<small>Рекомендуется. Лаунчер скачает новую версию и перезапустит установщик.</small>
					</span>
				</label>
				<div class="eden-onboarding__language">
					<span>Язык по умолчанию</span>
					<strong>Русский</strong>
				</div>
			</div>

			<div v-else class="eden-onboarding__content eden-onboarding__finish">
				<div class="eden-onboarding__hero-icon"><CheckIcon /></div>
				<h2>Всё готово</h2>
				<p>
					Добавьте игровой аккаунт в боковой панели или сразу установите сборку EdenWorld на главном
					экране.
				</p>
				<a href="https://edenworld.fun/" target="_blank" rel="noopener noreferrer">
					Открыть сайт EdenWorld
				</a>
			</div>

			<footer class="eden-onboarding__actions">
				<button v-if="step > 0 && step < 2" class="secondary" @click="step--">Назад</button>
				<span v-else></span>
				<button v-if="step < 2" class="primary" @click="step++">Продолжить</button>
				<button v-else class="primary" @click="finish">Начать</button>
			</footer>
		</section>
	</div>
</template>

<style scoped>
.eden-onboarding {
	position: fixed;
	inset: 0;
	z-index: 10000;
	display: grid;
	place-items: center;
	overflow: hidden;
	padding: 2rem;
	background:
		radial-gradient(circle at 18% 12%, rgba(160, 72, 255, 0.24), transparent 34%),
		radial-gradient(circle at 85% 86%, rgba(104, 40, 220, 0.25), transparent 38%),
		linear-gradient(145deg, #09050f 0%, #140a21 48%, #0b0712 100%);
	color: #f8f2ff;
}

.eden-onboarding__glow {
	position: absolute;
	width: 22rem;
	height: 22rem;
	border-radius: 50%;
	background: #9d4dff;
	filter: blur(110px);
	opacity: 0.18;
	pointer-events: none;
}

.eden-onboarding__glow--one {
	left: -8rem;
	top: -8rem;
}
.eden-onboarding__glow--two {
	right: -8rem;
	bottom: -8rem;
}

.eden-onboarding__card {
	position: relative;
	width: min(720px, 94vw);
	min-height: 570px;
	display: flex;
	flex-direction: column;
	padding: 2rem;
	border: 1px solid rgba(211, 166, 255, 0.2);
	border-radius: 28px;
	background: linear-gradient(160deg, rgba(36, 18, 58, 0.97), rgba(16, 10, 25, 0.98));
	box-shadow:
		0 32px 90px rgba(0, 0, 0, 0.55),
		0 0 60px rgba(139, 61, 238, 0.12);
}

.eden-onboarding__header {
	display: flex;
	align-items: center;
	gap: 1rem;
}
.eden-onboarding__logo {
	width: 58px;
	height: 58px;
	object-fit: cover;
	border-radius: 17px;
	box-shadow: 0 0 24px rgba(176, 102, 255, 0.35);
}
.eden-onboarding__eyebrow {
	margin: 0 0 0.2rem;
	color: #bd81ff;
	font-size: 0.74rem;
	font-weight: 800;
	letter-spacing: 0.2em;
}
.eden-onboarding h1 {
	margin: 0;
	font-size: 1.55rem;
}
.eden-onboarding h2 {
	margin: 1rem 0 0.5rem;
	font-size: 1.85rem;
}
.eden-onboarding p {
	color: #cbbbdc;
	line-height: 1.62;
}

.eden-onboarding__steps {
	display: flex;
	gap: 0.5rem;
	margin: 1.6rem 0 0.7rem;
}
.eden-onboarding__steps span {
	height: 4px;
	flex: 1;
	border-radius: 999px;
	background: rgba(255, 255, 255, 0.1);
	transition: 0.25s ease;
}
.eden-onboarding__steps span.active {
	background: linear-gradient(90deg, #7d2be8, #c578ff);
	box-shadow: 0 0 12px rgba(190, 112, 255, 0.45);
}

.eden-onboarding__content {
	flex: 1;
	padding: 1rem 0;
}
.eden-onboarding__hero-icon {
	display: grid;
	place-items: center;
	width: 66px;
	height: 66px;
	border-radius: 20px;
	background: rgba(163, 82, 255, 0.15);
	color: #c98aff;
}
.eden-onboarding__hero-icon :deep(svg) {
	width: 32px;
	height: 32px;
}
.eden-onboarding__features {
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: 0.8rem;
	margin-top: 1.5rem;
}
.eden-onboarding__features div {
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
	min-height: 118px;
	padding: 1rem;
	border: 1px solid rgba(199, 138, 255, 0.16);
	border-radius: 18px;
	background: rgba(199, 138, 255, 0.06);
	color: #e8d9f8;
}
.eden-onboarding__features :deep(svg) {
	width: 24px;
	color: #bd7dff;
}

.eden-onboarding__option {
	display: flex;
	align-items: flex-start;
	gap: 1rem;
	margin-top: 1.5rem;
	padding: 1.2rem;
	cursor: pointer;
	border: 1px solid rgba(199, 138, 255, 0.22);
	border-radius: 20px;
	background: rgba(157, 77, 255, 0.08);
}
.eden-onboarding__option input {
	position: absolute;
	opacity: 0;
	pointer-events: none;
}
.eden-onboarding__check {
	display: grid;
	place-items: center;
	width: 28px;
	height: 28px;
	flex: none;
	border: 2px solid rgba(207, 158, 255, 0.45);
	border-radius: 9px;
	color: transparent;
}
.eden-onboarding__option input:checked + .eden-onboarding__check {
	background: linear-gradient(135deg, #7d2be8, #b866ff);
	border-color: #b866ff;
	color: white;
}
.eden-onboarding__check :deep(svg) {
	width: 17px;
}
.eden-onboarding__option strong,
.eden-onboarding__option small {
	display: block;
}
.eden-onboarding__option small {
	margin-top: 0.4rem;
	color: #aa97bd;
	line-height: 1.45;
}
.eden-onboarding__language {
	display: flex;
	justify-content: space-between;
	margin-top: 1rem;
	padding: 1rem 1.2rem;
	border-radius: 16px;
	background: rgba(255, 255, 255, 0.04);
	color: #b9a7cb;
}
.eden-onboarding__language strong {
	color: #d9adff;
}
.eden-onboarding__finish {
	text-align: center;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
}
.eden-onboarding__finish a {
	margin-top: 0.8rem;
	color: #c98aff;
	font-weight: 700;
}

.eden-onboarding__actions {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
	padding-top: 1.2rem;
}
.eden-onboarding__actions button {
	min-width: 132px;
	padding: 0.8rem 1.2rem;
	border: 0;
	border-radius: 14px;
	color: white;
	font: inherit;
	font-weight: 750;
	cursor: pointer;
	transition:
		transform 0.15s ease,
		filter 0.15s ease;
}
.eden-onboarding__actions button:hover {
	transform: translateY(-1px);
	filter: brightness(1.1);
}
.eden-onboarding__actions .primary {
	background: linear-gradient(135deg, #7c2be6, #b45dff);
	box-shadow: 0 10px 28px rgba(125, 43, 230, 0.3);
}
.eden-onboarding__actions .secondary {
	background: rgba(255, 255, 255, 0.08);
	color: #dbcbea;
}

@media (max-width: 700px) {
	.eden-onboarding {
		padding: 1rem;
	}
	.eden-onboarding__card {
		min-height: auto;
		padding: 1.35rem;
	}
	.eden-onboarding__features {
		grid-template-columns: 1fr;
	}
}
</style>
