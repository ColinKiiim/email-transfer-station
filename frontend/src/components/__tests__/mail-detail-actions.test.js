/** @vitest-environment jsdom */

import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const message = {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
}

vi.mock('naive-ui', async (importOriginal) => ({
    ...(await importOriginal()),
    useMessage: () => message,
}))

import MailContentRenderer from '../MailContentRenderer.vue'
import i18n from '../../i18n'

const mail = {
    id: 7,
    address: 'recipient@example.test',
    source: 'sender@example.test',
    created_at: '2026-08-14 10:00:00',
    raw: 'Subject: Fixture\r\n\r\nBody',
    text: 'Body',
    message: '',
    messageIsHtml: false,
    attachments: [],
}

const stubs = {
    'n-space': { template: '<div><slot /></div>' },
    'n-tag': { template: '<span><slot /></span>' },
    'n-button': { template: '<button v-bind="$attrs"><slot name="icon" /><slot /></button>' },
    'n-icon': { template: '<span><slot /></span>' },
    'n-popconfirm': { template: '<div><slot name="trigger" /><slot /></div>' },
    'n-modal': { template: '<div><slot /></div>' },
    'n-drawer': { template: '<div><slot /></div>' },
    'n-drawer-content': { template: '<div><slot /></div>' },
    'n-alert': { template: '<div><slot /></div>' },
    'n-spin': { template: '<div><slot /></div>' },
    'n-list': { template: '<div><slot /></div>' },
    'n-list-item': { template: '<div><slot /><slot name="suffix" /></div>' },
    'n-thing': { template: '<div><slot /><slot name="description" /></div>' },
}

beforeEach(() => {
    i18n.global.locale.value = 'zh'
    Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
})

afterEach(() => {
    vi.clearAllMocks()
})

describe('ordinary-user mail detail actions', () => {
    it('keeps recipient copy beside the recipient tag and copies only that address', async () => {
        const wrapper = mount(MailContentRenderer, {
            props: { mail },
            global: { plugins: [i18n], stubs },
        })

        const copy = wrapper.get('.mail-copy-button')
        expect(copy.attributes('aria-label')).toBe('复制收件地址')
        expect(copy.attributes('title')).toBe('复制收件地址')
        await copy.trigger('click')
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('recipient@example.test')
    })
})
