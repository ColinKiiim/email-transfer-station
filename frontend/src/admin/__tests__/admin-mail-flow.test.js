import { effectScope, nextTick, reactive, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
    adminQueryTokens,
    buildAdminDisplayMail,
    buildAdminMailHierarchy,
    buildAdminMailRail,
    buildAdminRendererMail,
    filterAdminRows,
    normalizeAdminMailRows,
    normalizeUnknownMailRows,
    useAdminMailFlow,
} from '../admin-mail-flow'

const scopes = []

afterEach(() => {
    scopes.splice(0).forEach((scope) => scope.stop())
})

const rawMail = (id = 7, overrides = {}) => ({
    id,
    address: 'ops@example.test',
    source: 'smtp-gateway',
    raw: `From: Sender <sender@example.test>\r\nSubject: Invoice ${id}\r\n\r\nFixture body`,
    created_at: '2026-07-15 10:00:00',
    unread: true,
    attachments: [{ filename: 'invoice.pdf' }],
    ...overrides,
})

describe('admin mail-flow model', () => {
    it('normalizes canonical and unknown mail rows without view state', () => {
        const [row] = normalizeAdminMailRows([rawMail()])
        const [unknown] = normalizeUnknownMailRows([{
            id: 9,
            original_recipient: 'missing@example.test',
            raw: 'Subject: Unknown fixture\r\n\r\nUnknown body',
        }])

        expect(row).toMatchObject({
            id: 'mail-7',
            sourceId: 7,
            sender: 'Sender <sender@example.test>',
            to: 'ops@example.test',
            domain: 'example.test',
            subject: 'Invoice 7',
            unread: true,
            attachmentCount: 1,
            attachmentLabel: '1 个附件',
        })
        expect(unknown).toMatchObject({
            id: 'unknown-9',
            title: 'Unknown fixture',
            owner: 'missing@example.test',
            domain: 'example.test',
            status: '未知地址',
            statusKey: 'unknown',
            statusTone: 'danger',
        })
    })

    it('applies structured query, scope, and status filters', () => {
        const rows = normalizeAdminMailRows([
            rawMail(1),
            rawMail(2, {
                address: 'archive@other.test',
                sender: 'Elsewhere <else@example.test>',
                subject: 'Read notice',
                unread: false,
                is_read: true,
                attachments: [],
            }),
        ])

        expect(adminQueryTokens('from:sender "Invoice 1"')).toEqual(['from:sender', 'invoice 1'])
        expect(filterAdminRows(rows, {
            query: 'from:sender has:attachment',
            domain: 'example.test',
            address: 'all',
            status: 'unread',
        }, 'flow')).toEqual([rows[0]])
        expect(filterAdminRows(rows, {
            query: 'is:read',
            domain: 'all',
            address: 'archive@other.test',
            status: 'all',
        }, 'flow')).toEqual([rows[1]])
    })

    it('builds queue and domain counts from normalized rows', () => {
        const mails = normalizeAdminMailRows([
            rawMail(1),
            rawMail(2, { address: 'team@example.test', attachments: [] }),
        ])
        const hierarchy = buildAdminMailHierarchy({
            mails,
            unknownMails: [{ id: 'unknown-1' }],
            domains: [{ id: 'domain-1', domain: 'example.test', mails: 99 }],
            addresses: ['all', 'ops@example.test', 'team@example.test'],
            totalCount: 12,
            unreadCount: 2,
        })

        expect(hierarchy.queues.map((row) => row.count)).toEqual([12, 2, 2, 1, 1])
        expect(hierarchy.domains[0]).toMatchObject({
            domain: 'example.test',
            mails: 2,
            addresses: [
                { address: 'ops@example.test', count: 1 },
                { address: 'team@example.test', count: 1 },
            ],
        })
    })

    it('separates parsed display data from renderer input', () => {
        const [row] = normalizeAdminMailRows([rawMail()])
        const display = buildAdminDisplayMail(row, {
            subject: 'Parsed invoice',
            source: 'Parsed sender',
            html: '<p>Parsed body</p>',
            message: '<p>Parsed body</p>',
            messageIsHtml: true,
            attachments: [{ filename: 'parsed.pdf' }],
        })

        expect(display).toMatchObject({
            subject: 'Parsed invoice',
            sender: 'Parsed sender',
            messageIsHtml: true,
            attachmentLabel: '1 个附件',
        })
        expect(buildAdminRendererMail(display, 'html')).toMatchObject({
            id: 7,
            source: 'Parsed sender',
            address: 'ops@example.test',
            text: '',
            messageIsHtml: true,
        })
        expect(buildAdminMailRail(display)).toMatchObject({
            title: '邮件详情',
            subtitle: 'Parsed invoice',
            tags: expect.arrayContaining(['HTML 已隔离渲染', '1 个附件']),
            mail: display,
        })
        expect(buildAdminMailRail(null)).toMatchObject({ empty: true, title: '选择一封邮件' })
    })

    it('caches MIME parsing and owns adjacent-selection and filter actions', async () => {
        const source = ref([rawMail(1), rawMail(2)])
        const ui = reactive({
            view: 'flow',
            query: '',
            domain: 'all',
            address: 'all',
            status: 'all',
            flowMode: 'detail',
            detailKind: 'flow',
            mailRenderMode: 'text',
            selected: { flow: 'mail-1', exception: '' },
        })
        const parseItem = vi.fn().mockResolvedValue({
            subject: 'Parsed fixture',
            html: '<p>Parsed</p>',
            message: '<p>Parsed</p>',
            messageIsHtml: true,
            attachments: [],
        })
        const selectMail = vi.fn()
        const syncRoute = vi.fn()
        const onSelectionMissing = vi.fn()
        const scope = effectScope()
        scopes.push(scope)
        const flow = scope.run(() => useAdminMailFlow({
            getMails: () => source.value,
            getUnknownMails: () => [],
            ui,
            activeView: ref('flow'),
            parseItem,
            resetListScroll: vi.fn(),
            syncRoute,
            replaceRouteQuery: vi.fn(),
            persistView: vi.fn(),
            selectMail,
            onSelectionMissing,
            onParseError: vi.fn(),
        }))

        await nextTick()
        await Promise.resolve()
        await nextTick()
        expect(parseItem).toHaveBeenCalledTimes(1)
        expect(flow.currentDisplayMail.value.subject).toBe('Parsed fixture')
        expect(ui.mailRenderMode).toBe('html')

        await flow.parseAdminMailDetail(flow.currentMail.value)
        expect(parseItem).toHaveBeenCalledTimes(1)
        flow.selectAdjacentMail(1)
        expect(selectMail).toHaveBeenCalledWith('mail-2')

        flow.setMailAddress('ops@example.test')
        expect(syncRoute).toHaveBeenCalledWith(expect.objectContaining({
            address: 'ops@example.test',
            domain: 'example.test',
        }))

        source.value = [rawMail(2)]
        await nextTick()
        expect(ui.selected.flow).toBe('')
        expect(onSelectionMissing).toHaveBeenCalledTimes(1)
    })
})
