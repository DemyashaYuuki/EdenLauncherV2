import { computed } from 'vue'

import i18n from '@/i18n.config'

import { en, ru, type StudioMessages } from './messages.ts'

export type StudioKey = keyof StudioMessages

export function studioLanguage(): 'ru' | 'en' {
	const locale = String(i18n.global.locale.value ?? 'ru-RU').toLowerCase()
	return locale.startsWith('ru') || locale.startsWith('uk') || locale.startsWith('be') ? 'ru' : 'en'
}

export function format(template: string, vars?: Record<string, string | number>): string {
	if (!vars) return template
	return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
		name in vars ? String(vars[name]) : whole,
	)
}

export function useStudioText() {
	const dictionary = computed(() => (studioLanguage() === 'ru' ? ru : en))
	return (key: StudioKey, vars?: Record<string, string | number>) =>
		format(dictionary.value[key] ?? key, vars)
}
