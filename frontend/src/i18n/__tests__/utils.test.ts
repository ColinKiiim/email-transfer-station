import { afterEach, describe, expect, it, vi } from 'vitest'

import { getInitialLocale, PREFERRED_LOCALE_STORAGE_KEY } from '../utils'

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
