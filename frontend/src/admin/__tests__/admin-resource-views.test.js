import { describe, expect, it } from 'vitest'

import {
    buildAdminAddressRail,
    buildAdminAddressRows,
    buildAdminAuditRows,
    buildAdminExceptionRail,
    buildAdminProcessingRows,
    buildAdminShareRows,
    buildAdminUserRows,
} from '../admin-identity-access'
import {
    buildAdminNotificationRail,
    buildAdminNotificationRows,
    buildAdminOpsBoundaryItems,
    buildAdminOpsRail,
    buildAdminOpsRows,
    buildAdminSendBoxRows,
    buildAdminSenderAccessRows,
    buildAdminStateCards,
} from '../admin-operations-delivery'
import {
    buildAdminDomainRail,
    buildAdminDomainRows,
    buildAdminRouteRows,
    buildRoutingActivationRows,
} from '../admin-routing-domain'

describe('admin routing and domain view models', () => {
    it('uses canonical domains and merges overview counts before mail counts', () => {
        const rows = buildAdminDomainRows({
            domains: [{
                id: 7,
                domain: 'example.test',
                display_label: 'Primary',
                source: 'database',
                receive_mode: 'cloudflare_email',
                setup_status: 'active',
                enabled: true,
                allow_address_creation: true,
                is_default: true,
                cloudflare_zone_id: 'zone-id',
                can_auto_setup_cloudflare: true,
                last_verified_at: '2026-07-15 10:00:00',
            }],
            overviewDomains: [{ domain: 'example.test', address_count: 4, mail_count: 9 }],
            mailDomains: [{ domain: 'example.test', address_count: 8, mail_count: 18 }],
            openSettings: { domains: [{ value: 'fallback.test' }] },
        })

        expect(rows).toEqual([expect.objectContaining({
            id: 'domain-7',
            domain: 'example.test',
            label: 'Primary',
            mode: 'Cloudflare Email Routing',
            setup: '已验证',
            enabled: '启用',
            addresses: 4,
            mails: 9,
            auth: 'Cloudflare token ready',
        })])

        const routes = buildAdminRouteRows(rows, { enabled: true })
        expect(routes).toHaveLength(2)
        expect(routes[0]).toMatchObject({ domain: 'example.test', status: '启用' })
        expect(routes[1]).toMatchObject({ type: 'Webhook', status: '启用', inUse: 1 })

        expect(buildRoutingActivationRows(rows, { has_token: true }))
            .toEqual(expect.arrayContaining([
                expect.objectContaining({ code: '01', state: '可用', tone: 'ok' }),
                expect.objectContaining({ code: '02', state: '已验证', tone: 'ok' }),
            ]))
        expect(buildAdminDomainRail(rows[0])).toMatchObject({
            title: '域名详情',
            subtitle: 'example.test',
            actions: expect.arrayContaining([expect.objectContaining({ action: 'cloudflare-setup' })]),
        })
    })

    it('falls back to public registry data only when canonical domains are absent', () => {
        const [registry] = buildAdminDomainRows({
            openSettings: {
                domainRegistry: [{
                    domain: 'registry.test',
                    receive_mode: 'improvmx_forward',
                    setup_status: 'pending_verification',
                    collector_address: 'collector@registry.test',
                }],
            },
        })
        expect(registry).toMatchObject({
            id: 'registry-registry.test',
            mode: 'ImprovMX free forwarding',
            setup: '需验证',
            collector: 'collector@registry.test',
        })

        const [legacy] = buildAdminDomainRows({
            openSettings: {
                domains: [{ value: 'legacy.test', label: 'Legacy' }],
                defaultDomains: ['legacy.test'],
            },
        })
        expect(legacy).toMatchObject({
            id: 'open-legacy.test',
            label: 'Legacy',
            creation: '允许创建',
            default: '默认',
        })
        expect(buildAdminDomainRail(null)).toBeNull()
    })
})

