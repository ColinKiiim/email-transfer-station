/** @vitest-environment jsdom */

import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'

import AdminOverlays from '../components/AdminOverlays.vue'
import i18n from '../../i18n'

i18n.global.locale.value = 'zh'

const createMockModel = (overrides = {}) => ({
    actionModal: 'user-addresses',
    modalTitle: '关联地址',
    modalPrimaryLabel: '确定',
    actionBusy: '',
    currentUser: {
        id: 'usr-1',
        sourceId: 10,
        user: 'admin@example.test',
    },
    userBoundAddresses: [
        { id: 1, name: 'alias1@example.test', address: 'alias1@example.test' },
        { id: 2, name: 'long-prefix-for-testing-wrap-behavior-without-breaking-container@sub.example.test' },
    ],
    userBoundAddressesLoading: false,
    userAddressBindForm: {
        address: 'new-bind@example.test',
    },
    userRoleForm: {
        roleText: '',
    },
    userRolesList: [],
    userCreateForm: {
        email: '',
        password: '',
        username: '',
        displayName: '',
    },
    userResetPasswordForm: {
        password: '',
    },
    addressCreateForm: {
        name: '',
        domain: '',
        enablePrefix: false,
        enableRandomSubdomain: false,
    },
    addressDomainOptions: [],
    selectedAddressDomain: null,
    openSettings: {},
    shareCreateForm: {
        label: '',
        expiresAt: '',
    },
    currentAddress: null,
    oneTimeResult: {
        note: '',
        value: '',
    },
    detailOpen: false,
    currentRail: {},
    domainActivationOpen: false,
    domainActivationBusy: false,
    domainActivationForm: {
        receiveMode: 'cloudflare_email',
        domain: '',
        displayLabel: '',
        cloudflareZoneId: '',
        collectorAddress: '',
        allowRandomSubdomain: false,
    },
    confirmDialogState: {
        open: false,
        tone: 'danger',
        title: '',
        message: '',
        impactItems: [],
        confirmLabel: '',
        cancelLabel: '',
        autofocus: '',
        resolve: null,
    },
    ...overrides,
})

const createMockActions = (overrides = {}) => ({
    closeActionModal: vi.fn(),
    submitActionModal: vi.fn(),
    closeDetail: vi.fn(),
    runRailAction: vi.fn(),
    closeDomainActivation: vi.fn(),
    createAndActivateDomain: vi.fn(),
    copyText: vi.fn(),
    unbindAddressFromUser: vi.fn(),
    bindAddressToUser: vi.fn(),
    resolveConfirm: vi.fn(),
    ...overrides,
})

