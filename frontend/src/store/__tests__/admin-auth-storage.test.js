/** @vitest-environment jsdom */

import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('admin authentication storage', () => {
    beforeEach(() => {
        localStorage.clear()
        sessionStorage.clear()
        vi.resetModules()
    })

    it('removes the legacy persistent token and keeps the session tab-scoped', async () => {
        localStorage.setItem('adminAuth', 'legacy-persistent-token')
        sessionStorage.setItem('adminAuth', 'fixture-tab-session')
        const { useGlobalState } = await import('../index')
        const state = useGlobalState()

        expect(localStorage.getItem('adminAuth')).toBeNull()
        expect(state.adminAuth.value).toBe('fixture-tab-session')

        state.adminAuth.value = 'replacement-tab-session'
        await nextTick()
        expect(sessionStorage.getItem('adminAuth')).toBe('replacement-tab-session')
        expect(localStorage.getItem('adminAuth')).toBeNull()
    })
})
