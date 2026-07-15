/** @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest'

import { createAdminApi, loadAdminSnapshot, normalizeAdminSnapshot } from '../admin-api'

describe('admin API adapter', () => {
    it('owns login and canonical read request construction', async () => {
        const fetcher = vi.fn().mockResolvedValue({ ok: true })
        const client = createAdminApi(fetcher)

        await client.getLoginSettings()
        await client.login({ username: 'admin', passwordHash: 'fixture-hash', cfToken: 'fixture-turnstile' })
        await client.listMails({ limit: 25, offset: 50 })
        await client.listAddresses()

        expect(fetcher.mock.calls).toEqual([
            ['/open_api/admin_login_settings'],
            ['/open_api/admin_login', {
                method: 'POST',
                body: JSON.stringify({
                    username: 'admin',
                    password: 'fixture-hash',
                    cf_token: 'fixture-turnstile',
                }),
            }],
            ['/api/admin/mails?limit=25&offset=50'],
            ['/api/admin/address?limit=50&offset=0'],
        ])
    })

    it('owns every supported write path and payload DTO', async () => {
        const fetcher = vi.fn().mockResolvedValue({ success: true })
        const client = createAdminApi(fetcher)

        await client.markMailRead('mail/7')
        await client.deleteMail(7)
        await client.createAddress({ name: 'qa', domain: 'example.test', enablePrefix: true, enableRandomSubdomain: false })
        await client.createShareToken(8, { label: 'readonly', expiresAt: '2026-07-16 10:00:00' })
        await client.deleteAddress(8)
        await client.getDomainImpact(9)
        await client.disableDomain(9, { configVersion: 3 })
        await client.showAddressCredential(8)
        await client.rotateAddressCredential(8)
        await client.revokeShareTokens(8)
        await client.clearAddressInbox(8)
        await client.checkCloudflareDomain(9)
        await client.startDomainVerification(9, 3)
        await client.checkDomainVerification(9, 3)
        await client.setupCloudflareDomain(9, { configVersion: 3, confirmReplaceCatchAll: true })
        await client.createDomain({
            domain: 'example.test',
            displayLabel: 'Example',
            receiveMode: 'cloudflare_email',
            collectorAddress: '',
            cloudflareZoneId: 'zone-fixture',
            allowRandomSubdomain: true,
        })

        expect(fetcher.mock.calls).toEqual([
            ['/api/admin/mails/mail%2F7/read_state', { method: 'PATCH', body: '{"read":true}' }],
            ['/api/admin/mails/7', { method: 'DELETE' }],
            ['/api/admin/new_address', { method: 'POST', body: '{"name":"qa","domain":"example.test","enablePrefix":true,"enableRandomSubdomain":false}' }],
            ['/api/admin/address/8/share_tokens', { method: 'POST', body: '{"label":"readonly","scopes":["read"],"expires_at":"2026-07-16 10:00:00"}' }],
            ['/api/admin/delete_address/8', { method: 'DELETE' }],
            ['/api/admin/domains/9/impact'],
            ['/api/admin/domains/9', { method: 'DELETE', body: '{"config_version":3,"confirm":true}' }],
            ['/api/admin/show_password/8'],
            ['/api/admin/address/8/rotate_credential', { method: 'POST' }],
            ['/api/admin/address/8/share_tokens', { method: 'DELETE' }],
            ['/api/admin/clear_inbox/8', { method: 'DELETE' }],
            ['/api/admin/domains/9/cloudflare/check', { method: 'POST' }],
            ['/api/admin/domains/9/verify/start', { method: 'POST', body: '{"config_version":3}' }],
            ['/api/admin/domains/9/verify/check', { method: 'POST', body: '{"config_version":3}' }],
            ['/api/admin/domains/9/cloudflare/setup', { method: 'POST', body: '{"config_version":3,"confirm_replace_catch_all":true}' }],
            ['/api/admin/domains', { method: 'POST', body: '{"domain":"example.test","display_label":"Example","receive_mode":"cloudflare_email","collector_address":"","cloudflare_zone_id":"zone-fixture","allow_random_subdomain":true}' }],
        ])
    })
})

describe('admin snapshot DTO', () => {
    it('normalizes response envelopes and keeps finite counts only', () => {
        expect(normalizeAdminSnapshot({
            domains: { results: [{ id: 1 }], cloudflare_automation: { has_token: true } },
            mails: { results: [{ id: 2 }], count: '4', unread_count: undefined },
            addresses: { results: 'invalid' },
        }, ['fixture error'])).toMatchObject({
            domains: [{ id: 1 }],
            domainAutomation: { has_token: true },
            mails: [{ id: 2 }],
            mailTotalCount: 4,
            mailUnreadCount: null,
            addresses: [],
            errors: ['fixture error'],
        })
    })

    it('loads paginated mail data, keeps partial pages, and suppresses optional Telegram errors', async () => {
        const fetcher = vi.fn(async (path) => {
            if (path === '/api/admin/mails?limit=100&offset=0') {
                return { results: [{ id: 1 }], count: 250, unread_count: 3 }
            }
            if (path === '/api/admin/mails?limit=100&offset=100') return { results: [{ id: 2 }] }
            if (path === '/api/admin/mails?limit=100&offset=200') throw new Error('third page unavailable')
            if (path === '/api/admin/telegram/status') throw new Error('optional integration unavailable')
            if (path === '/api/admin/domains') {
                return { results: [{ id: 9, domain: 'example.test' }], cloudflare_automation: { has_token: false } }
            }
            return { results: [] }
        })

        const snapshot = await loadAdminSnapshot(createAdminApi(fetcher))

        expect(snapshot.mails).toEqual([{ id: 1 }, { id: 2 }])
        expect(snapshot.mailTotalCount).toBe(250)
        expect(snapshot.mailUnreadCount).toBe(3)
        expect(snapshot.domains).toEqual([{ id: 9, domain: 'example.test' }])
        expect(snapshot.errors).toEqual(['mails: third page unavailable'])
        expect(fetcher).toHaveBeenCalledWith('/api/admin/mails?limit=100&offset=200')
    })
})
