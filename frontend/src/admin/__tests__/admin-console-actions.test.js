/** @vitest-environment jsdom */

import { reactive, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiMocks = vi.hoisted(() => ({
    checkCloudflareDomain: vi.fn(),
    createAddress: vi.fn(),
    deleteMail: vi.fn(),
}))

vi.mock('../admin-api', () => ({
    adminApi: apiMocks,
}))

import { useAdminConsoleActions } from '../admin-console-actions'
import i18n from '../../i18n'

const buildHarness = (overrides = {}) => {
    const mail = { id: 'mail-7', sourceId: 7, subject: 'Fixture mail', to: 'qa@example.test' }
    const domain = {
        id: 'domain-1',
        sourceId: 1,
        domain: 'example.test',
        enabled: '启用',
        isEnabled: true,
        mode: 'Cloudflare Email Routing',
        receiveMode: 'cloudflare_email',
        configVersion: 3,
    }
    const address = {
        id: 'addr-3',
        sourceId: 3,
        address: 'qa@example.test',
        mails: 1,
        sent: 0,
    }
    const filteredMailRows = ref([mail])
    const showToast = vi.fn()
    const refreshAll = vi.fn()
    const replaceRouteQuery = vi.fn()
    const syncMailQueryToRoute = vi.fn()
    const ui = reactive({
        query: '',
        domain: 'all',
        address: 'all',
        status: 'all',
        flowMode: 'detail',
        selected: { flow: mail.id, identity: address.id, routing: domain.id },
    })
    const inputs = {
        activeView: ref('identity'),
        addressRows: ref([address]),
        currentAddress: ref(address),
        currentDomain: ref(domain),
        currentMail: ref(mail),
        dbVersionLabel: ref('9'),
        domainRows: ref([domain]),
        filteredMailRows,
        live: reactive({ domains: [{ id: 1, domain: 'example.test', config_version: 3 }] }),
        openSettings: ref({ prefix: '', enableAddressPassword: false }),
        opsRows: ref([{ status: '可用' }, { status: '可用' }]),
        refreshAll,
        replaceRouteQuery,
        resetMailListScroll: vi.fn(),
        showAdminPage: ref(true),
        showToast,
        syncMailQueryToRoute,
        ui,
        workerStatusLabel: ref('可用'),
        ...overrides,
    }
    return {
        actions: useAdminConsoleActions(inputs),
        filteredMailRows,
        inputs,
        mail,
        domain,
        refreshAll,
        replaceRouteQuery,
        showToast,
        syncMailQueryToRoute,
        ui,
    }
}

beforeEach(() => {
    i18n.global.locale.value = 'zh'
    vi.restoreAllMocks()
    Object.values(apiMocks).forEach((mock) => mock.mockReset())
})

describe('admin console action controller', () => {
    it('blocks production address creation without an admin session', async () => {
        const harness = buildHarness({ showAdminPage: ref(false) })
        harness.actions.openActionModal('new-address')
        harness.actions.addressCreateForm.name = 'blocked'

        await harness.actions.createAddressIdentity()

        expect(apiMocks.createAddress).not.toHaveBeenCalled()
        expect(harness.showToast).toHaveBeenCalledWith('请先登录管理员会话后再执行新增地址', 'warning')
    })

    it('creates an address through the canonical adapter and exposes credentials once', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true)
        apiMocks.createAddress.mockResolvedValue({
            address: 'team@example.test',
            jwt: 'fixture-jwt',
            password: 'fixture-password',
        })
        const harness = buildHarness()
        harness.actions.openActionModal('new-address')
        Object.assign(harness.actions.addressCreateForm, {
            name: 'team',
            domain: 'example.test',
            enablePrefix: false,
            enableRandomSubdomain: true,
        })

        await harness.actions.createAddressIdentity()

        expect(apiMocks.createAddress).toHaveBeenCalledWith({
            name: 'team',
            domain: 'example.test',
            enablePrefix: false,
            enableRandomSubdomain: true,
        })
        expect(harness.refreshAll).toHaveBeenCalledOnce()
        expect(harness.actions.actionModal.value).toBe('one-time-result')
        expect(harness.actions.oneTimeResult.title).toBe('地址已创建：team@example.test')
        expect(harness.actions.oneTimeResult.value).toContain('JWT: fixture-jwt')
    })

    it('deletes the selected fixture row and repairs selection and route state', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true)
        apiMocks.deleteMail.mockResolvedValue({ success: true })
        const harness = buildHarness()
        harness.refreshAll.mockImplementation(async () => {
            harness.filteredMailRows.value = []
        })

        await harness.actions.deleteCurrentMail()

        expect(apiMocks.deleteMail).toHaveBeenCalledWith(7)
        expect(harness.ui.selected.flow).toBe('')
        expect(harness.ui.flowMode).toBe('list')
        expect(harness.syncMailQueryToRoute).toHaveBeenCalledWith({ mailId: undefined })
    })

    it('selects a domain row before running its canonical route check', async () => {
        apiMocks.checkCloudflareDomain.mockResolvedValue({ rules: [{ id: 'rule-1' }] })
        const harness = buildHarness()
        harness.inputs.activeView.value = 'routing'
        harness.ui.selected.routing = ''

        await harness.actions.handleDomainRowAction(harness.domain, 'verify')

        expect(harness.ui.selected.routing).toBe('domain-1')
        expect(apiMocks.checkCloudflareDomain).toHaveBeenCalledWith(1)
        expect(harness.refreshAll).toHaveBeenCalledOnce()
        expect(harness.showToast).toHaveBeenCalledWith('Cloudflare 路由检查完成：1 条规则', 'success')
    })
})
