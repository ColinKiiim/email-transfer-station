/** @vitest-environment jsdom */

import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const message = {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
}

vi.mock('naive-ui', async (importOriginal) => {
    const original = await importOriginal()
    const { defineComponent, h } = await import('vue')
    const NPagination = defineComponent({
        name: 'NPagination',
        props: {
            page: { type: Number, default: 1 },
            pageSize: { type: Number, default: 20 },
            itemCount: { type: Number, default: 0 },
            pageSizes: { type: Array, default: () => [] },
            showSizePicker: { type: Boolean, default: false },
            size: { type: String, default: 'medium' },
        },
        emits: ['update:page', 'update:pageSize'],
        setup(props, { emit }) {
            return () => h('div', {
                class: 'n-pagination-mock',
                'data-page': props.page,
                'data-item-count': props.itemCount,
            }, [
                h('button', {
                    class: 'next-page-btn',
                    onClick: () => emit('update:page', 2),
                }, 'Next'),
            ])
        },
    })
    return {
        ...original,
        useMessage: () => message,
        NPagination,
    }
})

import AccessMailWorkbench from '../AccessMailWorkbench.vue'
import i18n from '../../i18n'

const stubs = {
    'n-select': { props: ['value', 'options'], template: '<div class="n-select-stub">{{ value }}</div>' },
    'n-input': { props: ['value'], template: '<input class="n-input-stub" :value="value" />' },
    'n-switch': { props: ['value'], template: '<input type="checkbox" class="n-switch-stub" :checked="value" />' },
    'n-button': { template: '<button v-bind="$attrs"><slot name="icon" /><slot /></button>' },
    'n-icon': { template: '<span><slot /></span>' },
    'n-popconfirm': { template: '<div><slot name="trigger" /><slot /></div>' },
    'n-checkbox': { props: ['checked'], template: '<input type="checkbox" :checked="checked" />' },
    'n-empty': { props: ['description'], template: '<div class="n-empty-stub">{{ description }}</div>' },
    'n-skeleton': { template: '<div class="n-skeleton-stub" />' },
    'n-modal': { template: '<div><slot /></div>' },
    'n-tag': { template: '<span><slot /></span>' },
    'n-space': { template: '<div><slot /></div>' },
    'n-progress': { template: '<div><slot /></div>' },
    MailContentRenderer: { props: ['mail'], template: '<div class="mail-content-renderer-stub">{{ mail?.subject }}</div>' },
    AiExtractInfo: { template: '<div />' },
}

const createSampleMail = (id, source, subject = `Subject ${id}`) => ({
    id,
    address: 'recipient@example.test',
    source,
    created_at: '2026-08-28 12:00:00',
    raw: `From: ${source}\r\nSubject: ${subject}\r\n\r\nSample body text`,
    text: 'Sample body text',
    html: '',
    message: 'Sample body text',
    messageIsHtml: false,
    attachments: [],
})

describe('AccessMailWorkbench - Friendly sender display name and RFC-5322 title', () => {
    beforeEach(() => {
        i18n.global.locale.value = 'zh'
        vi.clearAllMocks()
    })

    it('renders friendly sender display names while retaining full RFC-5322 string in title attribute', async () => {
        const mails = [
            createSampleMail(1, 'GitHub <notifications@github.com>', 'New Issue'),
            createSampleMail(2, '"Security Team" <sec@example.com>', 'Security Alert'),
            createSampleMail(3, '<noreply@example.com>', 'Automated message'),
            createSampleMail(4, 'plain@example.com', 'Plain address'),
        ]

        const fetchMailData = vi.fn().mockResolvedValue({
            results: mails,
            count: 4,
        })

        const wrapper = mount(AccessMailWorkbench, {
            props: {
                title: '收件箱',
                fetchMailData,
            },
            global: {
                plugins: [i18n],
                components: stubs,
                stubs,
            },
        })

        // Wait for onMounted fetchMailData and processItem to settle
        await vi.waitFor(() => {
            expect(wrapper.findAll('.user-mail-sender').length).toBe(4)
        })

        const senders = wrapper.findAll('.user-mail-sender')

        // 1. GitHub <notifications@github.com> -> display "GitHub", title "GitHub <notifications@github.com>"
        expect(senders[0].text()).toBe('GitHub')
        expect(senders[0].attributes('title')).toBe('GitHub <notifications@github.com>')

        // 2. "Security Team" <sec@example.com> -> display "Security Team", title 'Security Team <sec@example.com>'
        expect(senders[1].text()).toBe('Security Team')
        expect(senders[1].attributes('title')).toBe('Security Team <sec@example.com>')

        // 3. <noreply@example.com> -> display "noreply@example.com", title "noreply@example.com"
        expect(senders[2].text()).toBe('noreply@example.com')
        expect(senders[2].attributes('title')).toBe('noreply@example.com')

        // 4. plain@example.com -> display "plain@example.com", title "plain@example.com"
        expect(senders[3].text()).toBe('plain@example.com')
        expect(senders[3].attributes('title')).toBe('plain@example.com')

        wrapper.unmount()
    })
})

