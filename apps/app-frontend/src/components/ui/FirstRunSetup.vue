<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'

import EdenIcon from '@/components/ui/eden/EdenIcon.vue'
import EdenMark from '@/components/ui/eden/EdenMark.vue'
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

const steps = ['Знакомство', 'Игра', 'Возможности', 'Готово'] as const

const step = ref(0)
const furthestStep = ref(0)
const autoUpdates = ref(true)
const discordRpc = ref(true)
const installPack = ref(true)
const locale = ref('ru-RU')
const memoryMb = ref(4096)
const systemMemoryMb = ref<number | null>(null)
const finishing = ref(false)
const heading = ref<HTMLElement | null>(null)

const locales = [
	{ value: 'ru-RU', label: 'Русский' },
	{ value: 'uk-UA', label: 'Українська' },
	{ value: 'en-US', label: 'English' },
]

const maxMemoryMb = computed(() => Math.max(2048, systemMemoryMb.value ?? 8192))
/** Recommendation from the memory this device really has. */
const recommendedMemoryMb = computed(() => {
	const total = systemMemoryMb.value
	if (total === null) return 4096
	if (total >= 16 * 1024) return 6144
	if (total >= 8 * 1024) return 4096
	return Math.max(2048, Math.floor(total / 2 / 512) * 512)
})
const memoryOptions = computed(() => {
	const candidates = [2048, 4096, 6144, 8192].filter((value) => value <= maxMemoryMb.value)
	if (!candidates.includes(recommendedMemoryMb.value)) candidates.push(recommendedMemoryMb.value)
	return candidates.sort((a, b) => a - b)
})

function gb(value: number) {
	const gigabytes = value / 1024
	return `${Number.isInteger(gigabytes) ? gigabytes : gigabytes.toFixed(1).replace('.', ',')} ГБ`
}

const memoryLabel = computed(() => gb(memoryMb.value))
const localeLabel = computed(
	() => locales.find((item) => item.value === locale.value)?.label ?? locale.value,
)

onMounted(async () => {
	try {
		systemMemoryMb.value = Math.floor((await get_max_memory()) / 1024)
	} catch (error) {
		console.warn('Не удалось определить доступную оперативную память.', error)
	}
	memoryMb.value = Math.min(recommendedMemoryMb.value, maxMemoryMb.value)
})

watch(step, async (value) => {
	furthestStep.value = Math.max(furthestStep.value, value)
	await nextTick()
	heading.value?.focus()
})

function next() {
	if (step.value < steps.length - 1) step.value++
}

function back() {
	if (step.value > 0) step.value--
}

