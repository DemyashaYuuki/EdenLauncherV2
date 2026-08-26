import { fetch } from '@tauri-apps/plugin-http'

import { EDENWORLD_TELEGRAM_FEED_URL, EDENWORLD_TELEGRAM_URL } from '@/helpers/edenworld'

const NEWS_CACHE_KEY = 'edenlauncher-telegram-news-cache-v1'
const NEWS_LIMIT = 6

export type EdenWorldNewsItem = {
	id: string
	title: string
	text: string
	publishedAt: string
	url: string
	imageUrl?: string
}

const FALLBACK_NEWS: EdenWorldNewsItem[] = [
	{
		id: 'edenworld-legacy-2026-08-11',
		title: '🌸 EdenWorldLegacy открывает свои двери!',
		text: 'Временный сервер EdenWorldLegacy доступен с 11 августа по 11 сентября 2026 года. Версия 1.21+, IP: edenlegacy.gomc.fun.',
		publishedAt: '2026-08-11T00:00:00+03:00',
		url: EDENWORLD_TELEGRAM_URL,
	},
]

function cleanText(value: string | null | undefined): string {
	return (value ?? '').replace(/\s+/g, ' ').trim()
}

function getTitle(text: string): string {
	const firstSentence = text.split(/(?<=[.!?])\s/)[0]
	return firstSentence.length > 100 ? `${firstSentence.slice(0, 97).trimEnd()}…` : firstSentence
}

function extractImageUrl(element: Element): string | undefined {
	const style = element.querySelector<HTMLElement>('.tgme_widget_message_photo_wrap')?.style
	const imageUrl = style?.backgroundImage.match(/^url\(["']?(.*?)["']?\)$/)?.[1]
	return imageUrl || undefined
}

export function parseEdenWorldTelegramNews(html: string): EdenWorldNewsItem[] {
	const document = new DOMParser().parseFromString(html, 'text/html')
	const posts = Array.from(document.querySelectorAll<HTMLElement>('.tgme_widget_message'))

	return posts
		.map((post): EdenWorldNewsItem | null => {
			const dataPost = post.dataset.post
			const text = cleanText(post.querySelector('.tgme_widget_message_text')?.textContent)
			if (!dataPost || !text) return null

			const dateElement = post.querySelector<HTMLTimeElement>('time[datetime]')
			const publishedAt = dateElement?.dateTime || new Date().toISOString()
			const url =
				post.querySelector<HTMLAnchorElement>('.tgme_widget_message_date')?.href ||
				`https://t.me/${dataPost}`

			return {
				id: dataPost,
				title: getTitle(text),
				text,
				publishedAt,
				url,
				imageUrl: extractImageUrl(post),
			}
		})
		.filter((post): post is EdenWorldNewsItem => post !== null)
		.sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt))
		.slice(0, NEWS_LIMIT)
}

function isNewsItem(value: unknown): value is EdenWorldNewsItem {
	if (!value || typeof value !== 'object') return false
	const item = value as Partial<EdenWorldNewsItem>
	return (
		typeof item.id === 'string' &&
		typeof item.title === 'string' &&
		typeof item.text === 'string' &&
		typeof item.publishedAt === 'string' &&
		typeof item.url === 'string'
	)
}

export function getCachedEdenWorldNews(): EdenWorldNewsItem[] {
	try {
		const cached = JSON.parse(window.localStorage.getItem(NEWS_CACHE_KEY) ?? 'null')
		if (Array.isArray(cached) && cached.every(isNewsItem) && cached.length > 0) {
			return cached.slice(0, NEWS_LIMIT)
		}
	} catch (error) {
		console.warn('Не удалось прочитать кеш новостей EdenWorld.', error)
	}

	return FALLBACK_NEWS
}

export async function fetchEdenWorldTelegramNews(): Promise<EdenWorldNewsItem[]> {
	const response = await fetch(EDENWORLD_TELEGRAM_FEED_URL, {
		method: 'GET',
		headers: {
			Accept: 'text/html,application/xhtml+xml',
			'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.7',
		},
	})

	if (!response.ok) {
		throw new Error(`Telegram вернул HTTP ${response.status}`)
	}

	const news = parseEdenWorldTelegramNews(await response.text())
	if (news.length === 0) {
		throw new Error('Telegram не открыл публичную историю этой группы')
	}

	try {
		window.localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify(news))
	} catch (error) {
		console.warn('Не удалось сохранить кеш новостей EdenWorld.', error)
	}

	return news
}
