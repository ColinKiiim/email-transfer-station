import { Context } from "hono";
import { CONSTANTS } from "../constants";
import { AdminWebhookSettings } from "../models";
import { recordAuditEvent } from "../audit";

async function getWebhookSettings(c: Context<HonoCustomType>): Promise<Response> {
    const settings = await c.env.KV.get<AdminWebhookSettings>(CONSTANTS.WEBHOOK_KV_SETTINGS_KEY, "json");
    return c.json(settings || new AdminWebhookSettings(false, []));
}

async function saveWebhookSettings(c: Context<HonoCustomType>): Promise<Response> {
    const settings = await c.req.json<AdminWebhookSettings>();
    await c.env.KV.put(CONSTANTS.WEBHOOK_KV_SETTINGS_KEY, JSON.stringify(settings));
    await recordAuditEvent(c, {
        action: "webhook.global_settings.update",
        actor_type: "admin",
        actor_label: "admin",
        resource_type: "webhook_settings",
        status: "success",
        metadata: {
            enable_allow_list: settings.enableAllowList,
            allow_list_count: settings.allowList?.length || 0,
        },
    });
    return c.json({ success: true })
}

export default {
    getWebhookSettings,
    saveWebhookSettings,
}
