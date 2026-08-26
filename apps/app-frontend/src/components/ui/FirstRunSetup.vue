<script setup lang="ts">
import { CheckIcon, DownloadIcon, GlobeIcon, RocketIcon, ShieldCheckIcon } from '@modrinth/assets'
import { computed, onMounted, ref } from 'vue'

import edenWorldLogo from '@/assets/edenworld-logo.jpg'
import { get_max_memory } from '@/helpers/jre.js'

type FirstRunSettings = {
	autoUpdates: boolean
	discordRpc: boolean
	installPack: boolean
	locale: string
	memoryMb: number
	rfMode: boolean
}

const emit = defineEmits<{
	complete: [settings: FirstRunSettings]
}>()

const step = ref(0)
const autoUpdates = ref(true)
const discordRpc = ref(true)
const installPack = ref(true)
const locale = ref('ru-RU')
const memoryMb = ref(4096)
const maxMemoryMb = ref(8192)
const rfMode = ref(true)

const memoryLabel = computed(() => {
	const gigabytes = memoryMb.value / 1024
	return `${Number.isInteger(gigabytes) ? gigabytes : gigabytes.toFixed(1)} ГБ`
})

onMounted(async () => {
	try {
		maxMemoryMb.value = Math.max(2048, Math.floor((await get_max_memory()) / 1024))
		memoryMb.value = Math.min(4096, maxMemoryMb.value)
	} catch (error) {
		console.warn('Не удалось определить доступную оперативную память.', error)
	}
})