describe('AdminOverlays user-addresses overlay', () => {
    beforeEach(() => {
        document.body.innerHTML = ''
    })

    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('renders bound addresses list with dual alignment items and unbind actions', () => {
        const model = createMockModel()
        const actions = createMockActions()
        const wrapper = mount(AdminOverlays, {
            props: { model, actions },
            global: { plugins: [i18n] },
        })

        const boundList = wrapper.find('.bound-addresses-list')
        expect(boundList.exists()).toBe(true)

        const items = boundList.findAll('.bound-address-item')
        expect(items).toHaveLength(2)

        // First item
        const firstItemName = items[0].find('.bound-addr-name')
        expect(firstItemName.text()).toBe('alias1@example.test')

        const firstUnbindBtn = items[0].find('button.btn.small.danger')
        expect(firstUnbindBtn.exists()).toBe(true)
        expect(firstUnbindBtn.text()).toBe('解绑')
        expect(firstUnbindBtn.attributes('aria-label')).toBe('解绑')

        // Trigger unbind
        firstUnbindBtn.trigger('click')
        expect(actions.unbindAddressFromUser).toHaveBeenCalledWith(
            model.currentUser,
            model.userBoundAddresses[0],
        )

        // Second item with long text
        const secondItemName = items[1].find('.bound-addr-name')
        expect(secondItemName.text()).toBe('long-prefix-for-testing-wrap-behavior-without-breaking-container@sub.example.test')

        wrapper.unmount()
    })

    it('renders loading state when userBoundAddressesLoading is true', () => {
        const model = createMockModel({ userBoundAddressesLoading: true })
        const actions = createMockActions()
        const wrapper = mount(AdminOverlays, {
            props: { model, actions },
            global: { plugins: [i18n] },
        })

        expect(wrapper.find('.loading-text').exists()).toBe(true)
        expect(wrapper.find('.bound-addresses-list').exists()).toBe(false)
        wrapper.unmount()
    })

    it('renders empty note when user has no bound addresses', () => {
        const model = createMockModel({ userBoundAddresses: [] })
        const actions = createMockActions()
        const wrapper = mount(AdminOverlays, {
            props: { model, actions },
            global: { plugins: [i18n] },
        })

        expect(wrapper.find('.empty-note').exists()).toBe(true)
        expect(wrapper.find('.empty-note').text()).toBe('该用户暂无绑定地址')
        expect(wrapper.find('.bound-addresses-list').exists()).toBe(false)
        wrapper.unmount()
    })

    it('handles binding a new address', () => {
        const model = createMockModel()
        const actions = createMockActions()
        const wrapper = mount(AdminOverlays, {
            props: { model, actions },
            global: { plugins: [i18n] },
        })

        const bindInput = wrapper.find('[data-testid="bind-address-input"]')
        expect(bindInput.exists()).toBe(true)

        const bindBtn = wrapper.find('.bind-form-row button.btn.primary.small')
        expect(bindBtn.exists()).toBe(true)
        expect(bindBtn.text()).toBe('绑定')

        bindBtn.trigger('click')
        expect(actions.bindAddressToUser).toHaveBeenCalledWith(model.currentUser)
        wrapper.unmount()
    })

    it('modal-actions in user-addresses overlay only contains Close button and keeps standard action layout', () => {
        const model = createMockModel()
        const actions = createMockActions()
        const wrapper = mount(AdminOverlays, {
            props: { model, actions },
            global: { plugins: [i18n] },
        })

        const modalActions = wrapper.find('.modal-actions')
        expect(modalActions.exists()).toBe(true)

        const buttons = modalActions.findAll('button')
        expect(buttons).toHaveLength(1)
        expect(buttons[0].text()).toBe('关闭')

        const closeBtn = wrapper.find('[data-testid="user-addresses-close"]')
        expect(closeBtn.exists()).toBe(true)
        closeBtn.trigger('click')
        expect(actions.closeActionModal).toHaveBeenCalledTimes(1)
        wrapper.unmount()
    })

    it('modal-actions in standard action modal has cancel on the left and submit on the right', () => {
        const model = createMockModel({
            actionModal: 'edit-role',
            modalTitle: '修改角色',
            modalPrimaryLabel: '保存角色',
            currentUser: { user: 'user@example.test' },
            userRolesList: [{ id: 1, name: 'admin', role_text: 'Admin' }],
        })
        const actions = createMockActions()
        const wrapper = mount(AdminOverlays, {
            props: { model, actions },
            global: { plugins: [i18n] },
        })

        const modalActions = wrapper.find('.modal-actions')
        expect(modalActions.exists()).toBe(true)

        const buttons = modalActions.findAll('button')
        expect(buttons).toHaveLength(2)

        // First button is cancel (on left)
        expect(buttons[0].text()).toBe('取消')
        expect(buttons[0].classes()).not.toContain('primary')

        // Second button is submit (on right)
        expect(buttons[1].text()).toBe('保存角色')
        expect(buttons[1].classes()).toContain('primary')
        expect(buttons[1].attributes('data-testid')).toBe('action-submit')

        buttons[0].trigger('click')
        expect(actions.closeActionModal).toHaveBeenCalledTimes(1)

        wrapper.unmount()
    })
})

