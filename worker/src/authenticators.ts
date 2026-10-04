import { Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { generateShareToken, hashShareToken } from './share_tokens';
import { decryptTotp, encryptTotp, generateTotp, parseTotp } from './totp';

type Item = { id: string; label: string; issuer: string; secret_ciphertext: string;
    secret_nonce: string; algorithm: string; digits: number; period: number; expires_at?: string | null };
const activeShare = "s.revoked_at IS NULL AND (s.expires_at IS NULL OR s.expires_at > datetime('now'))";

export const authenticatorApi = new Hono<HonoCustomType>();
for (const prefix of ['/user_api/authenticators', '/open_api/authenticator_share', '/api/admin/authenticators']) {
    authenticatorApi.use(`${prefix}*`, bodyLimit({ maxSize: 8192 }));
    authenticatorApi.use(`${prefix}*`, async (c, next) => {
        c.header('Cache-Control', 'no-store');
        c.header('Referrer-Policy', 'no-referrer');
        if (!c.env.TWO_FACTOR_ENCRYPTION_KEY) return c.json({ error: 'authenticator_unavailable' }, 503);
        await next();
    });
}

async function readBody(c: Context<HonoCustomType>): Promise<Record<string, unknown> | null> {
    try {
        const body = await c.req.json();
        return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
    } catch { return null; }
}

async function publicCode(c: Context<HonoCustomType>, row: Item, now: number) {
    const secret = await decryptTotp(row.secret_ciphertext, row.secret_nonce, c.env.TWO_FACTOR_ENCRYPTION_KEY!, row.id);
    const validUntil = (Math.floor(now / 1000 / row.period) + 1) * row.period * 1000;
    return { id: row.id, label: row.label, issuer: row.issuer, period: row.period,
        code: await generateTotp({ ...row, secret }, now),
        valid_until: row.expires_at ? Math.min(validUntil, Date.parse(row.expires_at.replace(' ', 'T') + 'Z')) : validUntil };
}

async function findShare(c: Context<HonoCustomType>, token: unknown) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    return c.env.DB.prepare(`SELECT a.*, s.id AS share_id, s.expires_at FROM authenticator_share_tokens s
        JOIN user_authenticators a ON a.id = s.authenticator_id
        WHERE s.token_hash = ? AND ${activeShare}`).bind(await hashShareToken(token)).first<Item & { share_id: string }>();
}

function parseExpiry(body: Record<string, unknown> | null): string | null | 'invalid' {
    if (!body || body.expires_at == null || body.expires_at === '') return null;
    const date = typeof body.expires_at === 'string' ? Date.parse(body.expires_at) : NaN;
    if (!Number.isFinite(date) || date <= Date.now()) return 'invalid';
    return new Date(date).toISOString().slice(0, 19).replace('T', ' ');
}

authenticatorApi.get('/user_api/authenticators', async c => {
    const { results } = await c.env.DB.prepare(`SELECT a.*,
        CASE WHEN x.direct_assigned = 1 THEN NULL ELSE s.expires_at END AS expires_at
        FROM user_authenticators a
        JOIN user_authenticator_access x ON x.authenticator_id = a.id
        LEFT JOIN authenticator_share_tokens s ON s.id = x.share_id AND s.authenticator_id = a.id
        WHERE x.user_id = ? AND (x.direct_assigned = 1 OR ${activeShare})
        ORDER BY a.created_at DESC`).bind(c.get('userPayload').user_id).all<Item>();
    const now = Date.now();
    return c.json({ server_time: now, results: await Promise.all(results.map(async row => ({
        ...await publicCode(c, row, now), owned: false,
    }))) });
});

authenticatorApi.post('/user_api/authenticators', c => c.json({ error: 'admin_managed_authenticator' }, 403));

authenticatorApi.delete('/user_api/authenticators/:id', async c => {
    const body = await readBody(c);
    if (body?.confirm !== true) return c.json({ error: 'confirmation_required' }, 400);
    await c.env.DB.prepare('DELETE FROM user_authenticator_access WHERE user_id = ? AND authenticator_id = ?')
        .bind(c.get('userPayload').user_id, c.req.param('id')).run();
    return c.json({ success: true });
});

authenticatorApi.post('/user_api/authenticators/save-share', async c => {
    const share = await findShare(c, (await readBody(c))?.token);
    if (!share) return c.json({ error: 'invalid_authenticator_share' }, 404);
    await c.env.DB.prepare(`INSERT INTO user_authenticator_access (user_id, authenticator_id, direct_assigned, share_id)
        SELECT ?, s.authenticator_id, 0, s.id FROM authenticator_share_tokens s WHERE s.id = ? AND ${activeShare}
        ON CONFLICT(user_id, authenticator_id) DO UPDATE SET share_id = excluded.share_id`)
        .bind(c.get('userPayload').user_id, share.share_id).run();
    return c.json({ success: true });
});

authenticatorApi.get('/api/admin/authenticators', async c => {
    const { results } = await c.env.DB.prepare(`SELECT a.*,
        (SELECT COUNT(*) FROM user_authenticator_access x
            WHERE x.authenticator_id = a.id AND x.direct_assigned = 1) AS assigned_count,
        (SELECT COUNT(*) FROM authenticator_share_tokens s WHERE s.authenticator_id = a.id
            AND s.token_hash NOT LIKE 'assignment:%' AND ${activeShare}) AS share_count
        FROM user_authenticators a ORDER BY a.created_at DESC`).all<Item & { assigned_count: number; share_count: number }>();
    const now = Date.now();
    return c.json({ server_time: now, results: await Promise.all(results.map(async row => ({
        ...await publicCode(c, row, now), assigned_count: row.assigned_count,
        share_count: row.share_count,
    }))) });
});