describe('admin identity and access view models', () => {
    it('normalizes address, access, user and audit records', () => {
        const [address] = buildAdminAddressRows([{
            id: 3,
            name: 'Owner@Example.TEST',
            labels: ['vip', { name: 'ops' }],
            user_id: 8,
            mail_count: 12,
            send_count: 2,
            active_share_token_count: 1,
            credential_version: 4,
            owner_note: 'Primary inbox',
        }], true)
        expect(address).toMatchObject({
            id: 'addr-3',
            domain: 'example.test',
            owner: 'user:8',
            tags: ['vip', 'ops'],
            mails: 12,
            credential: 'v4',
            password: '启用',
        })

        expect(buildAdminShareRows([{
            id: 5,
            address: 'owner@example.test',
            scopes: 'read,download',
            status: 'active',
            expires_at: '2026-07-16T01:02:03Z',
        }])[0]).toMatchObject({
            id: 'pkg-5',
            label: '访问包 #5',
            expires: '2026-07-16 01:02:03',
            path: '/i/:token',
        })
        expect(buildAdminUserRows([{ id: 2, username: 'operator', role: 'admin', address_count: 3 }])[0])
            .toMatchObject({ id: 'user-2', user: 'operator', role: 'admin', addresses: '3 个地址', status: '启用' })

        const audit = buildAdminAuditRows(
            [{ id: 1, created_at: '2026-07-15T10:00:00Z', actor_label: 'admin', action: 'create', resource_label: 'address', status: 'success' }],
            [{ id: 2, created_at: '2026-07-15T11:00:00Z', actor_type: 'token', event_type: 'read', resource_type: 'mail', status: 'active' }],
        )
        expect(audit.map((row) => row.id)).toEqual(['audit-1', 'access-2'])
        expect(buildAdminProcessingRows(audit)[0]).toMatchObject({
            id: 'log-audit-1',
            event: 'create',
            detail: 'address',
            inbox: 'admin',
        })
    })

    it('builds focused address and exception detail rails', () => {
        const address = buildAdminAddressRows([{ id: 1, name: 'qa@example.test' }])[0]
        expect(buildAdminAddressRail(address)).toMatchObject({
            title: '地址详情',
            subtitle: 'qa@example.test',
            actions: expect.arrayContaining([
                expect.objectContaining({ action: 'show-credential', primary: true }),
                expect.objectContaining({ action: 'delete-address', danger: true }),
            ]),
        })
        expect(buildAdminExceptionRail({
            title: 'Unknown fixture',
            owner: 'missing@example.test',
            domain: 'example.test',
            level: 'P1',
            status: '未知地址',
            detail: 'No matching address',
        })).toMatchObject({
            title: '异常邮件',
            tags: ['P1', '未知地址', '未知收件人'],
            body: 'No matching address',
        })
        expect(buildAdminAddressRail(null)).toBeNull()
        expect(buildAdminExceptionRail(null)).toBeNull()
    })
})

describe('admin operations and delivery view models', () => {
    it('normalizes sender access, sendbox and notification channels', () => {
        expect(buildAdminSenderAccessRows([{
            id: 4,
            address: 'sender@example.test',
            balance: '8',
            enabled: 0,
            created_at: '2026-07-15T09:00:00Z',
        }])[0]).toMatchObject({
            id: 'sender-4',
            balance: 8,
            status: '关闭',
            note: '发送权限已关闭',
        })

        const [mail] = buildAdminSendBoxRows([{
            id: 6,
            address: 'sender@example.test',
            created_at: '2026-07-15T09:10:00Z',
            raw: 'From: Sender <sender@example.test>\r\nTo: receiver@example.test\r\nSubject: Fixture\r\n\r\nBody text',
        }])
        expect(mail).toMatchObject({
            id: 'sendbox-6',
            sender: 'Sender <sender@example.test>',
            to: 'receiver@example.test',
            domain: 'example.test',
            subject: 'Fixture',
            body: 'Body text',
            result: '已发送',
        })

        const notifications = buildAdminNotificationRows({
            mailWebhook: { enabled: true, url: 'https://hooks.example.test/inbound' },
            telegram: { ok: true },
            aiSettings: { enabled: false },
            enableSendMail: true,
        })
        expect(notifications.map((row) => row.status)).toEqual(['可用', '可用', '可用', '灰度中'])
        expect(buildAdminNotificationRail(notifications[0])).toMatchObject({
            title: '通道详情',
            subtitle: '邮件 Webhook',
        })
        expect(buildAdminNotificationRail(null)).toBeNull()
    })

    it('derives operational states, overview cards and detail rails', () => {
        const ops = buildAdminOpsRows({
            workerConfig: {
                DIAGNOSTICS: {
                    bindings: { KV: true, DB: true },
                    database: { current_version: 9, code_version: 9, need_migration: false },
                },
            },
            dbVersion: { current_db_version: 9, code_db_version: 9 },
            showAdminPage: true,
        })
        expect(ops.slice(0, 3).map((row) => row.status)).toEqual(['可用', '可用', '可用'])
        expect(buildAdminOpsBoundaryItems(ops)).toEqual([
            { label: 'Worker', value: '可用' },
            { label: 'D1', value: '可用' },
            { label: 'KV', value: '可用' },
            { label: 'Pages', value: '-' },
        ])
        expect(buildAdminOpsRail(ops)).toMatchObject({
            title: '运行边界',
            kv: expect.arrayContaining([['D1', '可用']]),
        })

        expect(buildAdminStateCards({
            workerConfig: { DIAGNOSTICS: { database: { ok: true } } },
            workerStatusLabel: 'healthy',
            showAdminPage: true,
            mailTotalCount: undefined,
            mailRowCount: 7,
            mailWebhook: { enabled: false },
        })).toEqual([
            { value: 'healthy', label: 'Worker / D1', tone: 'ok' },
            { value: '7', label: '邮件总数', tone: 'ok' },
            { value: '通知通道需复核', label: '通知通道', tone: 'warn' },
        ])
    })
})
