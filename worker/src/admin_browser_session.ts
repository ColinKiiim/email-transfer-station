import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { generateShareToken, hashShareToken } from './share_tokens';
import { getAdminPasswords, getStringArray, hashPassword } from './utils';

export const ADMIN_BROWSER_SESSION_SECONDS = 90 * 24 * 60 * 60;
const COOKIE = 'ets_admin_session';
export const ADMIN_BROWSER_PATHS = new Set([
    '/open_api/admin_login', '/open_api/admin_session', '/open_api/admin_logout',
]);

type BrowserSession = { id: string; username: string; credential_version: string; expires_at: number };

const credentialVersion = (c: Context<HonoCustomType>) => hashPassword(JSON.stringify([
    c.env.JWT_SECRET, getAdminPasswords(c).sort(), [...getStringArray(c.env.ADMIN_USERNAMES)].sort(),
]));

const cookieOptions = (c: Context<HonoCustomType>) => {
    const url = new URL(c.req.url);
    const secure = url.protocol === 'https:';
    // Explicit CORS allowlisting and JSON-only POSTs protect cross-origin deployments.
    const crossOrigin = c.req.header('Origin') && c.req.header('Origin') !== url.origin;
    return { path: '/open_api/', httpOnly: true, secure, sameSite: secure && crossOrigin ? 'None' as const : 'Lax' as const };
};

export const clearAdminBrowserCookie = (c: Context<HonoCustomType>) => deleteCookie(c, COOKIE, cookieOptions(c));

export const readAdminBrowserSession = async (c: Context<HonoCustomType>, id: string) => {
    const row = await c.env.DB.prepare(
        'SELECT id, username, credential_version, expires_at FROM admin_browser_sessions WHERE id = ? AND expires_at > ?',
    ).bind(id, Math.floor(Date.now() / 1000)).first<BrowserSession>();
    if (!row) return null;
    if (row.credential_version !== await credentialVersion(c)) {
        await c.env.DB.prepare('DELETE FROM admin_browser_sessions WHERE id = ?').bind(id).run();
        return null;
    }
    return row;
};

export const revokeAdminBrowserSession = async (c: Context<HonoCustomType>, clearCookie = true) => {
    const token = getCookie(c, COOKIE);
    if (token) await c.env.DB.prepare('DELETE FROM admin_browser_sessions WHERE id = ?').bind(await hashShareToken(token)).run();
    if (clearCookie) clearAdminBrowserCookie(c);
};

export const createAdminBrowserSession = async (c: Context<HonoCustomType>, username: string) => {
    const token = generateShareToken();
    const id = await hashShareToken(token);
    await revokeAdminBrowserSession(c, false);
    await c.env.DB.prepare(
        'INSERT INTO admin_browser_sessions (id, username, credential_version, expires_at) VALUES (?, ?, ?, ?)',
    ).bind(id, username, await credentialVersion(c), Math.floor(Date.now() / 1000) + ADMIN_BROWSER_SESSION_SECONDS).run();
    setCookie(c, COOKIE, token, { ...cookieOptions(c), maxAge: ADMIN_BROWSER_SESSION_SECONDS });
    return id;
};

export const renewAdminBrowserSession = async (c: Context<HonoCustomType>) => {
    const token = getCookie(c, COOKIE);
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const row = await readAdminBrowserSession(c, await hashShareToken(token));
    if (!row) return null;
    const updated = await c.env.DB.prepare(
        'UPDATE admin_browser_sessions SET expires_at = ? WHERE id = ? AND expires_at > ?',
    ).bind(Math.floor(Date.now() / 1000) + ADMIN_BROWSER_SESSION_SECONDS, row.id, Math.floor(Date.now() / 1000)).run();
    // A simultaneous logout deletes the row; renewal must never recreate it.
    if (!updated.meta.changes) return null;
    setCookie(c, COOKIE, token, { ...cookieOptions(c), maxAge: ADMIN_BROWSER_SESSION_SECONDS });
    return row;
};
