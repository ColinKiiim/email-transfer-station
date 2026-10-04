import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { Hono } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';
import { authenticatorApi } from '../authenticators';
import { sqliteD1 } from './sqlite-d1';

const databases: ReturnType<typeof sqliteD1>[] = [];
afterEach(() => { for (const database of databases.splice(0)) database.sqlite.close(); });

function fixture() {
    const database = sqliteD1();
    databases.push(database);
    database.sqlite.exec(readFileSync(new URL('../../../db/schema.sql', import.meta.url), 'utf8'));
    database.sqlite.exec("INSERT INTO users (id, user_email, password) VALUES (1, 'one@example.test', 'fixture'), (2, 'two@example.test', 'fixture')");
    const app = new Hono<HonoCustomType>();
    app.use('/user_api/*', async (c, next) => {
        c.set('userPayload', { user_id: Number(c.req.header('x-fixture-user') || 1) } as UserPayload);
        await next();
    });
    app.route('/', authenticatorApi);
    const request = (path: string, method = 'GET', body?: unknown, user = 1) => app.request(path, {
        method, headers: { 'content-type': 'application/json', 'x-fixture-user': String(user) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }, { DB: database.db, TWO_FACTOR_ENCRYPTION_KEY: btoa('a'.repeat(32)) } as Bindings);
    const create = async () => {
        const response = await request('/api/admin/authenticators', 'POST', { label: 'Fixture', input: 'JBSWY3DPEHPK3PXP' });
        expect(response.status).toBe(201);
        return (await response.json() as { id: string }).id;
    };
    return { ...database, request, create };
}

describe('authenticator distribution on real SQLite', () => {
    it('creates encrypted admin resources, assigns, reads, removes only one recipient, and deletes the resource', async () => {
        const { request, create, sqlite } = fixture();
        expect((await request('/user_api/authenticators', 'POST', {})).status).toBe(403);
        const id = await create();
        expect(sqlite.prepare('SELECT secret_ciphertext FROM user_authenticators').get()?.secret_ciphertext).not.toContain('JBSWY');
        for (const user_id of [1, 2, 1]) expect((await request(`/api/admin/authenticators/${id}/assignments`, 'POST', { user_id })).status).toBe(200);
        const list = await (await request('/user_api/authenticators')).json() as any;
        expect(list.results).toHaveLength(1);
        expect(list.results[0].code).toMatch(/^\d{6}$/);
        expect((await request(`/user_api/authenticators/${id}`, 'DELETE', {})).status).toBe(400);
        await request(`/user_api/authenticators/${id}`, 'DELETE', { confirm: true });
        expect((await (await request('/user_api/authenticators')).json() as any).results).toHaveLength(0);
        expect((await (await request('/user_api/authenticators', 'GET', undefined, 2)).json() as any).results).toHaveLength(1);
        await request(`/api/admin/authenticators/${id}`, 'DELETE', { confirm: true });
        expect(sqlite.prepare('SELECT COUNT(*) AS count FROM user_authenticator_access').get()?.count).toBe(0);
        expect(sqlite.prepare('SELECT COUNT(*) AS count FROM authenticator_share_tokens').get()?.count).toBe(0);
    });

    it('saves an expiring real link and denies codes after revocation or expiry', async () => {
        const { request, create, sqlite } = fixture();
        const id = await create();
        const share = await (await request(`/api/admin/authenticators/${id}/shares`, 'POST', {})).json() as any;
        expect((await request('/open_api/authenticator_share', 'POST', { token: share.token })).status).toBe(200);
        expect((await request('/user_api/authenticators/save-share', 'POST', { token: share.token })).status).toBe(200);
        await request(`/api/admin/authenticators/${id}/shares/${share.id}`, 'DELETE', { confirm: true });
        expect((await request('/open_api/authenticator_share', 'POST', { token: share.token })).status).toBe(404);
        expect((await (await request('/user_api/authenticators')).json() as any).results).toHaveLength(0);
        sqlite.prepare("UPDATE authenticator_share_tokens SET revoked_at = NULL, expires_at = '2000-01-01 00:00:00'").run();
        expect((await request('/user_api/authenticators/save-share', 'POST', { token: share.token })).status).toBe(404);
    });

    // WP3 will replace these known gaps with executable order/cleanup regressions.
    it.todo('direct assignment survives saving and revoking a link, in both arrival orders');
    it.todo('unassignment clears only the direct source; deleting a user preserves admin resources');
});
