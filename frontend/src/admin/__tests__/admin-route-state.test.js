import { effectScope, nextTick, reactive, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
    buildAdminRouteQuery,
    createInitialAdminRouteState,
    statusOptionsForView,
    useAdminRouteState,
} from '../admin-route-state'

const scopes = []

afterEach(() => {
    scopes.splice(0).forEach((scope) => scope.stop())
})

describe('admin route state', () => {
    it('restores a canonical refresh state from query before local preference', () => {
        const storage = { getItem: vi.fn().mockReturnValue('routing') }

        const state = createInitialAdminRouteState({
            view: ['flow', 'ignored'],
            q: 'invoice',
            domain: 'example.test',
            mailId: 'mail-7',
            mode: 'detail',
        }, storage)

        expect(state).toMatchObject({
            view: 'flow',
            query: 'invoice',
            domain: 'example.test',
            address: 'all',
            status: 'all',
            flowMode: 'detail',
            selected: { flow: 'mail-7' },
        })
    })

    it('keeps unrelated query keys while removing defaults and retired keys', () => {
        expect(buildAdminRouteQuery(
            { lang: 'zh', demo: '1', view: 'flow', status: 'unread' },
            { view: 'overview', status: 'all', q: '' },
            ['demo'],
        )).toEqual({ lang: 'zh', view: 'overview' })
        expect(statusOptionsForView('flow')).toContain('unread')
        expect(statusOptionsForView('access')).toContain('active')
        expect(statusOptionsForView('overview')).toEqual(['all'])
    })

    it('synchronizes view, filters, selection, and storage in both directions', async () => {
        const route = reactive({ path: '/admin', query: { view: 'overview' }, hash: '' })
        const router = {
            replace: vi.fn(async (location) => {
                route.path = location.path
                route.query = location.query
                route.hash = location.hash
            }),
        }
        const storage = { getItem: vi.fn(), setItem: vi.fn() }
        const initial = createInitialAdminRouteState(route.query, storage)
        const ui = reactive({
            ...initial,
            selected: { ...initial.selected },
        })
        const detailOpen = ref(true)
        const scope = effectScope()
        scopes.push(scope)
        const controller = scope.run(() => useAdminRouteState({ route, router, ui, detailOpen, storage }))

        await controller.setView('flow')
        expect(route.query).toEqual({ view: 'flow' })
        expect(storage.setItem).toHaveBeenCalledWith('ets-admin-next-view', 'flow')
        expect(detailOpen.value).toBe(false)

        ui.query = 'invoice'
        ui.domain = 'example.test'
        ui.selected.flow = 'mail-7'
        ui.flowMode = 'detail'
        await controller.syncMailQueryToRoute()
        expect(route.query).toMatchObject({
            view: 'flow',
            q: 'invoice',
            domain: 'example.test',
            mailId: 'mail-7',
            mode: 'detail',
        })

        route.query = { view: 'access', status: 'active', item: 'unknown-2' }
        await nextTick()
        expect(ui.view).toBe('access')
        expect(ui.status).toBe('active')
        expect(ui.selected.exception).toBe('unknown-2')
        expect(ui.detailKind).toBe('exception')
    })
})
