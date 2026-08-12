import { Context } from "hono";
import { Jwt } from "hono/utils/jwt";

const USER_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const AUTH_GENERATION_KEY = "authGeneration";

const parseUserInfo = (value: string | null | undefined): Record<string, unknown> => {
    if (!value) return {};
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
};

export const rotateUserAuthGeneration = (
    userInfo: string | null | undefined,
    generation = crypto.randomUUID()
): string => JSON.stringify({
    ...parseUserInfo(userInfo),
    [AUTH_GENERATION_KEY]: generation,
});

const readGeneration = (userInfo: string | null | undefined): string | null => {
    const generation = parseUserInfo(userInfo)[AUTH_GENERATION_KEY];
    return typeof generation === "string" && generation.length > 0 ? generation : null;
};

const getOrCreateUserGeneration = async (
    c: Context<HonoCustomType>,
    userId: number,
    userEmail: string
): Promise<string> => {
    const row = await c.env.DB.prepare(
        `SELECT user_email, user_info FROM users WHERE id = ?`
    ).bind(userId).first<{ user_email: string, user_info: string | null }>();
    if (!row || row.user_email !== userEmail) throw new Error("User identity no longer exists");
    const existing = readGeneration(row.user_info);
    if (existing) return existing;

    const userInfo = rotateUserAuthGeneration(row.user_info);
    const { success } = await c.env.DB.prepare(
        `UPDATE users SET user_info = ?, updated_at = datetime('now') WHERE id = ? AND user_email = ?`
    ).bind(userInfo, userId, userEmail).run();
    if (!success) throw new Error("Failed to initialize user identity generation");
    const generation = readGeneration(userInfo);
    if (!generation) throw new Error("Failed to initialize user identity generation");
    return generation;
};

export const issueUserJwt = async (
    c: Context<HonoCustomType>,
    userId: number,
    userEmail: string,
    now = Math.floor(Date.now() / 1000)
): Promise<string> => Jwt.sign({
    user_email: userEmail,
    user_id: userId,
    user_generation: await getOrCreateUserGeneration(c, userId, userEmail),
    exp: now + USER_TOKEN_TTL_SECONDS,
    iat: now,
}, c.env.JWT_SECRET, "HS256");

export const validateUserJwtPayload = async (
    c: Context<HonoCustomType>,
    payload: Partial<UserPayload>
): Promise<boolean> => {
    if (!payload.user_id || !payload.user_email || !payload.user_generation) return false;
    const row = await c.env.DB.prepare(
        `SELECT user_email, user_info FROM users WHERE id = ?`
    ).bind(payload.user_id).first<{ user_email: string, user_info: string | null }>();
    return !!row
        && row.user_email === payload.user_email
        && readGeneration(row.user_info) === payload.user_generation;
};