describe('AdminOverlays unified confirmation modal', () => {
    beforeEach(() => {
        document.body.innerHTML = ''
    })

    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('does not render confirm dialog when confirmDialogState.open is false', () => {
        const model = createMockModel({
            actionModal: '',
            confirmDialogState: { open: false },
        })
        const actions = createMockActions()
        const wrapper = mount(AdminOverlays, {
            props: { model, actions },
            global: { plugins: [i18n] },
        })

        expect(wrapper.find('[data-testid="confirm-dialog-backdrop"]').exists()).toBe(false)
        wrapper.unmount()
    })

    it('renders danger tone confirmation modal with impact items and custom labels', () => {
        const model = createMockModel({
            actionModal: '',
            confirmDialogState: {
                open: true,
                tone: 'danger',
                title: '删除地址',
                message: '此操作将级联删除该地址下的所有资源。',
                impactItems: [
                    { label: '关联邮件', value: '18 封' },
                    { label: '访问包', value: '2 个' },
                ],
                confirmLabel: '确认删除',
                cancelLabel: '取消操作',
            },
        })
        const actions = createMockActions()
        const wrapper = mount(AdminOverlays, {
            props: { model, actions },
            global: { plugins: [i18n] },
        })

        const backdrop = wrapper.find('[data-testid="confirm-dialog-backdrop"]')
        expect(backdrop.exists()).toBe(true)

        const modal = wrapper.find('.confirm-modal')
        expect(modal.exists()).toBe(true)
        expect(modal.classes()).toContain('tone-danger')

        const toneBadge = wrapper.find('.confirm-tone-badge')
        expect(toneBadge.exists()).toBe(true)
        expect(toneBadge.classes()).toContain('tone-danger')

        expect(wrapper.find('#confirm-dialog-title').text()).toBe('删除地址')
        expect(wrapper.find('#confirm-dialog-message').text()).toBe('此操作将级联删除该地址下的所有资源。')

        const impactList = wrapper.find('[data-testid="confirm-impact-list"]')
        expect(impactList.exists()).toBe(true)
        const items = impactList.findAll('.confirm-impact-item')
        expect(items).toHaveLength(2)
        expect(items[0].find('.confirm-impact-label').text()).toBe('关联邮件')
        expect(items[0].find('.confirm-impact-value').text()).toBe('18 封')
        expect(items[1].find('.confirm-impact-label').text()).toBe('访问包')
        expect(items[1].find('.confirm-impact-value').text()).toBe('2 个')

        const cancelBtn = wrapper.find('[data-testid="confirm-cancel"]')
        expect(cancelBtn.text()).toBe('取消操作')

        const confirmBtn = wrapper.find('[data-testid="confirm-submit"]')
        expect(confirmBtn.text()).toBe('确认删除')
        expect(confirmBtn.classes()).toContain('danger')

        wrapper.unmount()
    })

    it('renders warning and info tones with corresponding classes and tone indicators', () => {
        // Warning tone
        const warnModel = createMockModel({
            actionModal: '',
            confirmDialogState: {
                open: true,
                tone: 'warning',
                title: '轮换凭证',
                message: '确认继续？',
            },
        })
        const actions = createMockActions()
        const warnWrapper = mount(AdminOverlays, {
            props: { model: warnModel, actions },
            global: { plugins: [i18n] },
        })

        expect(warnWrapper.find('.confirm-modal').classes()).toContain('tone-warning')
        expect(warnWrapper.find('.confirm-tone-badge').classes()).toContain('tone-warning')
        expect(warnWrapper.find('[data-testid="confirm-submit"]').classes()).toContain('warning')
        warnWrapper.unmount()

        // Info tone
        const infoModel = createMockModel({
            actionModal: '',
            confirmDialogState: {
                open: true,
                tone: 'info',
                title: '自动配置',
                message: '启用配置？',
            },
        })
        const infoWrapper = mount(AdminOverlays, {
            props: { model: infoModel, actions },
            global: { plugins: [i18n] },
        })

        expect(infoWrapper.find('.confirm-modal').classes()).toContain('tone-info')
        expect(infoWrapper.find('.confirm-tone-badge').classes()).toContain('tone-info')
        expect(infoWrapper.find('[data-testid="confirm-submit"]').classes()).toContain('info')
        expect(infoWrapper.find('[data-testid="confirm-submit"]').classes()).toContain('primary')
        infoWrapper.unmount()
    })

    it('falls back to default i18n title and labels when not provided', () => {
        const model = createMockModel({
            actionModal: '',
            confirmDialogState: {
                open: true,
                message: '通用确认',
            },
        })
        const actions = createMockActions()
        const wrapper = mount(AdminOverlays, {
            props: { model, actions },
            global: { plugins: [i18n] },
        })

        expect(wrapper.find('#confirm-dialog-title').text()).toBe('确认操作')
        expect(wrapper.find('[data-testid="confirm-cancel"]').text()).toBe('取消')
        expect(wrapper.find('[data-testid="confirm-submit"]').text()).toBe('确认')
        wrapper.unmount()
    })

    it('resolves with true when confirm button is clicked', () => {
        const model = createMockModel({
            actionModal: '',
            confirmDialogState: { open: true, title: '确认' },
        })
        const actions = createMockActions()
        const wrapper = mount(AdminOverlays, {
            props: { model, actions },
            global: { plugins: [i18n] },
        })

        wrapper.find('[data-testid="confirm-submit"]').trigger('click')
        expect(actions.resolveConfirm).toHaveBeenCalledWith(true)
        wrapper.unmount()
    })

    it('resolves with false on cancel button, close button, and backdrop click', () => {
        const model = createMockModel({
            actionModal: '',
            confirmDialogState: { open: true, title: '确认' },
        })
        const actions = createMockActions()
        const wrapper = mount(AdminOverlays, {
            props: { model, actions },
            global: { plugins: [i18n] },
        })

        // Cancel button
        wrapper.find('[data-testid="confirm-cancel"]').trigger('click')
        expect(actions.resolveConfirm).toHaveBeenLastCalledWith(false)

        // Close button
        wrapper.find('[data-testid="confirm-close-btn"]').trigger('click')
        expect(actions.resolveConfirm).toHaveBeenLastCalledWith(false)

        // Backdrop click
        wrapper.find('[data-testid="confirm-dialog-backdrop"]').trigger('click')
        expect(actions.resolveConfirm).toHaveBeenLastCalledWith(false)

        expect(actions.resolveConfirm).toHaveBeenCalledTimes(3)
        wrapper.unmount()
    })

    it('keyboard navigation: Esc cancels and Enter confirms', () => {
        const model = createMockModel({
            actionModal: '',
            confirmDialogState: { open: true, title: '确认' },
        })
        const actions = createMockActions()
        const wrapper = mount(AdminOverlays, {
            props: { model, actions },
            global: { plugins: [i18n] },
        })

        const backdrop = wrapper.find('[data-testid="confirm-dialog-backdrop"]')

        // Press Escape
        backdrop.trigger('keydown', { key: 'Escape' })
        expect(actions.resolveConfirm).toHaveBeenCalledWith(false)

        // Press Enter
        backdrop.trigger('keydown', { key: 'Enter' })
        expect(actions.resolveConfirm).toHaveBeenCalledWith(true)

        wrapper.unmount()
    })

    it('pressing Enter on Cancel button does not trigger confirm', () => {
        const model = createMockModel({
            actionModal: '',
            confirmDialogState: { open: true, title: '确认' },
        })
        const actions = createMockActions()
        const wrapper = mount(AdminOverlays, {
            props: { model, actions },
            global: { plugins: [i18n] },
            attachTo: document.body,
        })

        const cancelBtn = wrapper.find('[data-testid="confirm-cancel"]')

        // Event target is cancel button itself
        cancelBtn.trigger('keydown', { key: 'Enter' })
        expect(actions.resolveConfirm).not.toHaveBeenCalledWith(true)

        wrapper.unmount()
    })

    it('prevents submission and disables buttons when actionBusy is active', () => {
        const model = createMockModel({
            actionModal: '',
            actionBusy: 'busy-operation',
            confirmDialogState: { open: true, title: '确认', confirmLabel: '删除' },
        })
        const actions = createMockActions()
        const wrapper = mount(AdminOverlays, {
            props: { model, actions },
            global: { plugins: [i18n] },
        })

        const cancelBtn = wrapper.find('[data-testid="confirm-cancel"]')
        const confirmBtn = wrapper.find('[data-testid="confirm-submit"]')

        expect(cancelBtn.attributes('disabled')).toBeDefined()
        expect(confirmBtn.attributes('disabled')).toBeDefined()
        expect(confirmBtn.text()).toBe('执行中')

        // Click submit while busy
        confirmBtn.trigger('click')
        expect(actions.resolveConfirm).not.toHaveBeenCalled()

        // Keydown Enter while busy
        wrapper.find('[data-testid="confirm-dialog-backdrop"]').trigger('keydown', { key: 'Enter' })
        expect(actions.resolveConfirm).not.toHaveBeenCalled()

        wrapper.unmount()
    })

    it('focus management: focuses appropriate target on open and restores previous focus on close', async () => {
        const triggerButton = document.createElement('button')
        triggerButton.id = 'trigger-btn'
        document.body.appendChild(triggerButton)
        triggerButton.focus()
        expect(document.activeElement).toBe(triggerButton)

        const confirmState = reactive({
            open: false,
            tone: 'danger',
            title: '删除警告',
        })
        const model = createMockModel({
            actionModal: '',
            confirmDialogState: confirmState,
        })
        const actions = createMockActions()
        const wrapper = mount(AdminOverlays, {
            props: { model, actions },
            global: { plugins: [i18n] },
            attachTo: document.body,
        })

        // Open dialog
        confirmState.open = true
        await nextTick()
        await new Promise((resolve) => setTimeout(resolve, 20))

        // Danger tone focuses cancel button by default
        const cancelBtn = wrapper.find('[data-testid="confirm-cancel"]')
        expect(document.activeElement).toBe(cancelBtn.element)

        // Close dialog
        confirmState.open = false
        await nextTick()
        await new Promise((resolve) => setTimeout(resolve, 20))

        // Focus restored to triggerButton
        expect(document.activeElement).toBe(triggerButton)

        wrapper.unmount()
    })

    it('Tab key traps focus within confirmation dialog', () => {
        const model = createMockModel({
            actionModal: '',
            confirmDialogState: { open: true, title: '确认' },
        })
        const actions = createMockActions()
        const wrapper = mount(AdminOverlays, {
            props: { model, actions },
            global: { plugins: [i18n] },
            attachTo: document.body,
        })

        const closeBtn = wrapper.find('[data-testid="confirm-close-btn"]')
        const cancelBtn = wrapper.find('[data-testid="confirm-cancel"]')
        const confirmBtn = wrapper.find('[data-testid="confirm-submit"]')
        const backdrop = wrapper.find('[data-testid="confirm-dialog-backdrop"]')

        // Focus on confirm button (last), press Tab without Shift -> wraps to closeBtn (first)
        confirmBtn.element.focus()
        expect(document.activeElement).toBe(confirmBtn.element)

        backdrop.trigger('keydown', { key: 'Tab', shiftKey: false })
        expect(document.activeElement).toBe(closeBtn.element)

        // Focus on close button (first), press Shift+Tab -> wraps to confirmBtn (last)
        closeBtn.element.focus()
        expect(document.activeElement).toBe(closeBtn.element)

        backdrop.trigger('keydown', { key: 'Tab', shiftKey: true })
        expect(document.activeElement).toBe(confirmBtn.element)

        wrapper.unmount()
    })
})