function finish() {
	if (finishing.value) return
	finishing.value = true
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
	<div
		class="eden-onboarding"
		role="dialog"
		aria-modal="true"
		aria-labelledby="eden-onboarding-title"
	>
		<aside class="eden-onboarding__art" aria-hidden="true">
			<div class="eden-onboarding__art-image"></div>
			<div class="eden-onboarding__art-veil"></div>
			<div class="eden-onboarding__brand">
				<EdenMark :size="38" />
				<span>EdenLauncher</span>
			</div>
			<div class="eden-onboarding__story">
				<p class="eden-onboarding__story-eyebrow">Добро пожаловать домой</p>
				<p class="eden-onboarding__story-title">Начни свою историю.</p>
				<p class="eden-onboarding__story-lead">Один лаунчер. Целый мир впереди.</p>
			</div>
		</aside>

		<section class="eden-onboarding__panel">
			<div class="eden-onboarding__wizard">
				<header class="eden-onboarding__header">
					<p class="eden-eyebrow">Первый запуск</p>
					<span class="eden-onboarding__counter">{{ step + 1 }} / {{ steps.length }}</span>
				</header>

				<nav class="eden-onboarding__steps" aria-label="Шаги настройки">
					<button
						v-for="(title, index) in steps"
						:key="title"
						type="button"
						:class="{ active: step === index, complete: index < step }"
						:disabled="index > furthestStep"
						:aria-current="step === index ? 'step' : undefined"
						@click="step = index"
					>
						<span class="eden-onboarding__step-bar"></span>
						<span>{{ title }}</span>
					</button>
				</nav>

				<div class="eden-onboarding__content">
					<template v-if="step === 0">
						<h1 id="eden-onboarding-title" ref="heading" tabindex="-1">Это твой Eden.</h1>
						<p class="eden-onboarding__lead">
							Настроим лаунчер за несколько простых шагов.<br />
							Всё остальное можно изменить позже.
						</p>
						<ul class="eden-onboarding__features">
							<li>
								<span class="eden-icon-tile"><EdenIcon name="download" /></span>
								<span>
									<strong>Официальная сборка</strong>
									<small>Установим и подготовим профиль игры</small>
								</span>
							</li>
							<li>
								<span class="eden-icon-tile"><EdenIcon name="globe" /></span>
								<span>
									<strong>Всё под рукой</strong>
									<small>Сайт, сообщество и сервер EdenWorld</small>
								</span>
							</li>
							<li>
								<span class="eden-icon-tile"><EdenIcon name="settings" /></span>
								<span>
									<strong>Настройки под тебя</strong>
									<small>Язык, память и оформление лаунчера</small>
								</span>
							</li>
						</ul>
					</template>

					<template v-else-if="step === 1">
						<h1 id="eden-onboarding-title" ref="heading" tabindex="-1">Как тебе удобно?</h1>
						<p class="eden-onboarding__lead">Выбери язык и память для Minecraft.</p>
						<label class="eden-onboarding__label" for="eden-onboarding-locale"
							>Язык интерфейса</label
						>
						<div class="eden-input eden-onboarding__select">
							<select id="eden-onboarding-locale" v-model="locale">
								<option v-for="item in locales" :key="item.value" :value="item.value">
									{{ item.label }}
								</option>
							</select>
							<EdenIcon name="chevrondown" :size="18" />
						</div>

						<div class="eden-onboarding__memory-head">
							<span id="eden-onboarding-memory" class="eden-onboarding__label"
								>Память для игры</span
							>
							<strong>{{ memoryLabel }}</strong>
						</div>
						<div
							class="eden-onboarding__memory"
							role="radiogroup"
							aria-labelledby="eden-onboarding-memory"
						>
							<button
								v-for="option in memoryOptions"
								:key="option"
								type="button"
								role="radio"
								class="eden-choice"
								:class="{ active: memoryMb === option }"
								:aria-checked="memoryMb === option"
								@click="memoryMb = option"
							>
								{{ gb(option) }}
								<small v-if="option === recommendedMemoryMb">рекомендуем</small>
							</button>
						</div>
						<input
							v-model.number="memoryMb"
							class="eden-onboarding__range"
							type="range"
							min="1024"
							:max="maxMemoryMb"
							step="512"
							aria-label="Точная настройка памяти для Minecraft"
						/>
						<p class="eden-onboarding__hint">
							<EdenIcon name="info" :size="18" />
							<span v-if="systemMemoryMb !== null">
								На этом устройстве {{ gb(systemMemoryMb) }} оперативной памяти. Для EdenWorld
								рекомендуем {{ gb(recommendedMemoryMb) }} — остальное останется системе.
							</span>
							<span v-else>
								Не удалось определить память устройства. Значение можно изменить позже в настройках.
							</span>
						</p>
					</template>

					<template v-else-if="step === 2">
						<h1 id="eden-onboarding-title" ref="heading" tabindex="-1">Что включить сразу?</h1>
						<p class="eden-onboarding__lead">
							Рекомендуемые настройки уже выбраны. Их можно изменить позже.
						</p>
						<div class="eden-onboarding__toggles">
							<label class="eden-onboarding__toggle">
								<span class="eden-icon-tile"><EdenIcon name="download" /></span>
								<span>
									<strong>Установить официальную сборку EdenWorld</strong>
									<small>Загрузка начнётся сразу после настройки.</small>
								</span>
								<input v-model="installPack" type="checkbox" role="switch" />
								<span class="eden-switch" aria-hidden="true"></span>
							</label>
							<label class="eden-onboarding__toggle">
								<span class="eden-icon-tile"><EdenIcon name="refresh" /></span>
								<span>
									<strong>Автоматически обновлять лаунчер</strong>
									<small
										>Новые версии EdenLauncher будут устанавливаться без ручной загрузки.</small
									>
								</span>
								<input v-model="autoUpdates" type="checkbox" role="switch" />
								<span class="eden-switch" aria-hidden="true"></span>
							</label>
							<label class="eden-onboarding__toggle">
								<span class="eden-icon-tile"><EdenIcon name="users" /></span>
								<span>
									<strong>Показывать игру в Discord</strong>
									<small>В профиле Discord появится EdenLauncher и текущее состояние игры.</small>
								</span>
								<input v-model="discordRpc" type="checkbox" role="switch" />
								<span class="eden-switch" aria-hidden="true"></span>
							</label>
						</div>
					</template>

					<template v-else>
						<h1 id="eden-onboarding-title" ref="heading" tabindex="-1">Всё готово.</h1>
						<p class="eden-onboarding__lead">Проверь выбор — любой пункт можно поменять позже.</p>
						<dl class="eden-onboarding__summary">
							<div>
								<dt>Язык</dt>
								<dd>{{ localeLabel }}</dd>
							</div>
							<div>
								<dt>Память для игры</dt>
								<dd>{{ memoryLabel }}</dd>
							</div>
							<div>
								<dt>Сборка EdenWorld</dt>
								<dd>{{ installPack ? 'Установить' : 'Пропустить' }}</dd>
							</div>
							<div>
								<dt>Автообновления</dt>
								<dd>{{ autoUpdates ? 'Включены' : 'Выключены' }}</dd>
							</div>
							<div>
								<dt>Discord</dt>
								<dd>{{ discordRpc ? 'Показывать' : 'Не показывать' }}</dd>
							</div>
						</dl>
						<p class="eden-onboarding__hint">
							<EdenIcon name="user" :size="18" />
							<span
								>Игровой аккаунт Minecraft добавляется в карточке аккаунта внизу боковой
								панели.</span
							>
						</p>
					</template>
				</div>

				<footer class="eden-onboarding__actions">
					<button v-if="step > 0" type="button" class="eden-btn eden-btn--secondary" @click="back">
						Назад
					</button>
					<button
						v-if="step < steps.length - 1"
						type="button"
						class="eden-btn eden-btn--primary"
						:class="{ 'eden-onboarding__next--first': step === 0 }"
						@click="next"
					>
						<EdenIcon name="arrow" :size="18" />
						{{ step === 0 ? 'Давай начнём' : 'Продолжить' }}
					</button>
					<button
						v-else
						type="button"
						class="eden-btn eden-btn--primary"
						:disabled="finishing"
						@click="finish"
					>
						<EdenIcon name="check" :size="18" />
						Перейти в лаунчер
					</button>
				</footer>
				<p v-if="step === 0" class="eden-onboarding__note">
					Настройки сохранятся на этом устройстве.
				</p>
			</div>
		</section>
	</div>
</template>

<style scoped lang="scss">
.eden-onboarding {
	position: fixed;
	inset: 0;
	z-index: 10000;
	display: grid;
	grid-template-columns: minmax(0, 43%) minmax(0, 1fr);
	overflow: hidden;
	color: var(--eden-text);
	background: var(--eden-canvas);
	font-family: var(--font-standard);
}

// ---------- Left: world ----------

.eden-onboarding__art {
	position: relative;
	overflow: hidden;
	color: #f5f3fa;
}

.eden-onboarding__art-image {
	position: absolute;
	inset: 0;
	// The vertical crop keeps the mountains and river; the portal stays for the wide banner.
	background: var(--eden-hero-image) 34% 50% / cover no-repeat;
}

.eden-onboarding__art-veil {
	position: absolute;
	inset: 0;
	background:
		linear-gradient(180deg, rgba(13, 13, 20, 0.35) 0%, rgba(13, 13, 20, 0) 30%),
		linear-gradient(
			0deg,
			rgba(13, 13, 20, 0.88) 0%,
			rgba(13, 13, 20, 0.35) 38%,
			rgba(13, 13, 20, 0) 60%
		);
}

.eden-onboarding__brand {
	position: absolute;
	top: 40px;
	left: 48px;
	display: flex;
	align-items: center;
	gap: 14px;
	font-size: 17px;
	font-weight: 650;
}

.eden-onboarding__story {
	position: absolute;
	right: 40px;
	bottom: 72px;
	left: 52px;
}

.eden-onboarding__story-eyebrow {
	margin: 0;
	color: #cdb5ff;
	font-size: 11px;
	font-weight: 700;
	letter-spacing: 0.18em;
	text-transform: uppercase;
}

.eden-onboarding__story-title {
	max-width: 8.5em;
	margin: 18px 0 0;
	font-size: clamp(36px, 3.6vw, 50px);
	font-weight: 700;
	line-height: 1.25;
}

.eden-onboarding__story-lead {
	margin: 18px 0 0;
	color: rgba(245, 243, 250, 0.86);
	font-size: 15px;
}

// ---------- Right: wizard ----------

.eden-onboarding__panel {
	display: flex;
	min-height: 0;
	overflow-y: auto;
	padding: 56px 76px 40px;
}

.eden-onboarding__wizard {
	display: flex;
	width: 100%;
	max-width: 610px;
	min-height: 100%;
	flex-direction: column;
}

.eden-onboarding__header {
	display: flex;
	align-items: center;
	justify-content: space-between;
}

.eden-onboarding__counter {
	color: var(--eden-text-secondary);
	font-size: 12px;
}

.eden-onboarding__steps {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 16px;
	margin-top: 24px;

	button {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 0;
		border: 0;
		color: var(--eden-text-secondary);
		background: transparent;
		font: inherit;
		font-size: 12px;
		text-align: left;
		cursor: pointer;

		&:disabled {
			cursor: default;
		}

		&.active {
			color: var(--eden-text);
			font-weight: 650;
		}

		&:focus-visible {
			border-radius: 4px;
			outline: 2px solid var(--eden-focus);
			outline-offset: 4px;
		}
	}
}

.eden-onboarding__step-bar {
	height: 3px;
	border-radius: 3px;
	background: var(--eden-border);

	.active &,
	.complete & {
		background: var(--eden-accent);
	}
}

.eden-onboarding__content {
	display: flex;
	flex: 1;
	flex-direction: column;
	padding-top: 66px;

	h1 {
		margin: 0;
		color: var(--eden-text);
		font-size: 37px;
		font-weight: 650;
		line-height: 1.2;
		outline: none;
	}
}

.eden-onboarding__lead {
	margin: 18px 0 0;
	color: var(--eden-text-secondary);
	font-size: 16px;
	line-height: 1.7;
}

.eden-onboarding__features {
	display: flex;
	flex-direction: column;
	gap: 30px;
	margin: 56px 0 0;
	padding: 0;
	list-style: none;

	li {
		display: flex;
		align-items: center;
		gap: 18px;
	}

	.eden-icon-tile {
		width: 48px;
		height: 48px;
	}

	li > span:last-child {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	strong {
		font-size: 16px;
		font-weight: 650;
	}

	small {
		color: var(--eden-text-secondary);
		font-size: 13px;
	}
}

.eden-onboarding__label {
	display: block;
	margin-top: 40px;
	color: var(--eden-text-secondary);
	font-size: 11px;
	font-weight: 700;
	letter-spacing: 0.16em;
	text-transform: uppercase;
}

.eden-onboarding__select {
	position: relative;
	min-height: 52px;
	margin-top: 14px;
	background: var(--eden-surface);

	select {
		appearance: none;
		cursor: pointer;
		font-size: 15px;
	}

	select option {
		color: var(--eden-text);
		background: var(--eden-surface);
	}
}

.eden-onboarding__memory-head {
	display: flex;
	align-items: baseline;
	justify-content: space-between;

	strong {
		color: var(--eden-accent-text);
		font-size: 19px;
		font-weight: 650;
	}
}

.eden-onboarding__memory {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
	gap: 12px;
	margin-top: 16px;
}

.eden-choice {
	display: flex;
	min-height: 54px;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 2px;
	border: 1px solid var(--eden-border);
	border-radius: var(--eden-radius-control);
	color: var(--eden-text);
	background: var(--eden-surface);
	font: inherit;
	font-size: 14px;
	cursor: pointer;
	transition:
		border-color var(--eden-motion-hover) ease,
		background-color var(--eden-motion-hover) ease;

	small {
		color: var(--eden-text-secondary);
		font-size: 10px;
	}

	&:hover {
		border-color: var(--eden-border-strong);
	}

	&.active {
		border-color: var(--eden-accent);
		color: var(--eden-accent-text);
		background: var(--eden-accent-soft);
		font-weight: 650;
	}
}

.eden-onboarding__range {
	width: 100%;
	min-height: 0;
	margin-top: 16px;
	padding: 0;
	border: 0;
	background: transparent;
	box-shadow: none !important;
	accent-color: var(--eden-accent);
	appearance: auto !important;
}

.eden-onboarding__hint {
	display: flex;
	align-items: flex-start;
	gap: 10px;
	margin: 22px 0 0;
	color: var(--eden-text-secondary);
	font-size: 13px;
	line-height: 1.6;

	:deep(.eden-icon) {
		margin-top: 2px;
	}
}

.eden-onboarding__toggles {
	display: flex;
	flex-direction: column;
	gap: 14px;
	margin-top: 40px;
}

.eden-onboarding__toggle {
	position: relative;
	display: flex;
	align-items: center;
	gap: 16px;
	padding: 18px;
	border: 1px solid var(--eden-border);
	border-radius: var(--eden-radius-card);
	background: var(--eden-surface);
	cursor: pointer;

	> span:nth-child(2) {
		display: flex;
		min-width: 0;
		flex: 1;
		flex-direction: column;
		gap: 6px;
	}

	strong {
		font-size: 15px;
		font-weight: 650;
	}

	small {
		color: var(--eden-text-secondary);
		font-size: 12px;
		line-height: 1.5;
	}

	input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}

	&:focus-within {
		outline: 2px solid var(--eden-focus);
		outline-offset: 3px;
	}
}

.eden-switch {
	position: relative;
	width: 44px;
	height: 24px;
	flex: 0 0 auto;
	border-radius: 12px;
	background: var(--eden-border);
	transition: background-color var(--eden-motion-hover) ease;

	&::after {
		content: '';
		position: absolute;
		top: 3px;
		left: 3px;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: var(--eden-text-secondary);
		transition:
			transform var(--eden-motion-hover) ease,
			background-color var(--eden-motion-hover) ease;
	}

	input:checked + & {
		background: var(--eden-accent);

		&::after {
			background: var(--eden-on-accent);
			transform: translateX(20px);
		}
	}
}

.eden-onboarding__summary {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 12px;
	margin: 40px 0 0;

	div {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 16px 18px;
		border: 1px solid var(--eden-border);
		border-radius: var(--eden-radius-card);
		background: var(--eden-surface);
	}

	dt {
		color: var(--eden-text-secondary);
		font-size: 12px;
	}

	dd {
		margin: 0;
		color: var(--eden-text);
		font-size: 15px;
		font-weight: 650;
	}
}

.eden-onboarding__actions {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 16px;
	margin-top: 40px;

	.eden-btn {
		min-width: 112px;
	}

	.eden-btn--primary {
		min-width: 176px;
		margin-left: auto;
	}

	.eden-onboarding__next--first {
		margin-left: 0;
	}
}

.eden-onboarding__note {
	margin: 26px 0 0;
	color: var(--eden-text-secondary);
	font-size: 12px;
}

@media (max-width: 1099px) {
	.eden-onboarding {
		grid-template-columns: minmax(0, 36%) minmax(0, 1fr);
	}

	.eden-onboarding__panel {
		padding: 44px 44px 32px;
	}

	.eden-onboarding__brand {
		left: 32px;
	}

	.eden-onboarding__story {
		left: 32px;
		right: 24px;
	}
}

@media (max-width: 899px) {
	.eden-onboarding {
		grid-template-columns: 1fr;
	}

	.eden-onboarding__art {
		display: none;
	}
}

@media (max-height: 760px) {
	.eden-onboarding__content {
		padding-top: 36px;
	}

	.eden-onboarding__features {
		gap: 18px;
		margin-top: 32px;
	}
}
</style>
