/** @vitest-environment jsdom */

import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
    ...overrides,
})

const createMockActions = () => ({
    closeActionModal: vi.fn(),
    submitActionModal: vi.fn(),
    closeDetail: vi.fn(),
    runRailAction: vi.fn(),
    closeDomainActivation: vi.fn(),
    createAndActivateDomain: vi.fn(),
    copyText: vi.fn(),
    unbindAddressFromUser: vi.fn(),
    bindAddressToUser: vi.fn(),
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
