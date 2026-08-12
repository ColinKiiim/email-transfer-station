import { afterEach, describe, expect, it, vi } from 'vitest'

import { getInitialLocale, getLocaleRedirect, PREFERRED_LOCALE_STORAGE_KEY } from '../utils'

describe('initial locale', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses a stored preference before the browser language', () => {
    vi.stubGlobal('window', {
      localStorage: { getItem: (key: string) => key === PREFERRED_LOCALE_STORAGE_KEY ? 'en' : null },
    })
    vi.stubGlobal('navigator', { languages: ['zh-CN'] })
    expect(getInitialLocale()).toBe('en')
  })
})

describe('locale navigation', () => {
  it('does not redirect an already canonical non-default route to itself', () => {
    expect(getLocaleRedirect('/en/', 'en', 'en')).toBeNull()
    expect(getLocaleRedirect('/', null, 'en')).toBe('/en/')
  })
})
