import { describe, expect, it } from 'vitest'

import {
    adminMailCacheKey,
    cellText,
    clampNumber,
    cleanMailPreview,
    compactRaw,
    compactText,
    extractHeader,
    formatAddressCredential,
    formatAttachmentCount,
    formatBadgeCount,
    formatDate,
    formatSenderDisplay,
    formatShortDate,
    getDomain,
    mailRenderLabel,
    modeLabel,
    normalizedAttachments,
    queryValue,
    setupLabel,
    statusClass,
    stripHtml,
    toD1DateTime,
} from '../admin-formatters'
import {
    ACCESS_STATUS_OPTIONS,
    ICON_SHAPES,
    NAV_GROUPS,
    TABLE_SPECS,
    VIEW_META,
} from '../admin-view-config'

describe('admin view configuration', () => {
    it('defines every navigation target exactly once with a view and icon', () => {
        const items = NAV_GROUPS.flatMap((group) => group.items)
        const ids = items.map((item) => item.id)

        expect(new Set(ids).size).toBe(ids.length)
        expect(ids.sort()).toEqual(Object.keys(VIEW_META).sort())
        expect(items.every((item) => ICON_SHAPES[item.icon]?.length > 0)).toBe(true)
    })

    it('keeps data-table column labels unique within each table', () => {
        for (const columns of Object.values(TABLE_SPECS)) {
            const labels = columns.map((column) => column.labelKey)
            expect(new Set(labels).size).toBe(labels.length)
        }
    })

    it('keeps access filters explicit', () => {
        expect(ACCESS_STATUS_OPTIONS).toEqual(['all', 'active', 'success'])
    })
})

describe('admin pure formatters', () => {
    it('normalizes route query values without browser state', () => {
        expect(queryValue(['flow', 'ignored'])).toBe('flow')
        expect(queryValue('', 'all')).toBe('all')
        expect(queryValue(7)).toBe('7')
        expect(clampNumber(900, 180, 820)).toBe(820)
    })

    it('normalizes domains and backend labels', () => {
        expect(getDomain('Owner@Example.TEST')).toBe('example.test')
        expect(getDomain('not-an-address')).toBe('')
        expect(modeLabel('cloudflare_email')).toBe('Cloudflare Email Routing')
        expect(modeLabel('custom')).toBe('custom')
        expect(setupLabel('pending_verification')).toBe('需验证')
        expect(setupLabel()).toBe('需复核')
    })

    it('classifies status text with destructive states taking precedence', () => {
        expect(statusClass('active')).toBe('ok')
        expect(statusClass('待复核')).toBe('warn')
        expect(statusClass('待关闭')).toBe('danger')
        expect(statusClass('unknown')).toBe('neutral')
    })

    it('formats empty cells, badge counts and timestamps', () => {
        expect(cellText({}, 'name')).toBe('-')
        expect(cellText({ count: 0 }, 'count')).toBe(0)
        expect(formatBadgeCount(99)).toBe('99')
        expect(formatBadgeCount(100)).toBe('99+')
        expect(formatDate('2026-07-15T11:22:33.123Z')).toBe('2026-07-15 11:22:33')
        expect(formatShortDate('2026-07-15T11:22:33Z')).toBe('07-15 11:22')
    })

    it('extracts headers and converts HTML to preview text', () => {
        const raw = 'From: sender@example.test\r\nSubject: Fixture\r\n\r\nBody'
        expect(extractHeader(raw, 'subject')).toBe('Fixture')
        expect(stripHtml('<style>x</style><b>A&amp;B</b><script>bad()</script>')).toBe('  A&B  ')
        expect(compactText(' A  B\n\n\nC ')).toBe('A B\n\nC')
        expect(compactRaw(raw)).toBe('Body')
    })

    it('sanitizes mail preview text from entities and zero-width markers', () => {
        expect(cleanMailPreview('Hello &nbsp; world &zwnj;!', '')).toBe('Hello world !')
        expect(cleanMailPreview('', '<p>Welcome &amp; join&#8204;us &#x200C;today!</p>')).toBe('Welcome & joinus today!')
        expect(cleanMailPreview('', '<p>Sign &nbsp;&zwnj; up &zwnj; now</p>')).toBe('Sign up now')
        expect(cleanMailPreview('\u200B\uFEFFImportant notice\u200D', '')).toBe('Important notice')
        expect(cleanMailPreview('', '', compactRaw('From: a@b.c\r\n\r\nFallback message'))).toBe('Fallback message')
        expect(cleanMailPreview('', '', '')).toBe('')
    })

    it('formats RFC-5322 senders into friendly display names', () => {
        expect(formatSenderDisplay('GitHub <notifications@github.com>')).toBe('GitHub')
        expect(formatSenderDisplay('"GitHub Support" <support@github.com>')).toBe('GitHub Support')
        expect(formatSenderDisplay("'Security Team' <sec@example.com>")).toBe('Security Team')
        expect(formatSenderDisplay('"Doe, Jane" <jane@example.com>')).toBe('Doe, Jane')
        expect(formatSenderDisplay('<bare@example.com>')).toBe('bare@example.com')
        expect(formatSenderDisplay('bare@example.com')).toBe('bare@example.com')
        expect(formatSenderDisplay('"" <bare@example.com>')).toBe('bare@example.com')
        expect(formatSenderDisplay('')).toBe('')
        expect(formatSenderDisplay(null)).toBe('')
        expect(formatSenderDisplay('(未知发件人)')).toBe('(未知发件人)')
    })

    it('normalizes attachment summaries and render labels', () => {
        const attachments = [{ filename: 'a.txt' }]
        expect(normalizedAttachments(attachments)).toBe(attachments)
        expect(normalizedAttachments(2)).toEqual([
            { filename: 'attachment-1', size: 0 },
            { filename: 'attachment-2', size: 0 },
        ])
        expect(formatAttachmentCount(0)).toBe('无附件')
        expect(formatAttachmentCount(2)).toBe('2 个附件')
        expect(mailRenderLabel({ html: '<p>x</p>', text: 'x' })).toBe('HTML 已隔离渲染')
        expect(mailRenderLabel({ parseStatus: 'parsed' })).toBe('已解析')
    })

    it('formats cache keys, one-time credentials and D1 timestamps', () => {
        expect(adminMailCacheKey({ sourceId: 12, id: 'mail-local' })).toBe('12')
        expect(adminMailCacheKey({ id: 'mail-local' })).toBe('mail-local')
        expect(formatAddressCredential('qa@example.test', 'fixture jwt', '', 'https://mail.example.test'))
            .toBe('地址: qa@example.test\nJWT: fixture jwt\n登录链接: https://mail.example.test/?jwt=fixture%20jwt')
        expect(toD1DateTime('2026-07-15T11:22')).toBe('2026-07-15 11:22:00')
        expect(toD1DateTime('')).toBeNull()
    })
})
