/** @vitest-environment jsdom */

import { shallowMount } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    listAuthenticators: vi.fn(), listUsers: vi.fn(), fetch: vi.fn(), error: vi.fn(),
}))
vi.mock('../admin-api', () => ({ adminApi: mocks }))
vi.mock('../../api', () => ({ api: { fetch: mocks.fetch } }))
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { token: 'fixture' } }) }))
vi.mock('naive-ui', async (importOriginal) => ({
    ...(await importOriginal()),
    useMessage: () => ({ error: mocks.error, success: vi.fn() }),
}))

import AdminAuthenticators from '../components/AdminAuthenticators.vue'
import AdminMailWorkspace from '../components/AdminMailWorkspace.vue'
import AuthenticatorShare from '../../views/AuthenticatorShare.vue'
import MailBox from '../../components/MailBox.vue'
import SendBox from '../../components/SendBox.vue'
import { cleanMailPreview } from '../admin-formatters'
import i18n from '../../i18n'
import { useGlobalState } from '../../store'

const wrappers = []
let hidden = false
const settle = async () => {
    for (let i = 0; i < 8; i += 1) await Promise.resolve()
    await nextTick()
}
const code = () => ({ id: 1, label: 'Fixture', code: '123456', valid_until: Date.now() + 30000 })
const mount = (component, props = {}) => {
    const wrapper = shallowMount(component, {
        props, global: { plugins: [i18n], stubs: { Pagination: { props: ['prefix'], template: '<div />' } } },
    })
    wrappers.push(wrapper)
    return wrapper
}
const visibility = (value) => {
    hidden = value
    document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-13T00:00:00Z'))
    vi.resetAllMocks()
    hidden = false
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden)
    mocks.listAuthenticators.mockImplementation(async () => ({ results: [code()] }))
    mocks.listUsers.mockResolvedValue({ results: [] })
    useGlobalState().autoRefresh.value = false
})
afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
    vi.useRealTimers()
    vi.restoreAllMocks()
})

