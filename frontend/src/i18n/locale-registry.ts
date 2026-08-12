import {
  dateEnUS,
  dateZhCN,
  enUS,
  zhCN,
} from 'naive-ui'

import type { NDateLocale, NLocale } from 'naive-ui'

type NaiveLocaleConfig = {
  locale: NLocale
  dateLocale: NDateLocale
}

type LocaleRegistryEntry = {
  locale: string
  label: string
  browserMatches: string[]
  naive: NaiveLocaleConfig
  turnstileLocale: string
}

/*
 * Supported locales.
 *
 * The product ships Chinese and English only. Four further locales used to be
 * listed here, but their catalogues were incomplete — every key added for the
 * admin console was missing from all of them, and `fallbackLocale: 'zh'` meant
 * those gaps rendered as Chinese inside an otherwise translated page. Offering
 * a language the catalogue cannot actually serve is worse than not listing it.
 */
export const LOCALE_REGISTRY = [
  {
    locale: 'zh',
    label: '中文',
    browserMatches: ['zh'],
    naive: { locale: zhCN, dateLocale: dateZhCN },
    turnstileLocale: 'zh-CN',
  },
  {
    locale: 'en',
    label: 'English',
    browserMatches: ['en'],
    naive: { locale: enUS, dateLocale: dateEnUS },
    turnstileLocale: 'en',
  },
] as const satisfies readonly LocaleRegistryEntry[]

export type SupportedLocale = (typeof LOCALE_REGISTRY)[number]['locale']

export const SUPPORTED_LOCALES = LOCALE_REGISTRY.map(({ locale }) => locale) as SupportedLocale[]

const localeRegistryMap = Object.fromEntries(
  LOCALE_REGISTRY.map((entry) => [entry.locale, entry]),
) as Record<SupportedLocale, (typeof LOCALE_REGISTRY)[number]>

export const getLocaleRegistryEntry = (locale: SupportedLocale) => {
  return localeRegistryMap[locale]
}

export const getLocaleLabel = (locale: SupportedLocale) => {
  return getLocaleRegistryEntry(locale).label
}

export const getLocaleOptions = () => {
  return LOCALE_REGISTRY.map(({ locale, label }) => ({
    label,
    value: locale,
    key: locale,
  }))
}

export const getNaiveLocaleConfig = (locale: SupportedLocale) => {
  return getLocaleRegistryEntry(locale).naive
}

export const getTurnstileLocale = (locale: SupportedLocale) => {
  return getLocaleRegistryEntry(locale).turnstileLocale
}

