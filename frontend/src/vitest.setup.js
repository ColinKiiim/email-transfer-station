import { beforeEach } from 'vitest'

import i18n from './i18n'

const resetTestLocale = () => {
  i18n.global.locale.value = 'zh'
}

resetTestLocale()
beforeEach(resetTestLocale)

if (typeof URL.createObjectURL !== 'function') {
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: () => 'blob:vitest-fixture',
  })
}

if (typeof URL.revokeObjectURL !== 'function') {
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: () => {},
  })
}