authenticatorApi.post('/api/admin/authenticators', async c => {
    const body = await readBody(c);
    let item;
    try { item = parseTotp(body?.input, body?.label); }
    catch { return c.json({ error: 'invalid_authenticator' }, 400); }
    const id = crypto.randomUUID();
    const encrypted = await encryptTotp(item.secret, c.env.TWO_FACTOR_ENCRYPTION_KEY!, id);
    await c.env.DB.prepare(`INSERT INTO user_authenticators
        (id, label, issuer, secret_ciphertext, secret_nonce, algorithm, digits, period)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, item.label, item.issuer,
        encrypted.secret_ciphertext, encrypted.secret_nonce, item.algorithm, item.digits, item.period).run();
    return c.json({ id }, 201);
});

authenticatorApi.delete('/api/admin/authenticators/:id', async c => {
    const body = await readBody(c);
    if (body?.confirm !== true) return c.json({ error: 'confirmation_required' }, 400);
    const id = c.req.param('id');
    await c.env.DB.batch([
        c.env.DB.prepare('DELETE FROM user_authenticator_access WHERE authenticator_id = ?').bind(id),
        c.env.DB.prepare('DELETE FROM authenticator_share_tokens WHERE authenticator_id = ?').bind(id),
        c.env.DB.prepare('DELETE FROM user_authenticators WHERE id = ?').bind(id),
    ]);
    return c.json({ success: true });
});

authenticatorApi.get('/api/admin/authenticators/:id/assignments', async c => {
    const { results } = await c.env.DB.prepare(`SELECT u.id, u.user_email, u.username, u.display_name
        FROM user_authenticator_access x JOIN users u ON u.id = x.user_id
        WHERE x.authenticator_id = ? AND x.direct_assigned = 1 ORDER BY u.user_email`).bind(c.req.param('id')).all();
    return c.json({ results });
});

authenticatorApi.post('/api/admin/authenticators/:id/assignments', async c => {
    const body = await readBody(c);
    const userId = Number(body?.user_id);
    if (!Number.isInteger(userId) || userId <= 0) return c.json({ error: 'invalid_user' }, 400);
    const user = await c.env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(userId).first('id');
    const item = await c.env.DB.prepare('SELECT id FROM user_authenticators WHERE id = ?').bind(c.req.param('id')).first('id');
    if (!user || !item) return c.json({ error: 'not_found' }, 404);
    await c.env.DB.prepare(`INSERT INTO user_authenticator_access
        (user_id, authenticator_id, direct_assigned, share_id) VALUES (?, ?, 1, NULL)
        ON CONFLICT(user_id, authenticator_id) DO UPDATE SET direct_assigned = 1`)
        .bind(userId, c.req.param('id')).run();
    return c.json({ success: true });
});

authenticatorApi.delete('/api/admin/authenticators/:id/assignments/:userId', async c => {
    const itemId = c.req.param('id');
    const userId = Number(c.req.param('userId'));
    await c.env.DB.batch([
        c.env.DB.prepare('UPDATE user_authenticator_access SET direct_assigned = 0 WHERE authenticator_id = ? AND user_id = ?')
            .bind(itemId, userId),
        c.env.DB.prepare('DELETE FROM user_authenticator_access WHERE authenticator_id = ? AND user_id = ? AND direct_assigned = 0 AND share_id IS NULL')
            .bind(itemId, userId),
    ]);
    return c.json({ success: true });
});

authenticatorApi.post('/api/admin/authenticators/:id/shares', async c => {
    const expiresAt = parseExpiry(await readBody(c));
    if (expiresAt === 'invalid') return c.json({ error: 'invalid_expiry' }, 400);
    const item = await c.env.DB.prepare('SELECT id FROM user_authenticators WHERE id = ?').bind(c.req.param('id')).first('id');
    if (!item) return c.json({ error: 'authenticator_not_found' }, 404);
    const id = crypto.randomUUID(), token = generateShareToken();
    await c.env.DB.prepare(`INSERT INTO authenticator_share_tokens (id, authenticator_id, token_hash, expires_at)
        VALUES (?, ?, ?, ?)`).bind(id, c.req.param('id'), await hashShareToken(token), expiresAt).run();
    return c.json({ id, token, expires_at: expiresAt }, 201);
});

authenticatorApi.get('/api/admin/authenticators/:id/shares', async c => {
    const { results } = await c.env.DB.prepare(`SELECT id, expires_at, revoked_at, created_at FROM authenticator_share_tokens
        WHERE authenticator_id = ? AND token_hash NOT LIKE 'assignment:%'
        AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > datetime('now'))
        ORDER BY created_at DESC`).bind(c.req.param('id')).all();
    return c.json({ results });
});

authenticatorApi.delete('/api/admin/authenticators/:id/shares/:shareId', async c => {
    const body = await readBody(c);
    if (body?.confirm !== true) return c.json({ error: 'confirmation_required' }, 400);
    await c.env.DB.prepare("UPDATE authenticator_share_tokens SET revoked_at = datetime('now') WHERE id = ? AND authenticator_id = ?")
        .bind(c.req.param('shareId'), c.req.param('id')).run();
    return c.json({ success: true });
});

authenticatorApi.post('/open_api/authenticator_share', async c => {
    const share = await findShare(c, (await readBody(c))?.token);
    if (!share) return c.json({ error: 'invalid_authenticator_share' }, 404);
    const now = Date.now();
    return c.json({ server_time: now, item: await publicCode(c, share, now), expires_at: share.expires_at });
});