describe('AccessMailWorkbench - Pagination count retention across pages', () => {
    beforeEach(() => {
        i18n.global.locale.value = 'zh'
        vi.clearAllMocks()
    })

    it('preserves confirmed total count when navigating to page > 1 and backend returns count: 0', async () => {
        const page1Mails = Array.from({ length: 20 }, (_, i) =>
            createSampleMail(i + 1, `Sender ${i + 1} <sender${i + 1}@example.test>`),
        )
        const page2Mails = Array.from({ length: 20 }, (_, i) =>
            createSampleMail(i + 21, `Sender ${i + 21} <sender${i + 21}@example.test>`),
        )

        const fetchMailData = vi.fn().mockImplementation(async (limit, offset) => {
            if (offset === 0) {
                // Page 1: backend returns actual total count
                return { results: page1Mails, count: 45 }
            }
            // Page 2+ (offset > 0): backend optimizes and returns count: 0
            return { results: page2Mails, count: 0 }
        })

        const wrapper = mount(AccessMailWorkbench, {
            props: {
                title: '收件箱',
                fetchMailData,
            },
            global: {
                plugins: [i18n],
                components: stubs,
                stubs,
            },
        })

        // Initial load (Page 1) -> wait for count to be 45 and Page 1
        await vi.waitFor(() => {
            expect(wrapper.find('.n-pagination-mock').attributes('data-item-count')).toBe('45')
            expect(wrapper.find('.n-pagination-mock').attributes('data-page')).toBe('1')
            expect(wrapper.find('.panel-head b').text()).toContain('45')
        })

        // Navigate to Page 2
        await wrapper.find('.next-page-btn').trigger('click')

        // On Page 2, even though backend returned count: 0, count.value must retain 45!
        await vi.waitFor(() => {
            expect(fetchMailData).toHaveBeenCalledWith(20, 20)
            expect(wrapper.find('.n-pagination-mock').attributes('data-item-count')).toBe('45')
            expect(wrapper.find('.n-pagination-mock').attributes('data-page')).toBe('2')
            expect(wrapper.find('.panel-head b').text()).toContain('45')
        })

        wrapper.unmount()
    })

    it('correctly displays true 0 count on Page 1 for empty mailboxes', async () => {
        const fetchMailData = vi.fn().mockResolvedValue({
            results: [],
            count: 0,
        })

        const wrapper = mount(AccessMailWorkbench, {
            props: {
                title: '收件箱',
                fetchMailData,
            },
            global: {
                plugins: [i18n],
                components: stubs,
                stubs,
            },
        })

        await vi.waitFor(() => {
            expect(fetchMailData).toHaveBeenCalledWith(20, 0)
            expect(wrapper.find('.n-pagination-mock').attributes('data-item-count')).toBe('0')
            expect(wrapper.find('.panel-head b').text()).toContain('0')
            expect(wrapper.find('.empty-list').exists()).toBe(true)
        })

        wrapper.unmount()
    })
})

describe('AccessMailWorkbench - Responsive narrow screen CSS rules', () => {
    it('contains valid flex wrapping and directional rules for narrow screens in styles', () => {
        const vueFilePath = path.resolve(__dirname, '../AccessMailWorkbench.vue')
        const content = fs.readFileSync(vueFilePath, 'utf-8')

        // Must define @media (max-width: 720px)
        expect(content).toContain('@media (max-width: 720px)')

        // .panel-head in media query must use flex-wrap: wrap instead of invalid grid-template-columns
        expect(content).toMatch(/\.panel-head\s*\{[^}]*flex-wrap:\s*wrap/)

        // .panel-head .n-pagination must allow wrapping for size picker and buttons
        expect(content).toMatch(/\.panel-head\s*:deep\(\.n-pagination\)\s*\{[^}]*flex-wrap:\s*wrap/)

        // .mail-command-surface in media query must use flex-direction: column
        expect(content).toMatch(/\.mail-command-surface\s*\{[^}]*flex-direction:\s*column/)

        // Must NOT apply grid-template-columns to .panel-head or .mail-command-surface
        expect(content).not.toMatch(/\.mail-command-surface[^}]*grid-template-columns:\s*1fr/)
        expect(content).not.toMatch(/\.panel-head[^}]*grid-template-columns:\s*1fr/)
    })
})
