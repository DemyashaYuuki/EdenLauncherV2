import { buildLocaleMessages, createMessageCompiler, type CrowdinMessages } from '@modrinth/ui'
import { uiLocaleModulesEager } from '@modrinth/ui/src/locales.eager.ts'
import { createI18n } from 'vue-i18n'

import edenAppRussianOverrides from './locales/ru-RU/eden-app-overrides.json'
import edenUiRussianOverrides from './locales/ru-RU/eden-ui-overrides.json'

const localeModules = import.meta.glob<{ default: CrowdinMessages }>('./locales/*/index.json', {
	eager: true,
})

const messages = buildLocaleMessages(localeModules, uiLocaleModulesEager)
Object.assign(messages['ru-RU'], edenAppRussianOverrides, edenUiRussianOverrides)

const i18n = createI18n({
	legacy: false,
	locale: 'ru-RU',
	fallbackLocale: 'ru-RU',
	messageCompiler: createMessageCompiler(),
	missingWarn: false,
	fallbackWarn: false,
	messages,
})

export default i18n
