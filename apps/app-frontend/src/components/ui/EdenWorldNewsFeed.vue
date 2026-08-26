<script setup lang="ts">
import { ArrowUpRightIcon, MessageIcon, NewspaperIcon, RefreshCwIcon } from '@modrinth/assets'
import { openUrl } from '@tauri-apps/plugin-opener'
import { onMounted, onUnmounted, ref } from 'vue'

import { EDENWORLD_TELEGRAM_URL } from '@/helpers/edenworld'
import {
	fetchEdenWorldTelegramNews,
	getCachedEdenWorldNews,
	type EdenWorldNewsItem,
} from '@/helpers/telegram-news'

const REFRESH_INTERVAL_MS = 15 * 60 * 1000

const news = ref(getCachedEdenWorldNews())
const refreshing = ref(false)
const publicHistoryUnavailable = ref(false)
let refreshTimer: ReturnType<typeof window.setInterval> | undefined

function formatNewsDate(value: string): string {
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return ''

	return new Intl.DateTimeFormat('ru-RU', {
		day: 'numeric',
		month: 'long',
		year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
	}).format(date)
}

async function openNews(url: string) {
	await openUrl(url).catch((error) => console.error('Не удалось открыть новость EdenWorld.', error))
}

async function refreshNews() {
	if (refreshing.value) return
	refreshing.value = true

	try {
		news.value = await fetchEdenWorldTelegramNews()
		publicHistoryUnavailable.value = false
	} catch (error) {
		publicHistoryUnavailable.value = true
		console.info('Публичная Telegram-лента EdenWorld пока недоступна.', error)
	} finally {
		refreshing.value = false
	}
}

onMounted(() => {
	void refreshNews()
	refreshTimer = window.setInterval(() => void refreshNews(), REFRESH_INTERVAL_MS)
})

onUnmounted(() => {
	if (refreshTimer) window.clearInterval(refreshTimer)
})
</script>

<template>
	<section class="eden-news" aria-labelledby="eden-news-title">
		<div class="eden-news__header">
			<div>
				<span class="eden-news__eyebrow"><NewspaperIcon /> EDENWORLD</span>
				<h3 id="eden-news-title">Новости проекта</h3>
			</div>
			<button
				type="button"
				class="eden-news__icon-button"
				:disabled="refreshing"
				aria-label="Обновить новости EdenWorld"
				@click="refreshNews"
			>
				<RefreshCwIcon :class="{ 'animate-spin': refreshing }" />
			</button>
		</div>

		<p v-if="publicHistoryUnavailable" class="eden-news__notice">
			Telegram показывает историю этой группы только в приложении. Последние доступные новости
			сохранены ниже.
		</p>

		<div class="eden-news__list">
			<button
				v-for="item in news"
				:key="item.id"
				type="button"
				class="eden-news-card"
				@click="openNews(item.url)"
			>
				<img v-if="item.imageUrl" :src="item.imageUrl" alt="" class="eden-news-card__image" />
				<span class="eden-news-card__date">{{ formatNewsDate(item.publishedAt) }}</span>
				<strong>{{ item.title }}</strong>
				<span class="eden-news-card__text">{{ item.text }}</span>
				<span class="eden-news-card__link">Открыть публикацию <ArrowUpRightIcon /></span>
			</button>
		</div>

		<button
			type="button"
			class="eden-news__telegram-button"
			@click="openNews(EDENWORLD_TELEGRAM_URL)"
		>
			<MessageIcon />
			Все новости в Telegram
			<ArrowUpRightIcon />
		</button>
	</section>
</template>

<style scoped lang="scss">
.eden-news {
	padding: 1rem;
}

.eden-news__header {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 0.75rem;
}

.eden-news__eyebrow {
	display: flex;
	align-items: center;
	gap: 0.35rem;
	color: var(--color-brand);
	font-size: 0.66rem;
	font-weight: 800;
	letter-spacing: 0.12em;
}

.eden-news__eyebrow svg,
.eden-news__icon-button svg,
.eden-news-card__link svg,
.eden-news__telegram-button svg {
	width: 1rem;
	height: 1rem;
}

.eden-news h3 {
	margin: 0.2rem 0 0;
	color: var(--color-text-primary);
	font-size: 1rem;
}

.eden-news__icon-button {
	display: grid;
	width: 2rem;
	height: 2rem;
	place-items: center;
	padding: 0;
	color: var(--color-text-tertiary);
	background: var(--color-button-bg);
	border: 1px solid var(--color-button-border);
	border-radius: var(--radius-md);
	cursor: pointer;
}

.eden-news__icon-button:hover:not(:disabled) {
	color: var(--color-brand);
	border-color: var(--color-brand);
}

.eden-news__icon-button:disabled {
	opacity: 0.55;
}

.eden-news__notice {
	margin: 0.75rem 0 0;
	padding: 0.65rem;
	color: var(--color-text-tertiary);
	font-size: 0.7rem;
	line-height: 1.45;
	background: var(--color-brand-highlight);
	border: 1px solid var(--brand-gradient-border);
	border-radius: var(--radius-md);
}

.eden-news__list {
	display: grid;
	gap: 0.65rem;
	margin-top: 0.8rem;
}

.eden-news-card {
	display: flex;
	min-width: 0;
	flex-direction: column;
	align-items: flex-start;
	padding: 0.75rem;
	color: var(--color-text-default);
	font: inherit;
	text-align: left;
	background: var(--surface-2);
	border: 1px solid var(--color-button-border);
	border-radius: var(--radius-lg);
	cursor: pointer;
	transition:
		border-color 120ms ease,
		transform 120ms ease,
		box-shadow 120ms ease;
}

.eden-news-card:hover {
	transform: translateY(-1px);
	border-color: var(--color-brand);
	box-shadow: 0 0.65rem 1.5rem var(--color-brand-highlight);
}

.eden-news-card__image {
	width: 100%;
	max-height: 7rem;
	margin-bottom: 0.65rem;
	border-radius: var(--radius-md);
	object-fit: cover;
}

.eden-news-card__date {
	color: var(--color-text-tertiary);
	font-size: 0.65rem;
}

.eden-news-card strong {
	display: -webkit-box;
	margin-top: 0.25rem;
	overflow: hidden;
	color: var(--color-text-primary);
	font-size: 0.82rem;
	line-height: 1.35;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
}

.eden-news-card__text {
	display: -webkit-box;
	margin-top: 0.35rem;
	overflow: hidden;
	color: var(--color-text-tertiary);
	font-size: 0.7rem;
	line-height: 1.45;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 3;
}

.eden-news-card__link {
	display: flex;
	align-items: center;
	gap: 0.25rem;
	margin-top: 0.6rem;
	color: var(--color-brand);
	font-size: 0.68rem;
	font-weight: 700;
}

.eden-news__telegram-button {
	display: flex;
	width: 100%;
	align-items: center;
	justify-content: center;
	gap: 0.4rem;
	margin-top: 0.75rem;
	padding: 0.65rem;
	color: var(--color-accent-contrast);
	font: inherit;
	font-size: 0.75rem;
	font-weight: 750;
	background: var(--color-brand);
	border: 0;
	border-radius: var(--radius-md);
	cursor: pointer;
}

.eden-news__telegram-button svg:last-child {
	margin-left: auto;
}
</style>
