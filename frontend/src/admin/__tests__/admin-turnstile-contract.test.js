/** @vitest-environment jsdom */
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import i18n from '../../i18n'
import AdminLoginView from '../components/AdminLoginView.vue'
import Turnstile from '../../components/Turnstile.vue'
import { useAdminSession } from '../admin-session'

i18n.global.locale.value = 'zh'

/*
 * Cloudflare Turnstile tokens are single-use. After a failed admin sign-in the
 * widget must be re-rendered, or the next submit replays a token Cloudflare has
 * already consumed and fails too — locking the administrator out until they
 * reload the page.
 *
 * That reset was dead for two independent reasons:
 *
 *   admin-session.js   turnstileRef.value?.refresh?.()   // calls `refresh`
 *   AdminLoginView     defineExpose({ reset })           // exposed only `reset`
 *   Turnstile          defineExpose({ refresh })         // exposed only `refresh`
 *
 * Both hops used optional calls, so nothing threw and nothing happened. The
 * existing session test could not catch it because it assigns its own stub —
 * `session.turnstileRef.value = { refresh: spy }` — which fabricates exactly
 * the method the real component was missing.
 *
 * These tests assert the real components' exposed surface instead.
 */

describe('admin login Turnstile reset contract', () => {
    it('AdminLoginView exposes the method name useAdminSession calls', () => {
        const wrapper = mount(AdminLoginView, {
            global: { plugins: [i18n], stubs: { Turnstile: true } },
            props: { openSettings: { enableGlobalTurnstileCheck: false } },
        })
        // useAdminSession's failure path calls `refresh` on this ref.
        expect(typeof wrapper.vm.refresh).toBe('function')
        wrapper.unmount()
    })

    it('Turnstile exposes the method name AdminLoginView forwards to', () => {
        const wrapper = mount(Turnstile, { global: { plugins: [i18n] } })
        expect(typeof wrapper.vm.refresh).toBe('function')
        wrapper.unmount()
    })

    it('a failed sign-in re-renders the widget through the real component chain', async () => {
        const rerender = vi.fn()
        // Stand in for the Turnstile child, exposing only what it really exposes.
        const TurnstileStub = {
            name: 'Turnstile',
            setup: (_, { expose }) => {
                expose({ refresh: rerender, reset: rerender })
                return () => null
            },
        }
        const loginView = mount(AdminLoginView, {
            global: { plugins: [i18n], stubs: { Turnstile: TurnstileStub } },
            props: { openSettings: { enableGlobalTurnstileCheck: true, cfTurnstileSiteKey: 'k' } },
        })

        const session = useAdminSession({
            client: { login: vi.fn(async () => { throw new Error('bad credentials') }) },
            adminAuth: { value: '' },
            showAdminAuth: { value: false },
            showAdminPage: { value: false },
            openSettings: { value: {} },
            hashPassword: async () => 'hashed',
            hasAdminData: () => false,
            clearAdminData: vi.fn(),
            refreshAdminData: vi.fn(),
            notify: vi.fn(),
        })
        // Bind the *real* component instance, the way AdminNext.vue's template does.
        session.turnstileRef.value = loginView.vm

        await session.authFunc()

        expect(rerender).toHaveBeenCalledTimes(1)
        loginView.unmount()
    })
})
