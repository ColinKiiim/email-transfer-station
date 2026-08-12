/*
 * Guards the boundary between a status's *meaning* and its *display text*.
 *
 * The admin console previously derived badge colour by regex-matching Chinese
 * display strings, and filtered rows by substring-matching the same strings.
 * That made translation a behavioural change: rendering "Saved" instead of
 * "已保存" would silently turn the badge grey and drop the row out of its
 * filter. These tests fail if that coupling is reintroduced.
 */
import { describe, expect, it } from 'vitest'

import { statusClass } from '../admin-formatters'
import { filterAdminRows, normalizeAdminMailRows, normalizeUnknownMailRows } from '../admin-mail-flow'
import { buildAdminDomainRows } from '../admin-routing-domain'
import { FLOW_STATUS_OPTIONS } from '../admin-view-config'

const rawMail = (id, overrides = {}) => ({
    id,
    address: 'ops@example.test',
    source: 'smtp-gateway',
    raw: `From: s@example.test\r\nSubject: Mail ${id}\r\n\r\nbody`,
    created_at: '2026-07-15 10:00:00',
    ...overrides,
})

const filters = (status) => ({ query: '', domain: 'all', address: 'all', status })

describe('status semantics are independent of display text', () => {
    it('exposes only ASCII filter keys, so URLs and filters survive translation', () => {
        for (const option of FLOW_STATUS_OPTIONS) {
            expect(option).toMatch(/^[a-z]+$/)
        }
        expect(FLOW_STATUS_OPTIONS).toContain('unread')
        expect(FLOW_STATUS_OPTIONS).toContain('saved')
        expect(FLOW_STATUS_OPTIONS).toContain('unknown')
    })

    it('carries a semantic key and tone next to every mail status label', () => {
        const [saved] = normalizeAdminMailRows([rawMail(1, { unread: true })])
        expect(saved.resultKey).toBe('saved')
        expect(saved.resultTone).toBe('ok')
        expect(saved.isSaved).toBe(true)
        expect(saved.statusTokens).toContain('saved')
        expect(saved.statusTokens).toContain('unread')

        const [unknown] = normalizeAdminMailRows([rawMail(2, { address: null, original_recipient: null })])
        expect(unknown.resultKey).toBe('unknown')
        expect(unknown.resultTone).toBe('danger')
        expect(unknown.isSaved).toBe(false)

        const [orphan] = normalizeUnknownMailRows([{ id: 9, address: 'missing@example.test' }])
        expect(orphan.statusKey).toBe('unknown')
        expect(orphan.statusTone).toBe('danger')
    })

    it('filters by semantic token, not by the localised label', () => {
        const rows = normalizeAdminMailRows([
            rawMail(1, { unread: true }),
            rawMail(2, { is_read: true, read_at: '2026-07-15 11:00:00' }),
            rawMail(3, { attachments: [{ filename: 'a.pdf' }] }),
        ])
        expect(filterAdminRows(rows, filters('unread'), 'flow')).toHaveLength(1)
        expect(filterAdminRows(rows, filters('read'), 'flow')).toHaveLength(1)
        expect(filterAdminRows(rows, filters('attachment'), 'flow')).toHaveLength(1)
        expect(filterAdminRows(rows, filters('all'), 'flow')).toHaveLength(3)

        // Translating the label must not change the result set.
        const translated = rows.map((row) => ({ ...row, result: 'Saved', risk: 'Rendered' }))
        expect(filterAdminRows(translated, filters('unread'), 'flow')).toHaveLength(1)
        expect(filterAdminRows(translated, filters('saved'), 'flow')).toHaveLength(3)
    })

    it('gives domain rows a boolean and a tone rather than a Chinese label to compare against', () => {
        const rows = buildAdminDomainRows({
            domains: [
                { id: 1, domain: 'a.test', enabled: true, receive_mode: 'cloudflare_email', setup_status: 'ready' },
                { id: 2, domain: 'b.test', enabled: false, receive_mode: 'cloudflare_email', setup_status: 'ready' },
            ],
            overviewDomains: [],
            mailDomains: [],
            openSettings: { domains: [] },
        })
        const [on, off] = rows
        expect(on.isEnabled).toBe(true)
        expect(on.enabledTone).toBe('ok')
        expect(off.isEnabled).toBe(false)
        expect(off.enabledTone).toBe('danger')
    })

    it('passes an explicit tone straight through instead of re-deriving it from text', () => {
        expect(statusClass('ok')).toBe('ok')
        expect(statusClass('danger')).toBe('danger')
        expect(statusClass('warn')).toBe('warn')
        expect(statusClass('neutral')).toBe('neutral')
        // An English label the legacy heuristic cannot classify still resolves
        // correctly when the row supplies its tone.
        expect(statusClass('Saved')).toBe('neutral')
        expect(statusClass('ok')).toBe('ok')
    })
})
