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
}

const emit = defineEmits<{
	complete: [settings: FirstRunSettings]
}>()

const steps = [
	{ title: 'Знакомство', description: 'Что настроит лаунчер' },
	{ title: 'Игра', description: 'Язык и оперативная память' },
	{ title: 'Возможности', description: 'Сборка и обновления' },
	{ title: 'Готово', description: 'Проверка настроек' },
]

const step = ref(0)
const autoUpdates = ref(true)
const discordRpc = ref(true)
const installPack = ref(true)
const locale = ref('ru-RU')
const memoryMb = ref(4096)
const maxMemoryMb = ref(8192)

const memoryLabel = computed(() => {
	const gigabytes = memoryMb.value / 1024
	return `${Number.isInteger(gigabytes) ? gigabytes : gigabytes.toFixed(1)} ГБ`
})
const memoryOptions = computed(() => {
	const candidates = [2048, 4096, 6144, 8192].filter((value) => value <= maxMemoryMb.value)
	if (!candidates.includes(memoryMb.value)) candidates.push(memoryMb.value)
	return candidates.sort((a, b) => a - b)
})
const localeLabel = computed(() => {
	if (locale.value === 'uk-UA') return 'Українська'
	if (locale.value === 'en-US') return 'English'
	return 'Русский'
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
					<p>Шаг {{ step + 1 }} из {{ steps.length }} · {{ steps[step]?.description }}</p>
				</div>
			</header>

			<nav class="eden-onboarding__steps" aria-label="Шаги настройки">
				<button
					v-for="(item, index) in steps"
					:key="item.title"
					type="button"
					:class="{ active: step === index, complete: step > index }"
					:disabled="index > step"
					@click="step = index"
				>
					<span><CheckIcon v-if="step > index" /><template v-else>{{ index + 1 }}</template></span>
					<strong>{{ item.title }}</strong>
				</button>
			</nav>

			<div v-if="step === 0" class="eden-onboarding__content">
				<div class="eden-onboarding__hero-icon"><RocketIcon /></div>
				<h2>Подготовим лаунчер к игре</h2>
				<p>
					Нужно выбрать только язык, объём памяти и нужные функции. Подключение для России уже
					настроено и включается автоматически.
				</p>
				<div class="eden-onboarding__features">
					<div><DownloadIcon /><strong>Сборка EdenWorld</strong><span>Можно установить сразу</span></div>
					<div><GlobeIcon /><strong>Русский интерфейс</strong><span>Выбран по умолчанию</span></div>
					<div><ShieldCheckIcon /><strong>Стабильная загрузка</strong><span>RF-маршрут уже активен</span></div>
				</div>
			</div>

			<div v-else-if="step === 1" class="eden-onboarding__content">
				<h2>Основные настройки игры</h2>
				<p>Выберите язык и сколько оперативной памяти Minecraft сможет использовать.</p>
				<div class="eden-onboarding__form-grid">
					<label class="eden-onboarding__field">
						<span>Язык интерфейса</span>
						<select v-model="locale">
							<option value="ru-RU">Русский</option>
							<option value="uk-UA">Українська</option>
							<option value="en-US">English</option>
						</select>
						<small>Эту настройку можно изменить позже.</small>
					</label>
					<div class="eden-onboarding__field">
						<span class="eden-onboarding__field-heading">
							<span>ОЗУ для Minecraft</span>
							<strong>{{ memoryLabel }}</strong>
						</span>
						<div class="eden-onboarding__memory-options">
							<button
								v-for="option in memoryOptions"
								:key="option"
								type="button"
								:class="{ active: memoryMb === option }"
								@click="memoryMb = option"
							>
								{{ option / 1024 }} ГБ
							</button>
						</div>
						<input v-model.number="memoryMb" type="range" min="1024" :max="maxMemoryMb" step="512" />
						<small>Рекомендуется 4–6 ГБ. Доступно системе: до {{ Math.round(maxMemoryMb / 1024) }} ГБ.</small>
					</div>
				</div>
			</div>

			<div v-else-if="step === 2" class="eden-onboarding__content">
				<h2>Что включить сразу</h2>
				<p>Все пункты можно изменить позже. Рекомендуемые настройки уже отмечены.</p>
				<label class="eden-onboarding__option">
					<input v-model="installPack" type="checkbox" />
					<span class="eden-onboarding__check"><CheckIcon /></span>
					<span>
						<strong>Установить официальную сборку EdenWorld</strong>
						<small>Загрузка начнётся после завершения настройки.</small>
					</span>
				</label>
				<label class="eden-onboarding__option">
					<input v-model="autoUpdates" type="checkbox" />
					<span class="eden-onboarding__check"><CheckIcon /></span>
					<span>
						<strong>Автоматически устанавливать обновления</strong>
						<small>Лаунчер будет получать новые версии с GitHub без ручной переустановки.</small>
					</span>
				</label>
				<label class="eden-onboarding__option">
					<input v-model="discordRpc" type="checkbox" />
					<span class="eden-onboarding__check"><CheckIcon /></span>
					<span>
						<strong>Показывать EdenLauncher в Discord</strong>
						<small>В профиле Discord появятся название, логотип и состояние игры.</small>
					</span>
				</label>
			</div>

			<div v-else class="eden-onboarding__content eden-onboarding__finish">
				<div class="eden-onboarding__hero-icon"><CheckIcon /></div>
				<h2>Проверьте настройки</h2>
				<div class="eden-onboarding__summary">
					<div><span>Язык</span><strong>{{ localeLabel }}</strong></div>
					<div><span>Оперативная память</span><strong>{{ memoryLabel }}</strong></div>
					<div><span>Сборка EdenWorld</span><strong>{{ installPack ? 'Установить' : 'Пропустить' }}</strong></div>
					<div><span>Автообновления</span><strong>{{ autoUpdates ? 'Включены' : 'Выключены' }}</strong></div>
					<div><span>Discord</span><strong>{{ discordRpc ? 'Включён' : 'Выключен' }}</strong></div>
					<div><span>Подключение для РФ</span><strong>Включено автоматически</strong></div>
				</div>
				<p>Аккаунт Minecraft добавляется через иконку пользователя в верхней панели.</p>
			</div>

			<footer class="eden-onboarding__actions">
				<button v-if="step > 0" class="secondary" @click="step--">Назад</button>
				<span v-else></span>
				<button v-if="step < steps.length - 1" class="primary" @click="step++">
					Далее: {{ steps[step + 1]?.title }}
				</button>
				<button v-else class="primary" @click="finish">Сохранить и начать</button>
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
	width: min(780px, 94vw);
	min-height: 620px;
	flex-direction: column;
	padding: 2rem;
	border: 1px solid rgba(211, 166, 255, 0.2);
	border-radius: 28px;
	background: linear-gradient(160deg, rgba(36, 18, 58, 0.97), rgba(16, 10, 25, 0.98));
	box-shadow: 0 32px 90px rgba(0, 0, 0, 0.55);
}

.eden-onboarding__header {
	display: flex;
	align-items: center;
	gap: 1rem;
}

.eden-onboarding__header > div:last-child {
	min-width: 0;
}

.eden-onboarding__header p:last-child {
	margin: 0.25rem 0 0;
	font-size: 0.8rem;
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

.eden-onboarding h1,
.eden-onboarding h2 {
	margin: 0;
}

.eden-onboarding h1 {
	font-size: 1.55rem;
}

.eden-onboarding h2 {
	font-size: 1.75rem;
}

.eden-onboarding p {
	color: #cbbbdc;
	line-height: 1.55;
}

.eden-onboarding__steps {
	display: grid;
	grid-template-columns: repeat(4, 1fr);
	gap: 0.55rem;
	margin: 1.4rem 0 1rem;
}

.eden-onboarding__steps button {
	display: flex;
	min-width: 0;
	align-items: center;
	gap: 0.5rem;
	padding: 0.55rem;
	border: 1px solid rgba(255, 255, 255, 0.09);
	border-radius: 12px;
	color: #9d8eae;
	background: rgba(255, 255, 255, 0.035);
	font: inherit;
	font-size: 0.72rem;
	cursor: pointer;
}

.eden-onboarding__steps button:disabled {
	cursor: default;
}

.eden-onboarding__steps button.active,
.eden-onboarding__steps button.complete {
	border-color: rgba(190, 112, 255, 0.35);
	color: #f3e8ff;
	background: rgba(157, 77, 255, 0.12);
}

.eden-onboarding__steps button > span {
	display: grid;
	width: 1.55rem;
	height: 1.55rem;
	flex: 0 0 auto;
	place-items: center;
	border-radius: 8px;
	background: rgba(255, 255, 255, 0.08);
}

.eden-onboarding__steps button.active > span,
.eden-onboarding__steps button.complete > span {
	background: linear-gradient(135deg, #7d2be8, #b866ff);
	color: white;
}

.eden-onboarding__steps svg {
	width: 0.9rem;
}

.eden-onboarding__content {
	display: flex;
	flex: 1;
	flex-direction: column;
	justify-content: center;
	padding: 1rem 0;
}

.eden-onboarding__content > p {
	margin: 0.65rem 0 0;
}

.eden-onboarding__hero-icon {
	display: grid;
	width: 64px;
	height: 64px;
	margin-bottom: 1rem;
	place-items: center;
	border-radius: 20px;
	background: rgba(163, 82, 255, 0.15);
	color: #c98aff;
}

.eden-onboarding__hero-icon :deep(svg) {
	width: 31px;
	height: 31px;
}

.eden-onboarding__features {
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: 0.8rem;
	margin-top: 1.35rem;
}

.eden-onboarding__features div {
	display: flex;
	min-height: 118px;
	flex-direction: column;
	gap: 0.45rem;
	padding: 1rem;
	border: 1px solid rgba(199, 138, 255, 0.16);
	border-radius: 18px;
	background: rgba(199, 138, 255, 0.06);
}

.eden-onboarding__features :deep(svg) {
	width: 24px;
	margin-bottom: 0.25rem;
	color: #bd7dff;
}

.eden-onboarding__features span {
	color: #aa97bd;
	font-size: 0.75rem;
}

.eden-onboarding__form-grid {
	display: grid;
	grid-template-columns: 0.8fr 1.2fr;
	gap: 0.9rem;
	margin-top: 1rem;
}

.eden-onboarding__field,
.eden-onboarding__option {
	display: flex;
	padding: 1rem;
	border: 1px solid rgba(199, 138, 255, 0.22);
	border-radius: 18px;
	background: rgba(157, 77, 255, 0.08);
}

.eden-onboarding__field {
	flex-direction: column;
	gap: 0.75rem;
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
	line-height: 1.45;
}

.eden-onboarding__memory-options {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 0.4rem;
}

.eden-onboarding__memory-options button {
	padding: 0.5rem;
	border: 1px solid rgba(207, 158, 255, 0.28);
	border-radius: 10px;
	color: #dbcbea;
	background: rgba(255, 255, 255, 0.05);
	font: inherit;
	font-size: 0.75rem;
	cursor: pointer;
}

.eden-onboarding__memory-options button.active {
	border-color: #b866ff;
	background: rgba(184, 102, 255, 0.2);
	color: white;
}

.eden-onboarding__option {
	align-items: flex-start;
	gap: 1rem;
	margin-top: 0.7rem;
	cursor: pointer;
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
	margin-top: 0.35rem;
	color: #aa97bd;
	line-height: 1.4;
}

.eden-onboarding__finish {
	align-items: center;
	text-align: center;
}

.eden-onboarding__summary {
	display: grid;
	width: 100%;
	grid-template-columns: repeat(2, 1fr);
	gap: 0.55rem;
	margin-top: 1.1rem;
	text-align: left;
}

.eden-onboarding__summary div {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.75rem;
	padding: 0.7rem 0.8rem;
	border: 1px solid rgba(199, 138, 255, 0.16);
	border-radius: 12px;
	background: rgba(199, 138, 255, 0.06);
}

.eden-onboarding__summary span {
	color: #aa97bd;
	font-size: 0.75rem;
}

.eden-onboarding__summary strong {
	font-size: 0.78rem;
	text-align: right;
}

.eden-onboarding__actions {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
	padding-top: 1rem;
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
	transition: 0.15s ease;
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

@media (max-width: 760px) {
	.eden-onboarding {
		padding: 1rem;
	}

	.eden-onboarding__card {
		min-height: auto;
		padding: 1.3rem;
	}

	.eden-onboarding__steps strong {
		display: none;
	}

	.eden-onboarding__features,
	.eden-onboarding__form-grid,
	.eden-onboarding__summary {
		grid-template-columns: 1fr;
	}
}
</style>
