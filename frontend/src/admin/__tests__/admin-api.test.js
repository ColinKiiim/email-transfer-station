/** @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest'

import {
    createAdminApi,
    loadAdminSnapshot,
    loadRemainingAdminMails,
    normalizeAdminSnapshot,
} from '../admin-api'

const REQUEST_ID = '12345678-1234-4123-8123-123456789abc'
const requestIdOptions = { requestIdFactory: () => REQUEST_ID }
const write = (method, body) => ({
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: { 'x-admin-request-id': REQUEST_ID },
})

describe('admin API adapter', () => {
    it('owns login and canonical read request construction', async () => {
        const fetcher = vi.fn().mockResolvedValue({ ok: true })
        const client = createAdminApi(fetcher, requestIdOptions)

        await client.getLoginSettings()
        await client.login({ username: 'admin', passwordHash: 'fixture-hash', cfToken: 'fixture-turnstile' })
        await client.listMails({ limit: 25, offset: 50 })
        await client.getMail('mail/7')
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
            ['/api/admin/mails?limit=25&offset=50&include_raw=false'],
            ['/api/admin/mails/mail%2F7'],
            ['/api/admin/address?limit=50&offset=0'],
        ])
    })

    it('owns every supported write path and payload DTO', async () => {
        const fetcher = vi.fn().mockResolvedValue({ success: true })
        const client = createAdminApi(fetcher, requestIdOptions)

        await client.markMailRead('mail/7')
        await client.deleteMail(7)
        await client.createAddress({ name: 'qa', domain: 'example.test', enablePrefix: true, enableRandomSubdomain: false })
        await client.createShareToken(8, { label: 'readonly', expiresAt: '2026-07-16 10:00:00' })
        await client.deleteAddress(8, { credentialVersion: 2, mailCount: 3, sentCount: 4, shareCount: 1 })
        await client.getDomainImpact(9)
        await client.disableDomain(9, { configVersion: 3 })
        await client.showAddressCredential(8, 2)
        await client.rotateAddressCredential(8, 2)
        await client.revokeShareTokens(8)
        await client.clearAddressInbox(8, 3)
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
            ['/api/admin/mails/mail%2F7/read_state', write('PATCH', { read: true })],
            ['/api/admin/mails/7', write('DELETE', { confirm: true })],
            ['/api/admin/new_address', write('POST', { name: 'qa', domain: 'example.test', enablePrefix: true, enableRandomSubdomain: false })],
            ['/api/admin/address/8/share_tokens', write('POST', { label: 'readonly', scopes: ['read'], expires_at: '2026-07-16 10:00:00' })],
            ['/api/admin/delete_address/8', write('DELETE', {
                confirm: true,
                expected_credential_version: 2,
                expected_mail_count: 3,
                expected_sent_count: 4,
                expected_share_count: 1,
            })],
            ['/api/admin/domains/9/impact'],
            ['/api/admin/domains/9', write('DELETE', { config_version: 3, confirm: true })],
            ['/api/admin/address/8/credential', write('POST', { confirm: true, expected_credential_version: 2 })],
            ['/api/admin/address/8/rotate_credential', write('POST', { confirm: true, expected_credential_version: 2 })],
            ['/api/admin/address/8/share_tokens', write('DELETE', { confirm: true })],
            ['/api/admin/clear_inbox/8', write('DELETE', { confirm: true, expected_mail_count: 3 })],
            ['/api/admin/domains/9/cloudflare/check', write('POST')],
            ['/api/admin/domains/9/verify/start', write('POST', { confirm: true, config_version: 3 })],
            ['/api/admin/domains/9/verify/check', write('POST', { config_version: 3 })],
            ['/api/admin/domains/9/cloudflare/setup', write('POST', { confirm: true, config_version: 3, confirm_replace_catch_all: true })],
            ['/api/admin/domains', write('POST', {
                domain: 'example.test',
                display_label: 'Example',
                receive_mode: 'cloudflare_email',
                collector_address: '',
                cloudflare_zone_id: 'zone-fixture',
                allow_random_subdomain: true,
            })],
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

    it('returns the first mail page immediately and streams later pages separately', async () => {
        const fetcher = vi.fn(async (path) => {
            if (path === '/api/admin/mails?limit=25&offset=0&include_raw=false') {
                return { results: [{ id: 1 }], count: 75, unread_count: 3 }
            }
            if (path === '/api/admin/mails?limit=25&offset=25&include_raw=false') return { results: [{ id: 2 }] }
            if (path === '/api/admin/mails?limit=25&offset=50&include_raw=false') return { results: [] }
            if (path === '/api/admin/telegram/status') throw new Error('optional integration unavailable')
            if (path === '/api/admin/domains') {
                return { results: [{ id: 9, domain: 'example.test' }], cloudflare_automation: { has_token: false } }
            }
            return { results: [] }
        })

        const snapshot = await loadAdminSnapshot(createAdminApi(fetcher))

        expect(snapshot.mails).toEqual([{ id: 1 }])
        expect(snapshot.mailTotalCount).toBe(75)
        expect(snapshot.mailUnreadCount).toBe(3)
        expect(snapshot.domains).toEqual([{ id: 9, domain: 'example.test' }])
        expect(snapshot.errors).toEqual([])
        expect(fetcher).not.toHaveBeenCalledWith('/api/admin/mails?limit=25&offset=25&include_raw=false')

        const later = []
        await loadRemainingAdminMails(createAdminApi(fetcher), snapshot.mailTotalCount, (rows) => later.push(...rows))
        expect(later).toEqual([{ id: 2 }])
        expect(fetcher).toHaveBeenCalledWith('/api/admin/mails?limit=25&offset=50&include_raw=false')
    })
})