describe('pending frontend review regressions', () => {
    it('keeps the native selection checkbox in sync and clears selections on other pages', async () => {
        const model = reactive({
            ui: { flowMode: 'list', status: 'all', domain: 'all' },
            mailHierarchy: { queues: [], domains: [] }, currentRail: { empty: true },
            mailRows: [], filteredMailRows: [], visibleMailRows: [], selectedMailCount: 1,
            isAllVisibleSelected: false, isSomeVisibleSelected: false,
        })
        const actions = {
            selectAllVisibleMails: vi.fn(), clearMailSelection: vi.fn(() => { model.selectedMailCount = 0 }),
        }
        const wrapper = mount(AdminMailWorkspace, { model, actions })
        const checkbox = wrapper.get('.header-checkbox')
        await checkbox.setValue(true)
        expect(actions.clearMailSelection).toHaveBeenCalledOnce()
        expect(actions.selectAllVisibleMails).not.toHaveBeenCalled()
        expect(checkbox.element.checked).toBe(false)
        model.isSomeVisibleSelected = true
        await nextTick()
        expect(checkbox.element.indeterminate).toBe(true)
        model.isSomeVisibleSelected = false
        model.isAllVisibleSelected = true
        await nextTick()
        expect(checkbox.element.checked).toBe(true)
        expect(checkbox.element.indeterminate).toBe(false)
        await checkbox.trigger('keydown', { key: 'Enter' })
        expect(actions.clearMailSelection).toHaveBeenCalledTimes(2)
    })

    it('refreshes admin codes at expiry, retains rows on failure, and retries with backoff', async () => {
        const wrapper = mount(AdminAuthenticators, { requestConfirm: vi.fn(), copyText: vi.fn() })
        await settle()
        mocks.listAuthenticators.mockRejectedValueOnce(new Error('offline'))
        await vi.advanceTimersByTimeAsync(30500)
        expect(mocks.listAuthenticators).toHaveBeenCalledTimes(2)
        expect(wrapper.text()).toContain('Fixture')
        expect(wrapper.get('[role="alert"]').text()).toBe('offline')
        await vi.advanceTimersByTimeAsync(4999)
        expect(mocks.listAuthenticators).toHaveBeenCalledTimes(2)
        await vi.advanceTimersByTimeAsync(1)
        expect(mocks.listAuthenticators).toHaveBeenCalledTimes(3)
        expect(mocks.listUsers).toHaveBeenCalledTimes(1)
        expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    })

    it('keeps users available when the authenticator list is temporarily unavailable', async () => {
        mocks.listAuthenticators.mockRejectedValueOnce(new Error('offline'))
        mocks.listUsers.mockResolvedValueOnce({ results: [{ id: 7, user_email: 'user@example.test' }] })
        const wrapper = mount(AdminAuthenticators, { requestConfirm: vi.fn(), copyText: vi.fn() })
        await settle()
        expect(wrapper.vm.$.setupState.users).toEqual([{ id: 7, user_email: 'user@example.test' }])
    })

    it('deduplicates visibility refreshes and never reschedules an unmounted admin view', async () => {
        const wrapper = mount(AdminAuthenticators, { requestConfirm: vi.fn(), copyText: vi.fn() })
        await settle()
        let resolve
        mocks.listAuthenticators.mockImplementationOnce(() => new Promise((done) => { resolve = done }))
        await vi.advanceTimersByTimeAsync(30500)
        visibility(true)
        await vi.advanceTimersByTimeAsync(60000)
        visibility(false)
        visibility(false)
        expect(mocks.listAuthenticators).toHaveBeenCalledTimes(2)
        wrapper.unmount()
        wrappers.splice(wrappers.indexOf(wrapper), 1)
        resolve({ results: [code()] })
        await settle()
        expect(vi.getTimerCount()).toBe(0)
    })

    it('updates the share clock on return and avoids overlapping code requests', async () => {
        mocks.fetch.mockResolvedValueOnce({ item: code() })
        const wrapper = mount(AuthenticatorShare)
        await settle()
        visibility(true)
        await vi.advanceTimersByTimeAsync(60000)
        expect(mocks.fetch).toHaveBeenCalledTimes(1)
        let resolve
        mocks.fetch.mockImplementationOnce(() => new Promise((done) => { resolve = done }))
        visibility(false)
        visibility(false)
        await vi.advanceTimersByTimeAsync(3000)
        expect(mocks.fetch).toHaveBeenCalledTimes(2)
        resolve({ item: code() })
        await settle()
        expect(wrapper.text()).toContain('123 456')
    })

    it('cleans up a share page while its initial request is still pending', async () => {
        let resolve
        mocks.fetch.mockImplementationOnce(() => new Promise((done) => { resolve = done }))
        const wrapper = mount(AuthenticatorShare)
        wrapper.unmount()
        wrappers.splice(wrappers.indexOf(wrapper), 1)
        resolve({ item: code() })
        await settle()
        expect(vi.getTimerCount()).toBe(0)
        expect(mocks.error).not.toHaveBeenCalled()
    })

    it('falls back after invisible preview text and preserves ordinary entity-like text', () => {
        expect(cleanMailPreview('&amp;zwnj;', '<p>HTML body</p>', 'raw')).toBe('HTML body')
        expect(cleanMailPreview('&amp;zwj;', '&amp;zwnj;', 'raw')).toBe('raw')
        expect(cleanMailPreview('Hello &amp;zwnj;world &amp;nbsp;again', '')).toBe('Hello world again')
        expect(cleanMailPreview('&nbspword &#82045 &zwnjword', '')).toBe('&nbspword &#82045 &zwnjword')
    })

    it.each([MailBox, SendBox])('supports keyboard row activation without intercepting child controls ($__name)', async (component) => {
        const wrapper = mount(component, { fetchMailData: vi.fn().mockResolvedValue({ results: [], count: 0 }) })
        await settle()
        const state = wrapper.vm.$.setupState
        const row = { id: 3, subject: 'Fixture', text: 'body', attachments: [] }
        const element = document.createElement('div')
        const next = document.createElement('button')
        const previous = document.createElement('button')
        const container = document.createElement('div')
        container.append(previous, element, next)
        const preventDefault = vi.fn()
        const focusNext = vi.spyOn(next, 'focus')
        const focusPrevious = vi.spyOn(previous, 'focus')
        state.handleRowKey({ key: 'ArrowDown', target: element, currentTarget: element, preventDefault }, row)
        state.handleRowKey({ key: 'ArrowUp', target: element, currentTarget: element, preventDefault }, row)
        expect(focusNext).toHaveBeenCalledOnce()
        expect(focusPrevious).toHaveBeenCalledOnce()
        preventDefault.mockClear()
        state.handleRowKey({ key: ' ', target: next, currentTarget: element, preventDefault }, row)
        expect(preventDefault).not.toHaveBeenCalled()
        expect(state.curMail).toBeNull()
        state.handleRowKey({ key: 'Enter', target: element, currentTarget: element, preventDefault }, row)
        await settle()
        expect(preventDefault).toHaveBeenCalledOnce()
        expect(state.curMail?.id).toBe(3)
    })
})
