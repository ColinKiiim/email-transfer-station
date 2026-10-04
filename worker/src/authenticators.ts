import { Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { generateShareToken, hashShareToken } from './share_tokens';
import { decryptTotp, encryptTotp, generateTotp, parseTotp } from './totp';

type Item = { id: string; user_id: number; label: string; issuer: string; secret_ciphertext: string;
    secret_nonce: string; algorithm: string; digits: number; period: number; expires_at?: string | null };
const activeShare = "s.revoked_at IS NULL AND (s.expires_at IS NULL OR s.expires_at > datetime('now'))";

export const authenticatorApi = new Hono<HonoCustomType>();
// Both route families stay outside address-bearer authority. User routes use the existing user middleware.
for (const prefix of ['/user_api/authenticators', '/open_api/authenticator_share']) {
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
        JOIN user_authenticators a ON a.id = s.authenticator_id JOIN users u ON u.id = a.user_id
        WHERE s.token_hash = ? AND ${activeShare}`).bind(await hashShareToken(token)).first<Item & { share_id: string }>();
}

authenticatorApi.get('/user_api/authenticators', async c => {
    const userId = c.get('userPayload').user_id;
    const { results } = await c.env.DB.prepare(`SELECT a.*, NULL AS expires_at FROM user_authenticators a WHERE a.user_id = ?
        UNION ALL SELECT a.*, s.expires_at FROM user_authenticators a
        JOIN user_authenticator_access x ON x.authenticator_id = a.id
        JOIN authenticator_share_tokens s ON s.id = x.share_id AND s.authenticator_id = a.id
        JOIN users u ON u.id = a.user_id
        WHERE x.user_id = ? AND a.user_id != ? AND ${activeShare}
        ORDER BY created_at DESC`).bind(userId, userId, userId).all<Item>();
    const now = Date.now();
    return c.json({ server_time: now, results: await Promise.all(results.map(async row => ({
        ...await publicCode(c, row, now), owned: Number(row.user_id) === Number(userId),
    }))) });
});

authenticatorApi.post('/user_api/authenticators', async c => {
    const body = await readBody(c);
    let item;
    try { item = parseTotp(body?.input, body?.label); }
    catch { return c.json({ error: 'invalid_authenticator' }, 400); }
    const id = crypto.randomUUID();
    const encrypted = await encryptTotp(item.secret, c.env.TWO_FACTOR_ENCRYPTION_KEY!, id);
    await c.env.DB.prepare(`INSERT INTO user_authenticators
        (id, user_id, label, issuer, secret_ciphertext, secret_nonce, algorithm, digits, period)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, c.get('userPayload').user_id, item.label, item.issuer,
        encrypted.secret_ciphertext, encrypted.secret_nonce, item.algorithm, item.digits, item.period).run();
    return c.json({ id }, 201);
});

authenticatorApi.delete('/user_api/authenticators/:id', async c => {
    const userId = c.get('userPayload').user_id;
    const id = c.req.param('id');
    const body = await readBody(c);
    if (body?.confirm !== true) return c.json({ error: 'confirmation_required' }, 400);
    // Removing a saved share only removes the caller's bookmark; deleting an owned item cascades.
    await c.env.DB.batch([
        c.env.DB.prepare('DELETE FROM user_authenticator_access WHERE user_id = ? AND authenticator_id = ?').bind(userId, id),
        c.env.DB.prepare('DELETE FROM user_authenticators WHERE user_id = ? AND id = ?').bind(userId, id),
    ]);
    return c.json({ success: true });
});

authenticatorApi.post('/user_api/authenticators/save-share', async c => {
    const body = await readBody(c);
    const share = await findShare(c, body?.token);
    if (!share) return c.json({ error: 'invalid_authenticator_share' }, 404);
    const userId = c.get('userPayload').user_id;
    if (Number(userId) !== Number(share.user_id)) {
        // Keep the link's authority: saving must not turn expiring access into permanent access.
        await c.env.DB.prepare(`INSERT INTO user_authenticator_access (user_id, authenticator_id, share_id)
            SELECT ?, s.authenticator_id, s.id FROM authenticator_share_tokens s WHERE s.id = ? AND ${activeShare}
            ON CONFLICT(user_id, authenticator_id) DO UPDATE SET share_id = excluded.share_id`).bind(userId, share.share_id).run();
    }
    return c.json({ success: true });
});

authenticatorApi.get('/user_api/authenticators/:id/shares', async c => {
    const { results } = await c.env.DB.prepare(`SELECT s.id, s.expires_at, s.created_at FROM authenticator_share_tokens s
        JOIN user_authenticators a ON a.id = s.authenticator_id
        WHERE a.id = ? AND a.user_id = ? AND ${activeShare} ORDER BY s.created_at DESC`)
        .bind(c.req.param('id'), c.get('userPayload').user_id).all();
    return c.json({ results });
});

authenticatorApi.post('/user_api/authenticators/:id/shares', async c => {
    const body = await readBody(c);
    if (!body) return c.json({ error: 'invalid_expiry' }, 400);
    let expiresAt: string | null = null;
    if (body.expires_at != null && body.expires_at !== '') {
        const date = typeof body.expires_at === 'string' ? Date.parse(body.expires_at) : NaN;
        if (!Number.isFinite(date) || date <= Date.now()) return c.json({ error: 'invalid_expiry' }, 400);
        expiresAt = new Date(date).toISOString().slice(0, 19).replace('T', ' ');
    }
    const id = crypto.randomUUID(), token = generateShareToken();
    const result = await c.env.DB.prepare(`INSERT INTO authenticator_share_tokens (id, authenticator_id, token_hash, expires_at)
        SELECT ?, a.id, ?, ? FROM user_authenticators a WHERE a.id = ? AND a.user_id = ?`)
        .bind(id, await hashShareToken(token), expiresAt, c.req.param('id'), c.get('userPayload').user_id).run();
    if (!Number(result.meta?.changes || 0)) return c.json({ error: 'authenticator_not_found' }, 404);
    return c.json({ id, token, expires_at: expiresAt }, 201);
});

authenticatorApi.delete('/user_api/authenticators/:id/shares/:shareId', async c => {
    const body = await readBody(c);
    if (body?.confirm !== true) return c.json({ error: 'confirmation_required' }, 400);
    const result = await c.env.DB.prepare(`UPDATE authenticator_share_tokens SET revoked_at = datetime('now')
        WHERE id = ? AND authenticator_id IN (SELECT id FROM user_authenticators WHERE id = ? AND user_id = ?)`)
        .bind(c.req.param('shareId'), c.req.param('id'), c.get('userPayload').user_id).run();
    if (!Number(result.meta?.changes || 0)) return c.json({ error: 'authenticator_not_found' }, 404);
    return c.json({ success: true });
});

// POST keeps the bearer token out of API URLs and ordinary access logs.
authenticatorApi.post('/open_api/authenticator_share', async c => {
    const body = await readBody(c);
    const share = await findShare(c, body?.token);
    if (!share) return c.json({ error: 'invalid_authenticator_share' }, 404);
    const now = Date.now();
    return c.json({ server_time: now, item: await publicCode(c, share, now), expires_at: share.expires_at });
});
