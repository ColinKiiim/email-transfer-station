import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { Hono } from 'hono';
import { Jwt } from 'hono/utils/jwt';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api as auth } from '../open_api/auth';
import { adminAuthMiddleware } from '../admin_security';
import { ADMIN_BROWSER_SESSION_SECONDS } from '../admin_browser_session';
import { corsPolicy } from '../cors_policy';
import { hashPassword } from '../utils';
import { hashShareToken } from '../share_tokens';
import { sqliteD1 } from './sqlite-d1';

const app = new Hono<HonoCustomType>();
app.use('*', corsPolicy).route('/', auth);
app.use('/api/admin/*', adminAuthMiddleware).get('/api/admin/check', c => c.json({ ok: true }));
let database: ReturnType<typeof sqliteD1>;
let env: Bindings;
let pending: Promise<unknown>[];
const call = (path: string, cookie = '', headers: Record<string, string> = {}, body = '{}') => app.fetch(
    new Request(`https://mail.example.test${path}`, {
        method: path === '/api/admin/check' ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, ...headers }, body: path === '/api/admin/check' ? undefined : body,
    }), env, { waitUntil: (promise: Promise<unknown>) => { pending.push(promise); }, passThroughOnException() {} } as unknown as ExecutionContext,
);
const login = async () => {
    const response = await call('/open_api/admin_login', '', {}, JSON.stringify({ username: 'admin', password: await hashPassword('fixture-password') }));
    expect(response.status).toBe(200);
    const cookie = response.headers.get('set-cookie')!.split(';')[0];
    return { response, cookie, token: (await response.json() as { token: string }).token };
};

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-05T00:00:00Z'));
    database = sqliteD1();
    database.sqlite.exec(readFileSync(new URL('../../../db/schema.sql', import.meta.url), 'utf8'));
    env = { DB: database.db, JWT_SECRET: 'fixture-secret', ADMIN_PASSWORDS: ['fixture-password'], DEFAULT_LANG: 'en' } as unknown as Bindings;
    pending = [];
});
afterEach(async () => { await Promise.all(pending); database.sqlite.close(); vi.useRealTimers(); });

describe('persistent administrator session', () => {
    it('restores across tabs and expired access tokens, rolls beyond 90 days, and revokes immediately on logout', async () => {
        const { response, cookie, token } = await login();
        expect(response.headers.get('set-cookie')).toContain('HttpOnly');
        expect(response.headers.get('set-cookie')).toContain('Secure');
        expect(response.headers.get('set-cookie')).toContain('SameSite=Lax');
        expect(response.headers.get('set-cookie')).toContain(`Max-Age=${ADMIN_BROWSER_SESSION_SECONDS}`);
        expect(response.headers.get('cache-control')).toBe('no-store');
        const claims = await Jwt.verify(token, env.JWT_SECRET, 'HS256');
        expect(Number(claims.exp) - Number(claims.iat)).toBe(3600);
        expect(claims.browser_session_id).toBe(await hashShareToken(cookie.split('=')[1]));
        // The persistent cookie cannot authorize a privileged API by itself.
        expect((await call('/api/admin/check', cookie)).status).toBe(401);
        expect((await call('/api/admin/check', '', { 'x-admin-auth': token })).status).toBe(200);
        vi.setSystemTime(Date.now() + 2 * 3600 * 1000);
        expect((await call('/api/admin/check', '', { 'x-admin-auth': token })).status).toBe(401);
        let restored = await call('/open_api/admin_session', cookie);
        expect(restored.status).toBe(200);
        let current = (await restored.json() as { token: string }).token;
        expect((await call('/api/admin/check', '', { 'x-admin-auth': current })).status).toBe(200);
        for (let i = 0; i < 4; i++) {
            vi.setSystemTime(Date.now() + 30 * 24 * 3600 * 1000);
            restored = await call('/open_api/admin_session', cookie);
            expect(restored.status).toBe(200);
            current = (await restored.json() as { token: string }).token;
        }
        const logout = await call('/open_api/admin_logout', cookie);
        expect(logout.status).toBe(200);
        expect(logout.headers.get('set-cookie')).toContain('Max-Age=0');
        expect((await call('/api/admin/check', '', { 'x-admin-auth': current })).status).toBe(401);
        expect((await call('/open_api/admin_session', cookie)).status).toBe(401);
        expect(database.sqlite.prepare('SELECT count(*) AS n FROM admin_browser_sessions').get()?.n).toBe(0);
    });

    it('rejects inactivity, altered cookies, and a changed administrator configuration', async () => {
        const { cookie, token } = await login();
        expect((await call('/open_api/admin_session', 'ets_admin_session=' + 'a'.repeat(43))).status).toBe(401);
        env.ADMIN_PASSWORDS = ['replacement-password'];
        expect((await call('/open_api/admin_session', cookie)).status).toBe(401);
        expect((await call('/api/admin/check', '', { 'x-admin-auth': token })).status).toBe(401);
        env.ADMIN_PASSWORDS = ['fixture-password'];
        expect((await call('/open_api/admin_session', cookie)).status).toBe(401);
        const renamed = await login();
        env.ADMIN_USERNAMES = ['other-admin'];
        expect((await call('/open_api/admin_session', renamed.cookie)).status).toBe(401);
        env.ADMIN_USERNAMES = [];
        const idle = await login();
        vi.setSystemTime(Date.now() + ADMIN_BROWSER_SESSION_SECONDS * 1000);
        expect((await call('/open_api/admin_session', idle.cookie)).status).toBe(401);
    });

    it('rejects CSRF forms and untrusted origins and only allows credentialed CORS for session routes', async () => {
        const { cookie } = await login();
        for (const path of ['/open_api/admin_login', '/open_api/admin_session', '/open_api/admin_logout']) {
            expect((await call(path, cookie, { 'Content-Type': 'text/plain' })).status).toBe(403);
            expect((await call(path, cookie, { Origin: 'https://evil.example' })).status).toBe(403);
            expect((await call(path, cookie, { 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403);
        }
        env.FRONTEND_URL = 'https://frontend.example';
        const renewed = await call('/open_api/admin_session', cookie, { Origin: env.FRONTEND_URL });
        expect(renewed.status).toBe(200);
        expect(renewed.headers.get('access-control-allow-credentials')).toBe('true');
        expect(renewed.headers.get('access-control-allow-origin')).toBe(env.FRONTEND_URL);
        expect(renewed.headers.get('set-cookie')).toContain('SameSite=None');
        const preflight = await app.fetch(new Request('https://mail.example.test/open_api/admin_session', {
            method: 'OPTIONS', headers: { Origin: env.FRONTEND_URL, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
        }), env);
        expect(preflight.headers.get('access-control-allow-credentials')).toBe('true');
    });
});
