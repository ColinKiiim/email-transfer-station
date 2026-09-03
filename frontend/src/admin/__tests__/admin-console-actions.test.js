/** @vitest-environment jsdom */

import { reactive, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiMocks = vi.hoisted(() => ({
    checkCloudflareDomain: vi.fn(),
    createAddress: vi.fn(),
    deleteMail: vi.fn(),
    getMail: vi.fn(),
    setMailReadState: vi.fn(),
    createUser: vi.fn(),
    deleteUser: vi.fn(),
    resetUserPassword: vi.fn(),
    setUserRole: vi.fn(),
    bindUserAddress: vi.fn(),
    unbindUserAddress: vi.fn(),
    listUserBoundAddresses: vi.fn(),
    deleteAddress: vi.fn(),
    clearAddressInbox: vi.fn(),
    rotateAddressCredential: vi.fn(),
    revokeShareTokens: vi.fn(),
    getDomainImpact: vi.fn(),
    disableDomain: vi.fn(),
    setupCloudflareDomain: vi.fn(),
    startDomainVerification: vi.fn(),
    showAddressCredential: vi.fn(),
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
        packages: 0,
        credentialVersion: 1,
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
        live: reactive({
            domains: [{ id: 1, domain: 'example.test', config_version: 3 }],
            mails: [
                { id: 7, is_read: false, unread: true, read_at: null },
                { id: 8, is_read: true, unread: false, read_at: '2026-07-15 10:00:00' },
            ],
            mailUnreadCount: 1,
        }),
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
        live: inputs.live,
        mail,
        domain,
        address,
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

    it('deletes the selected fixture row after confirmation and repairs selection and route state', async () => {
        apiMocks.deleteMail.mockResolvedValue({ success: true })
        const harness = buildHarness()
        harness.refreshAll.mockImplementation(async () => {
            harness.filteredMailRows.value = []
        })

        const deletePromise = harness.actions.deleteCurrentMail()
        expect(harness.actions.confirmDialogState.open).toBe(true)
        expect(harness.actions.confirmDialogState.tone).toBe('danger')
        expect(harness.actions.confirmDialogState.impactItems).toEqual([
            { label: '选中封数', value: 1 },
            { label: '当前范围', value: '当前邮件' },
        ])
        harness.actions.resolveConfirm(true)
        await deletePromise

        expect(apiMocks.deleteMail).toHaveBeenCalledWith(7)
        expect(harness.ui.selected.flow).toBe('')
        expect(harness.ui.flowMode).toBe('list')
        expect(harness.syncMailQueryToRoute).toHaveBeenCalledWith({ mailId: undefined })
    })

    it('cancels single mail deletion without requesting the delete API', async () => {
        const harness = buildHarness()

        const deletePromise = harness.actions.deleteCurrentMail()
        expect(harness.actions.confirmDialogState.open).toBe(true)
        harness.actions.resolveConfirm(false)
        await deletePromise

        expect(apiMocks.deleteMail).not.toHaveBeenCalled()
        expect(harness.actions.confirmDialogState.open).toBe(false)
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

    it('resets a user password directly without redundant confirmation and clears password state', async () => {
        apiMocks.resetUserPassword.mockResolvedValue({ success: true })
        const harness = buildHarness()
        harness.actions.openActionModal('reset-password')
        harness.actions.userResetPasswordForm.password = 'newpassword123'

        await harness.actions.resetUserPasswordAction()

        expect(apiMocks.resetUserPassword).toHaveBeenCalledWith(10, expect.any(String))
        expect(harness.actions.confirmDialogState.open).toBe(false)
        expect(harness.actions.userResetPasswordForm.password).toBe('')
        expect(harness.actions.actionModal.value).toBe('')
        expect(harness.refreshUsers).toHaveBeenCalledOnce()
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
        apiMocks.deleteUser.mockResolvedValue({ success: true })
        const harness = buildHarness()

        // Cancel path
        const cancelPromise = harness.actions.deleteUserAction(harness.user)
        expect(harness.actions.confirmDialogState.open).toBe(true)
        expect(harness.actions.confirmDialogState.tone).toBe('danger')
        expect(harness.actions.confirmDialogState.impactItems).toEqual([
            { label: '目标用户', value: 'admin@example.test' },
        ])
        harness.actions.resolveConfirm(false)
        await cancelPromise
        expect(apiMocks.deleteUser).not.toHaveBeenCalled()
        expect(harness.actions.confirmDialogState.open).toBe(false)

        // Confirm path
        const confirmPromise = harness.actions.deleteUserAction(harness.user)
        expect(harness.actions.confirmDialogState.open).toBe(true)
        harness.actions.resolveConfirm(true)
        await confirmPromise

        expect(apiMocks.deleteUser).toHaveBeenCalledWith(10)
        expect(harness.ui.selected.users).toBe('')
        expect(harness.refreshUsers).toHaveBeenCalledOnce()

        // Actor protection handling
        apiMocks.deleteUser.mockRejectedValue({
            data: { error: 'admin_current_actor_protected' },
            message: 'Conflict',
        })
        const protectedPromise = harness.actions.deleteUserAction(harness.user)
        harness.actions.resolveConfirm(true)
        await protectedPromise
        expect(harness.showToast).toHaveBeenCalledWith('无法对当前登录的管理员账号执行此操作', 'error')
    })

    it('binds and unbinds address to/from user with confirmation', async () => {
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
        expect(harness.actions.confirmDialogState.open).toBe(false)

        // Cancel unbind
        const cancelUnbind = harness.actions.unbindAddressFromUser(harness.user, { id: 5, name: 'alias@example.test' })
        expect(harness.actions.confirmDialogState.open).toBe(true)
        expect(harness.actions.confirmDialogState.tone).toBe('warning')
        expect(harness.actions.confirmDialogState.impactItems).toEqual([
            { label: '目标用户', value: 'admin@example.test' },
            { label: '目标地址', value: 'alias@example.test' },
        ])
        harness.actions.resolveConfirm(false)
        await cancelUnbind
        expect(apiMocks.unbindUserAddress).not.toHaveBeenCalled()
        expect(harness.actions.confirmDialogState.open).toBe(false)

        // Confirm unbind
        const confirmUnbind = harness.actions.unbindAddressFromUser(harness.user, { id: 5, name: 'alias@example.test' })
        expect(harness.actions.confirmDialogState.open).toBe(true)
        harness.actions.resolveConfirm(true)
        await confirmUnbind

        expect(apiMocks.unbindUserAddress).toHaveBeenCalledWith({
            userId: 10,
            addressId: 5,
            address: 'alias@example.test',
        })
        expect(harness.showToast).toHaveBeenCalledWith('已解绑用户 admin@example.test 的地址', 'success')
    })

    it('batch marks mails as read and decrements unread count', async () => {
        apiMocks.setMailReadState.mockResolvedValue({ success: true, read_at: '2026-08-28 10:00:00' })
        const harness = buildHarness()
        const unreadRow = { id: 'mail-7', sourceId: 7 }

        expect(harness.live.mailUnreadCount).toBe(1)
        expect(harness.live.mails[0].unread).toBe(true)

        await harness.actions.batchSetMailReadState([unreadRow], true)

        expect(apiMocks.setMailReadState).toHaveBeenCalledWith(7, true)
        expect(harness.live.mails[0].unread).toBe(false)
        expect(harness.live.mails[0].is_read).toBe(true)
        expect(harness.live.mailUnreadCount).toBe(0)
        expect(harness.showToast).toHaveBeenCalledWith('已将 1 封邮件标为已读', 'success')
    })

    it('batch marks mails as unread and increments unread count', async () => {
        apiMocks.setMailReadState.mockResolvedValue({ success: true })
        const harness = buildHarness()
        const readRow = { id: 'mail-8', sourceId: 8 }

        expect(harness.live.mailUnreadCount).toBe(1)
        expect(harness.live.mails[1].unread).toBe(false)

        await harness.actions.batchSetMailReadState([readRow], false)

        expect(apiMocks.setMailReadState).toHaveBeenCalledWith(8, false)
        expect(harness.live.mails[1].unread).toBe(true)
        expect(harness.live.mails[1].is_read).toBe(false)
        expect(harness.live.mailUnreadCount).toBe(2)
        expect(harness.showToast).toHaveBeenCalledWith('已将 1 封邮件标为未读', 'success')
    })

    it('handles batch mark read partial failures gracefully', async () => {
        apiMocks.setMailReadState
            .mockResolvedValueOnce({ success: true })
            .mockRejectedValueOnce(new Error('Network drop'))
        const harness = buildHarness()
        const rows = [{ id: 'mail-7', sourceId: 7 }, { id: 'mail-8', sourceId: 8 }]

        await harness.actions.batchSetMailReadState(rows, true)

        expect(apiMocks.setMailReadState).toHaveBeenCalledTimes(2)
        expect(harness.showToast).toHaveBeenCalledWith('Network drop', 'error')
    })

    it('exports mail rows into a zip archive and triggers download', async () => {
        apiMocks.getMail.mockResolvedValue({
            id: 7,
            raw: 'From: test@example.test\r\nSubject: Hi\r\n\r\nHello world',
        })
        const createObjectURLMock = vi.fn().mockReturnValue('blob:fixture-url')
        const revokeObjectURLMock = vi.fn()
        Object.defineProperty(globalThis.URL, 'createObjectURL', {
            value: createObjectURLMock,
            writable: true,
            configurable: true,
        })
        Object.defineProperty(globalThis.URL, 'revokeObjectURL', {
            value: revokeObjectURLMock,
            writable: true,
            configurable: true,
        })

        const harness = buildHarness()
        const rows = [{ id: 'mail-7', sourceId: 7 }]

        await harness.actions.exportMailRows(rows)

        expect(apiMocks.getMail).toHaveBeenCalledWith(7)
        expect(createObjectURLMock).toHaveBeenCalledOnce()
        expect(harness.showToast).toHaveBeenCalledWith('已导出 1 封邮件', 'success')
    })

    describe('unified confirmation controller (requestConfirm)', () => {
        it('opens confirm dialog with provided options and defaults', async () => {
            const harness = buildHarness()
            const { confirmDialogState, requestConfirm, resolveConfirm } = harness.actions

            expect(confirmDialogState.open).toBe(false)

            const pendingPromise = requestConfirm({
                title: '删除地址',
                message: '确定要删除该地址吗？',
                impactItems: [{ label: '收件数', value: 12 }],
                confirmLabel: '确认删除',
                cancelLabel: '再想想',
            })

            expect(confirmDialogState.open).toBe(true)
            expect(confirmDialogState.tone).toBe('danger')
            expect(confirmDialogState.title).toBe('删除地址')
            expect(confirmDialogState.message).toBe('确定要删除该地址吗？')
            expect(confirmDialogState.impactItems).toEqual([{ label: '收件数', value: 12 }])
            expect(confirmDialogState.confirmLabel).toBe('确认删除')
            expect(confirmDialogState.cancelLabel).toBe('再想想')
            expect(typeof confirmDialogState.resolve).toBe('function')

            resolveConfirm(false)
            const result = await pendingPromise
            expect(result).toBe(false)
        })

        it('resolves with true when resolveConfirm(true) is invoked', async () => {
            const harness = buildHarness()
            const { confirmDialogState, requestConfirm, resolveConfirm } = harness.actions

            const confirmPromise = requestConfirm({
                title: '清空收件箱',
                message: '确定清空吗？',
                tone: 'danger',
            })

            expect(confirmDialogState.open).toBe(true)
            resolveConfirm(true)

            const result = await confirmPromise
            expect(result).toBe(true)
            expect(confirmDialogState.open).toBe(false)
            expect(confirmDialogState.resolve).toBe(null)
        })

        it('resolves with false when resolveConfirm(false) is invoked', async () => {
            const harness = buildHarness()
            const { confirmDialogState, requestConfirm, resolveConfirm } = harness.actions

            const confirmPromise = requestConfirm({
                title: '轮换凭证',
                tone: 'warning',
            })

            expect(confirmDialogState.open).toBe(true)
            expect(confirmDialogState.tone).toBe('warning')
            resolveConfirm(false)

            const result = await confirmPromise
            expect(result).toBe(false)
            expect(confirmDialogState.open).toBe(false)
            expect(confirmDialogState.resolve).toBe(null)
        })

        it('subsequent calls to resolveConfirm when dialog is closed are no-ops', async () => {
            const harness = buildHarness()
            const { confirmDialogState, requestConfirm, resolveConfirm } = harness.actions

            const confirmPromise = requestConfirm({ title: '测试操作' })
            resolveConfirm(true)
            const result = await confirmPromise
            expect(result).toBe(true)

            expect(() => {
                resolveConfirm(false)
                resolveConfirm(true)
            }).not.toThrow()
            expect(confirmDialogState.open).toBe(false)
            expect(confirmDialogState.resolve).toBe(null)
        })

        it('cancels previous pending confirm request if a new request is made concurrently', async () => {
            const harness = buildHarness()
            const { confirmDialogState, requestConfirm, resolveConfirm } = harness.actions

            const firstPromise = requestConfirm({ title: '第一次确认', tone: 'danger' })
            expect(confirmDialogState.title).toBe('第一次确认')

            const secondPromise = requestConfirm({ title: '第二次确认', tone: 'info' })
            expect(confirmDialogState.title).toBe('第二次确认')
            expect(confirmDialogState.tone).toBe('info')

            const firstResult = await firstPromise
            expect(firstResult).toBe(false)

            resolveConfirm(true)
            const secondResult = await secondPromise
            expect(secondResult).toBe(true)
            expect(confirmDialogState.open).toBe(false)
        })
    })

    describe('destructive and sensitive business action confirmation flows (WP2)', () => {
        it('batch deletes mail rows after confirmation and aborts on cancel', async () => {
            apiMocks.deleteMail.mockResolvedValue({ success: true })
            const harness = buildHarness()
            const rows = [
                { id: 'mail-1', sourceId: 1, subject: 'First' },
                { id: 'mail-2', sourceId: 2, subject: 'Second' },
            ]

            // Cancel path
            const cancelPromise = harness.actions.deleteMailRows(rows, '选中邮件')
            expect(harness.actions.confirmDialogState.open).toBe(true)
            expect(harness.actions.confirmDialogState.tone).toBe('danger')
            expect(harness.actions.confirmDialogState.impactItems).toEqual([
                { label: '选中封数', value: 2 },
                { label: '当前范围', value: '选中邮件' },
            ])
            harness.actions.resolveConfirm(false)
            await cancelPromise
            expect(apiMocks.deleteMail).not.toHaveBeenCalled()
            expect(harness.actions.confirmDialogState.open).toBe(false)

            // Confirm path
            const confirmPromise = harness.actions.deleteMailRows(rows, '选中邮件')
            expect(harness.actions.confirmDialogState.open).toBe(true)
            harness.actions.resolveConfirm(true)
            await confirmPromise

            expect(apiMocks.deleteMail).toHaveBeenCalledWith(1)
            expect(apiMocks.deleteMail).toHaveBeenCalledWith(2)
            expect(harness.showToast).toHaveBeenCalledWith('已删除 2 封生产邮件', 'success')
        })

        it('deletes current address after confirmation and aborts on cancel', async () => {
            apiMocks.deleteAddress.mockResolvedValue({ success: true })
            const harness = buildHarness()
            harness.inputs.currentAddress.value = {
                id: 'addr-3',
                sourceId: 3,
                address: 'qa@example.test',
                mails: 5,
                sent: 2,
                packages: 1,
                credentialVersion: 4,
            }

            // Cancel path
            const cancelPromise = harness.actions.handleAction('delete-address')
            expect(harness.actions.confirmDialogState.open).toBe(true)
            expect(harness.actions.confirmDialogState.tone).toBe('danger')
            expect(harness.actions.confirmDialogState.impactItems).toEqual([
                { label: '目标地址', value: 'qa@example.test' },
                { label: '收件数', value: 5 },
                { label: '发送数', value: 2 },
                { label: '访问包', value: 1 },
            ])
            harness.actions.resolveConfirm(false)
            await cancelPromise
            expect(apiMocks.deleteAddress).not.toHaveBeenCalled()
            expect(harness.actions.confirmDialogState.open).toBe(false)

            // Confirm path
            const confirmPromise = harness.actions.handleAction('delete-address')
            expect(harness.actions.confirmDialogState.open).toBe(true)
            harness.actions.resolveConfirm(true)
            await confirmPromise

            expect(apiMocks.deleteAddress).toHaveBeenCalledWith(3, {
                credentialVersion: 4,
                mailCount: 5,
                sentCount: 2,
                shareCount: 1,
            })
            expect(harness.showToast).toHaveBeenCalledWith('已删除 qa@example.test', 'success')
        })

        it('clears current address inbox after confirmation and aborts on cancel', async () => {
            apiMocks.clearAddressInbox.mockResolvedValue({ success: true })
            const harness = buildHarness()
            harness.inputs.currentAddress.value = {
                id: 'addr-3',
                sourceId: 3,
                address: 'qa@example.test',
                mails: 9,
            }

            // Cancel path
            const cancelPromise = harness.actions.handleAction('clear-inbox')
            expect(harness.actions.confirmDialogState.open).toBe(true)
            expect(harness.actions.confirmDialogState.tone).toBe('danger')
            expect(harness.actions.confirmDialogState.impactItems).toEqual([
                { label: '目标地址', value: 'qa@example.test' },
                { label: '收件数', value: 9 },
            ])
            harness.actions.resolveConfirm(false)
            await cancelPromise
            expect(apiMocks.clearAddressInbox).not.toHaveBeenCalled()
            expect(harness.actions.confirmDialogState.open).toBe(false)

            // Confirm path
            const confirmPromise = harness.actions.handleAction('clear-inbox')
            expect(harness.actions.confirmDialogState.open).toBe(true)
            harness.actions.resolveConfirm(true)
            await confirmPromise

            expect(apiMocks.clearAddressInbox).toHaveBeenCalledWith(3, 9)
            expect(harness.showToast).toHaveBeenCalledWith('已清空 qa@example.test 的收件箱', 'success')
        })

        it('rotates credential with warning confirmation and aborts on cancel', async () => {
            apiMocks.rotateAddressCredential.mockResolvedValue({ success: true, jwt: 'new-jwt' })
            const harness = buildHarness()
            harness.inputs.currentAddress.value = {
                id: 'addr-3',
                sourceId: 3,
                address: 'qa@example.test',
                credentialVersion: 2,
            }

            // Cancel path
            const cancelPromise = harness.actions.handleAction('rotate')
            expect(harness.actions.confirmDialogState.open).toBe(true)
            expect(harness.actions.confirmDialogState.tone).toBe('warning')
            expect(harness.actions.confirmDialogState.impactItems).toEqual([
                { label: '目标地址', value: 'qa@example.test' },
            ])
            harness.actions.resolveConfirm(false)
            await cancelPromise
            expect(apiMocks.rotateAddressCredential).not.toHaveBeenCalled()
            expect(harness.actions.confirmDialogState.open).toBe(false)

            // Confirm path
            const confirmPromise = harness.actions.handleAction('rotate')
            expect(harness.actions.confirmDialogState.open).toBe(true)
            harness.actions.resolveConfirm(true)
            await confirmPromise

            expect(apiMocks.rotateAddressCredential).toHaveBeenCalledWith(3, 2)
            expect(harness.actions.actionModal.value).toBe('one-time-result')
            expect(harness.actions.oneTimeResult.title).toBe('凭证已轮换：qa@example.test')
        })

        it('revokes access packages with warning confirmation and aborts on cancel', async () => {
            apiMocks.revokeShareTokens.mockResolvedValue({ success: true })
            const harness = buildHarness()
            harness.inputs.currentAddress.value = {
                id: 'addr-3',
                sourceId: 3,
                address: 'qa@example.test',
            }

            // Cancel path
            const cancelPromise = harness.actions.handleAction('revoke')
            expect(harness.actions.confirmDialogState.open).toBe(true)
            expect(harness.actions.confirmDialogState.tone).toBe('warning')
            expect(harness.actions.confirmDialogState.impactItems).toEqual([
                { label: '目标地址', value: 'qa@example.test' },
            ])
            harness.actions.resolveConfirm(false)
            await cancelPromise
            expect(apiMocks.revokeShareTokens).not.toHaveBeenCalled()
            expect(harness.actions.confirmDialogState.open).toBe(false)

            // Confirm path
            const confirmPromise = harness.actions.handleAction('revoke')
            expect(harness.actions.confirmDialogState.open).toBe(true)
            harness.actions.resolveConfirm(true)
            await confirmPromise

            expect(apiMocks.revokeShareTokens).toHaveBeenCalledWith(3)
            expect(harness.showToast).toHaveBeenCalledWith('已撤销 qa@example.test 的访问包', 'success')
        })

        it('disables managed domain after impact query and confirmation, aborts on cancel', async () => {
            apiMocks.getDomainImpact.mockResolvedValue({ address_count: 4, mail_count: 12 })
            apiMocks.disableDomain.mockResolvedValue({ success: true })
            const harness = buildHarness()

            // Cancel path
            const cancelPromise = harness.actions.handleAction('domain-disable')
            await vi.waitFor(() => expect(harness.actions.confirmDialogState.open).toBe(true))
            expect(apiMocks.getDomainImpact).toHaveBeenCalledWith(1)
            expect(harness.actions.confirmDialogState.tone).toBe('danger')
            expect(harness.actions.confirmDialogState.impactItems).toEqual([
                { label: '目标域名', value: 'example.test' },
                { label: '地址数', value: 4 },
                { label: '收件数', value: 12 },
            ])
            harness.actions.resolveConfirm(false)
            await cancelPromise
            expect(apiMocks.disableDomain).not.toHaveBeenCalled()
            expect(harness.actions.confirmDialogState.open).toBe(false)

            // Confirm path
            const confirmPromise = harness.actions.handleAction('domain-disable')
            await vi.waitFor(() => expect(harness.actions.confirmDialogState.open).toBe(true))
            harness.actions.resolveConfirm(true)
            await confirmPromise

            expect(apiMocks.disableDomain).toHaveBeenCalledWith(1, { configVersion: 3 })
            expect(harness.showToast).toHaveBeenCalledWith('已停用 example.test', 'success')
        })

        it('handles Cloudflare setup with catch-all conflict confirmation', async () => {
            apiMocks.checkCloudflareDomain.mockResolvedValue({
                automatic_setup_supported: true,
                setup_preview: { catch_all_conflict: true },
            })
            apiMocks.setupCloudflareDomain.mockResolvedValue({ success: true })
            apiMocks.startDomainVerification.mockResolvedValue({ verification_address: 'verify@example.test' })
            const harness = buildHarness()

            // 1. Cancel outer setup confirmation
            const cancelOuter = harness.actions.handleAction('cloudflare-setup')
            expect(harness.actions.confirmDialogState.open).toBe(true)
            expect(harness.actions.confirmDialogState.tone).toBe('warning')
            expect(harness.actions.confirmDialogState.impactItems).toEqual([
                { label: '目标域名', value: 'example.test' },
            ])
            harness.actions.resolveConfirm(false)
            await cancelOuter
            expect(apiMocks.checkCloudflareDomain).not.toHaveBeenCalled()
            expect(harness.actions.confirmDialogState.open).toBe(false)

            // 2. Confirm outer setup, cancel catch-all conflict overwrite
            const conflictCancel = harness.actions.handleAction('cloudflare-setup')
            expect(harness.actions.confirmDialogState.open).toBe(true)
            harness.actions.resolveConfirm(true)
            await vi.waitFor(() => expect(harness.actions.confirmDialogState.open).toBe(true))
            expect(harness.actions.confirmDialogState.tone).toBe('warning')
            expect(harness.actions.confirmDialogState.message).toContain('Cloudflare 上已有 catch-all 规则')
            harness.actions.resolveConfirm(false)
            await conflictCancel
            expect(apiMocks.setupCloudflareDomain).not.toHaveBeenCalled()
            expect(harness.actions.confirmDialogState.open).toBe(false)

            // 3. Confirm outer setup and confirm catch-all conflict overwrite
            const fullConfirm = harness.actions.handleAction('cloudflare-setup')
            expect(harness.actions.confirmDialogState.open).toBe(true)
            harness.actions.resolveConfirm(true)
            await vi.waitFor(() => expect(harness.actions.confirmDialogState.open).toBe(true))
            harness.actions.resolveConfirm(true)
            await fullConfirm

            expect(apiMocks.setupCloudflareDomain).toHaveBeenCalledWith(1, {
                configVersion: 3,
                confirmReplaceCatchAll: true,
            })
            expect(harness.showToast).toHaveBeenCalledWith('Cloudflare 已配置，请向 verify@example.test 发送测试邮件后检查验证', 'success')
        })
    })
})
