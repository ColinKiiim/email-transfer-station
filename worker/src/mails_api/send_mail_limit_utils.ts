import { Context } from "hono";
import i18n from "../i18n";
import { SendMailLimitConfig } from "../models";
import { CONSTANTS } from "../constants";
import { getJsonObjectValue } from "../utils";

export class SendMailLimitError extends Error {
    constructor(message: string) {
        super(message);
    }
}

const parseLimitValue = (value: unknown): number | null => {
    if (value === null || typeof value === "undefined") {
        return null;
    }
    if (!Number.isInteger(value) || (value as number) < -1) {
        return null;
    }
    return value as number;
}

const isValidLimitValue = (value: number | null): boolean => {
    return value === -1 || (value !== null && value >= 0);
}

const parseSendMailLimitConfig = (value: unknown): SendMailLimitConfig | null => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }
    const config = value as Record<string, unknown>;
    if (typeof config.dailyEnabled !== "boolean" || typeof config.monthlyEnabled !== "boolean") {
        return null;
    }
    const dailyLimit = parseLimitValue(config.dailyLimit);
    const monthlyLimit = parseLimitValue(config.monthlyLimit);
    const monthlyValid = config.monthlyEnabled
        ? isValidLimitValue(monthlyLimit)
        : (config.monthlyLimit === null || typeof config.monthlyLimit === "undefined" || monthlyLimit !== null);
    const dailyValid = config.dailyEnabled
        ? isValidLimitValue(dailyLimit)
        : (config.dailyLimit === null || typeof config.dailyLimit === "undefined" || dailyLimit !== null);
    if (!dailyValid || !monthlyValid) {
        return null;
    }
    return {
        dailyEnabled: config.dailyEnabled,
        monthlyEnabled: config.monthlyEnabled,
        dailyLimit,
        monthlyLimit,
    };
}

export const validateSendMailLimitConfig = (value: unknown): boolean => {
    return !!parseSendMailLimitConfig(value);
}

export const getSendMailLimitConfigToSave = (
    value: unknown
): SendMailLimitConfig | null => {
    const sendMailLimitConfig = parseSendMailLimitConfig(value);
    if (!sendMailLimitConfig) {
        return null;
    }
    return {
        dailyEnabled: sendMailLimitConfig.dailyEnabled,
        monthlyEnabled: sendMailLimitConfig.monthlyEnabled,
        dailyLimit: sendMailLimitConfig.dailyEnabled ? sendMailLimitConfig.dailyLimit : null,
        monthlyLimit: sendMailLimitConfig.monthlyEnabled ? sendMailLimitConfig.monthlyLimit : null,
    };
}

export const getSendMailLimitConfig = async (
    c: Context<HonoCustomType>
): Promise<SendMailLimitConfig | null> => {
    const value = await c.env.DB.prepare(
        `SELECT value FROM settings WHERE key = ?`
    ).bind(CONSTANTS.SEND_MAIL_LIMIT_CONFIG_KEY).first<string>("value");
    return getSendMailLimitConfigToSave(getJsonObjectValue<SendMailLimitConfig>(
        value
    ));
}

const getDailyCountKey = (date: Date = new Date()): string => {
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(date.getUTCDate()).padStart(2, "0");
    return `${CONSTANTS.SEND_MAIL_LIMIT_COUNT_KEY_PREFIX}daily:${yyyy}-${mm}-${dd}`;
}

const getMonthlyCountKey = (date: Date = new Date()): string => {
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
    return `${CONSTANTS.SEND_MAIL_LIMIT_COUNT_KEY_PREFIX}monthly:${yyyy}-${mm}`;
}

const cleanupSendMailLimitCount = async (
    c: Context<HonoCustomType>,
    currentDailyKey: string,
    currentMonthlyKey: string
): Promise<void> => {
    await c.env.DB.batch([
        c.env.DB.prepare(
            `DELETE FROM settings
            WHERE key LIKE ?
            AND key < ?`
        ).bind(`${CONSTANTS.SEND_MAIL_LIMIT_COUNT_KEY_PREFIX}daily:%`, currentDailyKey),
        c.env.DB.prepare(
            `DELETE FROM settings
            WHERE key LIKE ?
            AND key < ?`
        ).bind(`${CONSTANTS.SEND_MAIL_LIMIT_COUNT_KEY_PREFIX}monthly:%`, currentMonthlyKey),
    ]);
}

const reserveCount = async (
    c: Context<HonoCustomType>,
    key: string,
    limit: number,
): Promise<boolean> => {
    const initialized = await c.env.DB.prepare(
        `INSERT INTO settings (key, value) VALUES (?, '0') ON CONFLICT(key) DO NOTHING`
    ).bind(key).run();
    if (!initialized.success) throw new Error("Failed to initialize send limit counter");
    const reserved = await c.env.DB.prepare(
        `UPDATE settings SET value = CAST(COALESCE(value, '0') AS INTEGER) + 1,`
        + ` updated_at = datetime('now')`
        + ` WHERE key = ? AND CAST(COALESCE(value, '0') AS INTEGER) < ?`
    ).bind(key, limit).run();
    if (!reserved.success) throw new Error("Failed to reserve send limit");
    return Number(reserved.meta?.changes || 0) === 1;
};

export type SendMailLimitReservation = { keys: string[] };

export const releaseSendMailLimit = async (
    c: Context<HonoCustomType>,
    reservation: SendMailLimitReservation,
): Promise<void> => {
    for (const key of [...reservation.keys].reverse()) {
        const released = await c.env.DB.prepare(
            `UPDATE settings SET value = MAX(CAST(COALESCE(value, '0') AS INTEGER) - 1, 0),`
            + ` updated_at = datetime('now') WHERE key = ?`
        ).bind(key).run();
        if (!released.success || Number(released.meta?.changes || 0) !== 1) {
            throw new Error("Failed to release send limit reservation");
        }
    }
};

export const reserveSendMailLimit = async (
    c: Context<HonoCustomType>
): Promise<SendMailLimitReservation> => {
    const config = await getSendMailLimitConfig(c);
    if (!config || (!config.dailyEnabled && !config.monthlyEnabled)) return { keys: [] };
    const msgs = i18n.getMessagesbyContext(c);
    const dailyKey = getDailyCountKey();
    const monthlyKey = getMonthlyCountKey();
    const reservation: SendMailLimitReservation = { keys: [] };
    try {
        if (config.dailyEnabled && config.dailyLimit !== null && config.dailyLimit !== -1) {
            if (!await reserveCount(c, dailyKey, config.dailyLimit)) {
                throw new SendMailLimitError(msgs.ServerSendMailDailyLimitMsg);
            }
            reservation.keys.push(dailyKey);
        }
        if (config.monthlyEnabled && config.monthlyLimit !== null && config.monthlyLimit !== -1) {
            if (!await reserveCount(c, monthlyKey, config.monthlyLimit)) {
                throw new SendMailLimitError(msgs.ServerSendMailMonthlyLimitMsg);
            }
            reservation.keys.push(monthlyKey);
        }
    } catch (error) {
        if (reservation.keys.length) await releaseSendMailLimit(c, reservation);
        throw error;
    }
    try {
        await cleanupSendMailLimitCount(c, dailyKey, monthlyKey);
    } catch (error) {
        console.warn("Failed to clean old send limit counters", error);
    }
    return reservation;
};
