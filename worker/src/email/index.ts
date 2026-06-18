import { Context } from "hono";

import { getBooleanValue, getJsonSetting } from "../utils";
import { sendMailToTelegram } from "../telegram_api";
import { auto_reply } from "./auto_reply";
import { isBlocked } from "./black_list";
import { triggerWebhook, triggerAnotherWorker, commonParseMail } from "../common";
import { check_if_junk_mail } from "./check_junk";
import { remove_attachment_if_need } from "./check_attachment";
import { extractEmailInfo } from "./ai_extract";
import { forwardEmail } from "./forward";
import { EmailRuleSettings } from "../models";
import { CONSTANTS } from "../constants";
import { compressText } from "../gzip";
import { resolveInboundRecipient } from "./recipient";
import {
    getCollectorAddresses,
    getManagedReceiveDomains,
    getPendingVerificationRecipients,
} from "../domains";


async function email(message: ForwardableEmailMessage, env: Bindings, ctx: ExecutionContext) {
    if (await isBlocked(message.from, env)) {
        message.setReject("Reject from address");
        console.log(`Reject message from ${message.from} to ${message.to}`);
        return;
    }
    const rawEmail = await new Response(message.raw).text();
    const parsedEmailContext: ParsedEmailContext = {
        rawEmail: rawEmail
    };
    const domainContext = { env } as Context<HonoCustomType>;
    const inboundRecipient = resolveInboundRecipient(message, rawEmail, {
        collectorAddresses: await getCollectorAddresses(domainContext),
        managedReceiveDomains: await getManagedReceiveDomains(domainContext),
        verificationRecipients: await getPendingVerificationRecipients(domainContext),
    });

    // check if junk mail
    try {
        const is_junk = await check_if_junk_mail(env, inboundRecipient.address, parsedEmailContext, message.headers.get("Message-ID"));
        if (is_junk) {
            message.setReject("Junk mail");
            console.log(`Junk mail from ${message.from} to ${inboundRecipient.address}`);
            return;
        }
    } catch (error) {
        console.error("check junk mail error", error);
    }

    // check if unknown address mail
    try {
        const emailRuleSettings = await getJsonSetting<EmailRuleSettings>(
            { env: env } as Context<HonoCustomType>, CONSTANTS.EMAIL_RULE_SETTINGS_KEY
        );
        if (emailRuleSettings?.blockReceiveUnknowAddressEmail && !inboundRecipient.isVerificationRecipient) {
            const db_address_id = await env.DB.prepare(
                `SELECT id FROM address where name = ? `
            ).bind(inboundRecipient.address).first("id");
            if (!db_address_id) {
                message.setReject("Unknown address");
                console.log(`Unknown address mail from ${message.from} to ${inboundRecipient.address}`);
                return;
            }
        }
    } catch (error) {
        console.error("check unknown address mail error", error);
    }

    // remove attachment if configured or size > 2MB
    try {
        await remove_attachment_if_need(env, parsedEmailContext, message.from, inboundRecipient.address, message.rawSize);
    } catch (error) {
        console.error("remove attachment error", error);
    }

    const message_id = message.headers.get("Message-ID");
    const savePlaintext = async (): Promise<{ success: boolean }> => {
        try {
            return await env.DB.prepare(
                `INSERT INTO raw_mails`
                + ` (source, address, original_recipient, collector_address, original_domain, ingress_source, recipient_confidence, raw, message_id)`
                + ` VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).bind(
                message.from,
                inboundRecipient.address,
                inboundRecipient.originalRecipient,
                inboundRecipient.collectorAddress,
                inboundRecipient.originalDomain,
                inboundRecipient.ingressSource,
                inboundRecipient.recipientConfidence,
                parsedEmailContext.rawEmail,
                message_id
            ).run();
        } catch (dbError) {
            const errMsg = String(dbError);
            if (
                errMsg.includes('original_recipient')
                || errMsg.includes('collector_address')
                || errMsg.includes('original_domain')
                || errMsg.includes('ingress_source')
                || errMsg.includes('recipient_confidence')
                || errMsg.includes('no such column')
            ) {
                console.error("ingress metadata columns missing, falling back to legacy raw_mails insert", dbError);
                return await env.DB.prepare(
                    `INSERT INTO raw_mails (source, address, raw, message_id) VALUES (?, ?, ?, ?)`
                ).bind(
                    message.from, inboundRecipient.address, parsedEmailContext.rawEmail, message_id
                ).run();
            }
            throw dbError;
        }
    };
    const saveCompressed = async (compressed: ArrayBuffer): Promise<{ success: boolean }> => {
        try {
            return await env.DB.prepare(
                `INSERT INTO raw_mails`
                + ` (source, address, original_recipient, collector_address, original_domain, ingress_source, recipient_confidence, raw_blob, message_id)`
                + ` VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).bind(
                message.from,
                inboundRecipient.address,
                inboundRecipient.originalRecipient,
                inboundRecipient.collectorAddress,
                inboundRecipient.originalDomain,
                inboundRecipient.ingressSource,
                inboundRecipient.recipientConfidence,
                compressed,
                message_id
            ).run();
        } catch (dbError) {
            const errMsg = String(dbError);
            if (errMsg.includes('raw_blob') || errMsg.includes('no such column')) {
                console.error("raw_blob column missing, falling back to plaintext", dbError);
                return await savePlaintext();
            }
            throw dbError;
        }
    };
    // save email
    try {
        let success = false;
        if (getBooleanValue(env.ENABLE_MAIL_GZIP)) {
            let compressed: ArrayBuffer | null = null;
            try {
                compressed = await compressText(parsedEmailContext.rawEmail);
            } catch (gzipError) {
                console.error("gzip compression failed, falling back to plaintext", gzipError);
            }
            if (compressed) {
                ({ success } = await saveCompressed(compressed));
            } else {
                ({ success } = await savePlaintext());
            }
        } else {
            ({ success } = await savePlaintext());
        }
        if (!success) {
            message.setReject(`Failed save message to ${inboundRecipient.address}`);
            console.error(`Failed save message from ${message.from} to ${inboundRecipient.address}`);
        }
    }
    catch (error) {
        console.error("save email error", error);
    }

    // forward email
    await forwardEmail(message, env, inboundRecipient.address);

    // send email to telegram
    try {
        await sendMailToTelegram(
            { env: env } as Context<HonoCustomType>,
            inboundRecipient.address, parsedEmailContext, message_id);
    } catch (error) {
        console.error("send mail to telegram error", error);
    }

    // send webhook
    try {
        await triggerWebhook(
            { env: env } as Context<HonoCustomType>,
            inboundRecipient.address, parsedEmailContext, message_id
        );
    } catch (error) {
        console.error("send webhook error", error);
    }

    // trigger another worker
    try {
        const parsedEmail = (await commonParseMail(parsedEmailContext));
        const parsedText = parsedEmail?.text ?? ""
        const rpcEmail: RPCEmailMessage = {
            from: message.from,
            to: inboundRecipient.address,
            rawEmail: rawEmail,
            headers: message.headers
        }
        await triggerAnotherWorker({ env: env } as Context<HonoCustomType>, rpcEmail, parsedText);
    } catch (error) {
        console.error("trigger another worker error", error);
    }

    // auto reply email
    await auto_reply(message, env, inboundRecipient.address);

    // AI email content extraction
    await extractEmailInfo(parsedEmailContext, env, message_id, inboundRecipient.address);
}

export { email }