function finish() {
	emit('complete', {
		autoUpdates: autoUpdates.value,
		discordRpc: discordRpc.value,
		installPack: installPack.value,
		locale: locale.value,
		memoryMb: memoryMb.value,
		rfMode: rfMode.value,
	})
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
				<span v-for="index in 5" :key="index" :class="{ active: step >= index - 1 }"></span>
			</div>

			<div v-if="step === 0" class="eden-onboarding__content">
				<div class="eden-onboarding__hero-icon"><RocketIcon /></div>
				<h2>Добро пожаловать в EdenLauncher</h2>
				<p>
					За несколько шагов настроим язык, память Minecraft, подключение к EdenWorld и обновления
					лаунчера.
				</p>
				<div class="eden-onboarding__features">
					<div><DownloadIcon /><span>Установка сборки в один клик</span></div>
					<div><GlobeIcon /><span>Сайт и сообщества EdenWorld</span></div>
					<div><ShieldCheckIcon /><span>Режим соединения для РФ</span></div>
				</div>
			</div>

			<div v-else-if="step === 1" class="eden-onboarding__content">
				<h2>Язык и оперативная память</h2>
				<p>Эти параметры можно изменить позже в настройках EdenLauncher.</p>
				<label class="eden-onboarding__field">
					<span>Язык интерфейса</span>
					<select v-model="locale">
						<option value="ru-RU">Русский</option>
						<option value="uk-UA">Українська</option>
						<option value="en-US">English</option>
					</select>
				</label>
				<label class="eden-onboarding__field">
					<span class="eden-onboarding__field-heading">
						<span>ОЗУ для Minecraft</span>
						<strong>{{ memoryLabel }}</strong>
					</span>
					<input v-model.number="memoryMb" type="range" min="1024" :max="maxMemoryMb" step="512" />
					<small>Доступно системе: до {{ Math.round(maxMemoryMb / 1024) }} ГБ</small>
				</label>
			</div>

			<div v-else-if="step === 2" class="eden-onboarding__content">
				<h2>Сборка EdenWorld</h2>
				<p>Лаунчер может сразу загрузить официальную сборку и создать готовый профиль.</p>
				<label class="eden-onboarding__option">
					<input v-model="installPack" type="checkbox" />
					<span class="eden-onboarding__check"><CheckIcon /></span>
					<span>
						<strong>Установить сборку EdenWorld сейчас</strong>
						<small>Загрузка начнётся после завершения настройки.</small>
					</span>
				</label>
				<label class="eden-onboarding__option" :class="{ disabled: !installPack }">
					<input v-model="rfMode" type="checkbox" :disabled="!installPack" />
					<span class="eden-onboarding__check"><CheckIcon /></span>
					<span>
						<strong>Использовать режим соединения для РФ</strong>
						<small>Включает альтернативный маршрут загрузки сборки.</small>
					</span>
				</label>
			</div>

			<div v-else-if="step === 3" class="eden-onboarding__content">
				<h2>Возможности лаунчера</h2>
				<p>Выберите, какие фоновые функции будут включены.</p>
				<label class="eden-onboarding__option">
					<input v-model="autoUpdates" type="checkbox" />
					<span class="eden-onboarding__check"><CheckIcon /></span>
					<span>
						<strong>Автоматически устанавливать обновления</strong>
						<small>Проверка GitHub выполняется при запуске и каждые 30 минут.</small>
					</span>
				</label>
				<label class="eden-onboarding__option">
					<input v-model="discordRpc" type="checkbox" />
					<span class="eden-onboarding__check"><CheckIcon /></span>
					<span>
						<strong>Показывать EdenLauncher в Discord</strong>
						<small>Discord будет отображать состояние игры и логотип EdenLauncher.</small>
					</span>
				</label>
			</div>

			<div v-else class="eden-onboarding__content eden-onboarding__finish">
				<div class="eden-onboarding__hero-icon"><CheckIcon /></div>
				<h2>Всё готово</h2>
				<p>
					Выбрано {{ memoryLabel }} ОЗУ. Игровой аккаунт можно добавить через иконку пользователя в
					верхней панели.
				</p>
				<a href="https://edenworld.fun/" target="_blank" rel="noopener noreferrer">
					Открыть сайт EdenWorld
				</a>
			</div>

			<footer class="eden-onboarding__actions">
				<button v-if="step > 0" class="secondary" @click="step--">Назад</button>
				<span v-else></span>
				<button v-if="step < 4" class="primary" @click="step++">Продолжить</button>
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
	overflow: auto;
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
	display: flex;
	width: min(720px, 94vw);
	min-height: 590px;
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
	border-radius: 17px;
	object-fit: cover;
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
	width: 66px;
	height: 66px;
	place-items: center;
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
	min-height: 118px;
	flex-direction: column;
	gap: 0.75rem;
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

.eden-onboarding__field,
.eden-onboarding__option {
	display: flex;
	margin-top: 1rem;
	padding: 1.1rem;
	border: 1px solid rgba(199, 138, 255, 0.22);
	border-radius: 18px;
	background: rgba(157, 77, 255, 0.08);
}

.eden-onboarding__field {
	flex-direction: column;
	gap: 0.8rem;
	font-weight: 700;
}

.eden-onboarding__field select {
	width: 100%;
	padding: 0.75rem;
	border: 1px solid rgba(207, 158, 255, 0.35);
	border-radius: 12px;
	background: #1b1028;
	color: #f8f2ff;
	font: inherit;
}

.eden-onboarding__field input[type='range'] {
	width: 100%;
	accent-color: #ad59f5;
}

.eden-onboarding__field-heading {
	display: flex;
	justify-content: space-between;
}

.eden-onboarding__field-heading strong {
	color: #d9adff;
}

.eden-onboarding__field small {
	color: #aa97bd;
	font-weight: 400;
}

.eden-onboarding__option {
	align-items: flex-start;
	gap: 1rem;
	cursor: pointer;
}

.eden-onboarding__option.disabled {
	opacity: 0.45;
}

.eden-onboarding__option input {
	position: absolute;
	opacity: 0;
	pointer-events: none;
}

.eden-onboarding__check {
	display: grid;
	width: 28px;
	height: 28px;
	flex: none;
	place-items: center;
	border: 2px solid rgba(207, 158, 255, 0.45);
	border-radius: 9px;
	color: transparent;
}

.eden-onboarding__option input:checked + .eden-onboarding__check {
	border-color: #b866ff;
	background: linear-gradient(135deg, #7d2be8, #b866ff);
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

.eden-onboarding__finish {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	text-align: center;
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

