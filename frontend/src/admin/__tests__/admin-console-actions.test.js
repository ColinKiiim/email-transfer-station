/** @vitest-environment jsdom */

import { reactive, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiMocks = vi.hoisted(() => ({
    checkCloudflareDomain: vi.fn(),
    createAddress: vi.fn(),
    deleteMail: vi.fn(),
    createUser: vi.fn(),
    deleteUser: vi.fn(),
    resetUserPassword: vi.fn(),
    setUserRole: vi.fn(),
    bindUserAddress: vi.fn(),
    unbindUserAddress: vi.fn(),
    listUserBoundAddresses: vi.fn(),
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
    const user = {
        id: 'user-10',
        sourceId: 10,
        user: 'admin@example.test',
        roleText: 'admin',
    }
    const filteredMailRows = ref([mail])
    const showToast = vi.fn()
    const refreshAll = vi.fn()
    const refreshUsers = vi.fn()
    const replaceRouteQuery = vi.fn()
    const syncMailQueryToRoute = vi.fn()
    const ui = reactive({
        query: '',
        domain: 'all',
        address: 'all',
        status: 'all',
        flowMode: 'detail',
        selected: { flow: mail.id, identity: address.id, routing: domain.id, users: user.id },
    })
    const inputs = {
        activeView: ref('identity'),
        addressRows: ref([address]),
        currentAddress: ref(address),
        currentUser: ref(user),
        currentDomain: ref(domain),
        currentMail: ref(mail),
        dbVersionLabel: ref('9'),
        domainRows: ref([domain]),
        filteredMailRows,
        live: reactive({ domains: [{ id: 1, domain: 'example.test', config_version: 3 }] }),
        openSettings: ref({ prefix: '', enableAddressPassword: false }),
        opsRows: ref([{ status: '可用' }, { status: '可用' }]),
        refreshAll,
        refreshUsers,
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
        user,
        refreshAll,
        refreshUsers,
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

    it('creates a user, hashes password, and immediately wipes plaintext password', async () => {
        apiMocks.createUser.mockResolvedValue({ id: 11, email: 'new@example.test' })
        const harness = buildHarness()
        harness.actions.openActionModal('new-user')
        harness.actions.userCreateForm.email = 'new@example.test'
        harness.actions.userCreateForm.password = 'supersecret'
        harness.actions.userCreateForm.username = 'newuser'
        harness.actions.userCreateForm.displayName = 'New User'

        await harness.actions.createUserAction()

        expect(apiMocks.createUser).toHaveBeenCalledWith({
            email: 'new@example.test',
            passwordHash: expect.any(String),
            username: 'newuser',
            displayName: 'New User',
        })
        expect(harness.actions.userCreateForm.password).toBe('')
        expect(harness.actions.actionModal.value).toBe('')
        expect(harness.refreshUsers).toHaveBeenCalledOnce()
        expect(harness.showToast).toHaveBeenCalledWith('已创建用户 new@example.test', 'success')
    })

    it('resets a user password with confirmation and clears password state', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true)
        apiMocks.resetUserPassword.mockResolvedValue({ success: true })
        const harness = buildHarness()
        harness.actions.openActionModal('reset-password')
        harness.actions.userResetPasswordForm.password = 'newpassword123'

        await harness.actions.resetUserPasswordAction()

        expect(apiMocks.resetUserPassword).toHaveBeenCalledWith(10, expect.any(String))
        expect(harness.actions.userResetPasswordForm.password).toBe('')
        expect(harness.actions.actionModal.value).toBe('')
        expect(harness.showToast).toHaveBeenCalledWith('已重置用户 admin@example.test 的密码', 'success')
    })

    it('updates user role and handles conflict errors gracefully', async () => {
        apiMocks.setUserRole.mockResolvedValue({ success: true })
        const harness = buildHarness()
        harness.actions.openActionModal('edit-role')
        harness.actions.userRoleForm.roleText = 'viewer'

        await harness.actions.updateUserRoleAction()

        expect(apiMocks.setUserRole).toHaveBeenCalledWith(10, 'viewer')
        expect(harness.actions.actionModal.value).toBe('')
        expect(harness.refreshUsers).toHaveBeenCalledOnce()

        // Error conflict handling
        apiMocks.setUserRole.mockRejectedValue({
            data: { error: 'admin_last_role_holder_protected' },
            message: 'Conflict',
        })
        await harness.actions.updateUserRoleAction()
        expect(harness.showToast).toHaveBeenCalledWith('无法降级或删除最后一名管理员', 'error')
    })

    it('deletes user after confirmation and handles self-deletion protection', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true)
        apiMocks.deleteUser.mockResolvedValue({ success: true })
        const harness = buildHarness()

        await harness.actions.deleteUserAction(harness.user)

        expect(apiMocks.deleteUser).toHaveBeenCalledWith(10)
        expect(harness.ui.selected.users).toBe('')
        expect(harness.refreshUsers).toHaveBeenCalledOnce()

        // Actor protection handling
        apiMocks.deleteUser.mockRejectedValue({
            data: { error: 'admin_current_actor_protected' },
            message: 'Conflict',
        })
        await harness.actions.deleteUserAction(harness.user)
        expect(harness.showToast).toHaveBeenCalledWith('无法对当前登录的管理员账号执行此操作', 'error')
    })

    it('binds and unbinds address to/from user', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true)
        apiMocks.bindUserAddress.mockResolvedValue({ success: true })
        apiMocks.unbindUserAddress.mockResolvedValue({ success: true })
        apiMocks.listUserBoundAddresses.mockResolvedValue({ results: [{ id: 5, name: 'alias@example.test' }] })

        const harness = buildHarness()
        harness.actions.userAddressBindForm.address = 'alias@example.test'

        await harness.actions.bindAddressToUser(harness.user)

        expect(apiMocks.bindUserAddress).toHaveBeenCalledWith({
            userId: 10,
            addressId: undefined,
            address: 'alias@example.test',
        })
        expect(harness.actions.userAddressBindForm.address).toBe('')
        expect(harness.showToast).toHaveBeenCalledWith('已绑定地址到用户 admin@example.test', 'success')

        await harness.actions.unbindAddressFromUser(harness.user, { id: 5, name: 'alias@example.test' })
        expect(apiMocks.unbindUserAddress).toHaveBeenCalledWith({
            userId: 10,
            addressId: 5,
            address: 'alias@example.test',
        })
        expect(harness.showToast).toHaveBeenCalledWith('已解绑用户 admin@example.test 的地址', 'success')
    })
})
