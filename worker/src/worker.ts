import { Context, Hono } from 'hono'
import { cors } from 'hono/cors';
import { jwt } from 'hono/jwt'
import { Jwt } from 'hono/utils/jwt'

import { api as commonApi } from './commom_api';
import { api as openAuthApi } from './open_api/auth';
import { api as openShareApi } from './open_api/share';
import { api as mailsApi } from './mails_api'
import { api as userApi } from './user_api';
import { api as adminApi } from './admin_api';
import { api as apiSendMail } from './mails_api/send_mail_api'
import { api as telegramApi } from './telegram_api'

import i18n from './i18n';
import { email } from './email';
import { scheduled } from './scheduled';
import { getPasswords, getBooleanValue, getStringArray, checkIsAdmin } from './utils';
import { checkAccessControl } from './ip_blacklist';
import { queueAccessEvent } from './audit';
import { getAddressCreationDomainNames } from './domains';

const API_PATHS = [
	"/api/",
	"/open_api/",
	"/user_api/",
	"/admin/",
	"/telegram/",
	"/external/",
];

const app = new Hono<HonoCustomType>()
//cors
app.use('/*', cors());
// error handler
app.onError((err, c) => {
	console.error(err)
	return c.text(`${err.name} ${err.message}`, 500)
})
// global middlewares
app.use('/*', async (c, next) => {

	// check if the request is for static files
	if (c.env.ASSETS && !API_PATHS.some(path => c.req.path.startsWith(path))) {
		const url = new URL(c.req.raw.url);
		if (!url.pathname.includes('.')) {
			url.pathname = ""
		}
		return c.env.ASSETS.fetch(url);
	}

	// save language in context
	const lang = c.req.raw.headers.get("x-lang");
	if (lang) { c.set("lang", lang); }
	const msgs = i18n.getMessages(lang || c.env.DEFAULT_LANG);

	// check header x-custom-auth
	const passwords = getPasswords(c);
	if (!c.req.path.startsWith("/open_api") && !c.req.path.startsWith("/telegram/") && passwords && passwords.length > 0) {
		const auth = c.req.raw.headers.get("x-custom-auth");
		if (!auth || !passwords.includes(auth)) {
			return c.text(msgs.CustomAuthPasswordMsg, 401)
		}
	}

	// rate limit for specific endpoints
	if (
		c.req.path.startsWith("/api/new_address")
		|| c.req.path.startsWith("/api/send_mail")
		|| c.req.path.startsWith("/external/api/send_mail")
		|| c.req.path.startsWith("/user_api/register")
		|| c.req.path.startsWith("/user_api/verify_code")
	) {
		const reqIp = c.req.raw.headers.get("cf-connecting-ip")
		if (reqIp && c.env.RATE_LIMITER) {
			const { success } = await c.env.RATE_LIMITER.limit(
				{ key: `${c.req.path}|${reqIp}` }
			)
			if (!success) {
				return c.text(`IP=${reqIp} Rate limit exceeded for ${c.req.path}`, 429)
			}
		}
		// Check access control (blacklist and daily limit)
		const accessControlResponse = await checkAccessControl(c);
		if (accessControlResponse) {
			return accessControlResponse;
		}
	}
	// webhook check
	if (
		c.req.path.startsWith("/api/webhook")
		|| c.req.path.startsWith("/admin/webhook")
		|| c.req.path.startsWith("/admin/mail_webhook")
	) {
		if (!c.env.KV) {
			return c.text(msgs.KVNotAvailableMsg, 400);
		}
		if (!getBooleanValue(c.env.ENABLE_WEBHOOK)) {
			return c.text(msgs.WebhookNotEnabledMsg, 403);
		}
		if (
			c.req.path.startsWith("/api/webhook")
			&& !getBooleanValue(c.env.ENABLE_ADDRESS_WEBHOOK)
		) {
			return c.text(msgs.WebhookNotEnabledMsg, 403);
		}
	}
	if (!c.env.DB) {
		return c.text(msgs.DBNotAvailableMsg, 400);
	}
	if (!c.env.JWT_SECRET) {
		return c.text(msgs.JWTSecretNotSetMsg, 400);
	}
	await next()
});

const checkUserPayload = async (
	c: Context<HonoCustomType>
): Promise<void> => {
	try {
		const token = c.req.raw.headers.get("x-user-token");
		if (!token) return;
		const payload = await Jwt.verify(token, c.env.JWT_SECRET, "HS256");
		// check expired
		if (!payload.exp) return;
		// exp is in seconds
		if (payload.exp < Math.floor(Date.now() / 1000)) {
			return;
		}
		c.set("userPayload", payload as UserPayload);
	} catch (e) {
		console.error(e);
	}
}

const checkoutUserRolePayload = async (
	c: Context<HonoCustomType>
): Promise<void> => {
	try {
		const token = c.req.raw.headers.get("x-user-access-token");
		if (!token) return;
		const payload = await Jwt.verify(token, c.env.JWT_SECRET, "HS256");
		// check expired
		if (!payload.exp) return;
		// exp is in seconds
		if (payload.exp < Math.floor(Date.now() / 1000)) {
			return;
		}
		if (typeof payload?.user_role !== "string") return;
		c.set("userRolePayload", payload.user_role);
	} catch (e) {
		console.error(e);
	}
}

const validateAddressJwtPayload = async (
	c: Context<HonoCustomType>,
	payload: JwtPayload
): Promise<boolean> => {
	if (!payload?.address || !payload?.address_id) return false;
	const row = await c.env.DB.prepare(
		`SELECT name, COALESCE(credential_version, 1) AS credential_version`
		+ ` FROM address WHERE id = ?`
	).bind(payload.address_id).first<{ name: string, credential_version: number }>();
	if (!row || row.name !== payload.address) return false;
	const payloadVersion = Number(payload.credential_version ?? 1);
	return Number(row.credential_version || 1) === payloadVersion;
}

const validateShareJwtPayload = async (
	c: Context<HonoCustomType>,
	payload: JwtPayload
): Promise<boolean> => {
	if (!payload?.share_token_id || !payload?.address_id) return false;
	const row = await c.env.DB.prepare(
		`SELECT t.id`
		+ ` FROM address_share_tokens t`
		+ ` JOIN address a ON a.id = t.address_id`
		+ ` WHERE t.id = ?`
		+ ` AND t.address_id = ?`
		+ ` AND a.name = ?`
		+ ` AND t.revoked_at IS NULL`
		+ ` AND (t.expires_at IS NULL OR t.expires_at > datetime('now'))`
	).bind(payload.share_token_id, payload.address_id, payload.address).first("id");
	return !!row;
}

// api auth
app.use('/api/*', async (c, next) => {
	if (c.req.path.startsWith("/api/new_address")) {
		await checkUserPayload(c);
		await next();
		return;
	}
	if (c.req.path.startsWith("/api/settings")
		|| c.req.path.startsWith("/api/send_mail")
	) {
		await checkoutUserRolePayload(c);
	}
	if (c.req.path.startsWith("/api/address_login")) {
		await next();
		return;
	}

	try {
		let shareTokenReadOnlyDenied = false;
		let credentialDenied = false;
		await jwt({ secret: c.env.JWT_SECRET, alg: "HS256" })(c, async () => {
			const payload = c.get("jwtPayload") as JwtPayload;
			const credentialValid = payload?.share_token_id
				? await validateShareJwtPayload(c, payload)
				: await validateAddressJwtPayload(c, payload);
			if (!credentialValid) {
				credentialDenied = true;
				return;
			}
			if (payload?.share_token_id) {
				const path = c.req.path;
				const method = c.req.method.toUpperCase();
				const shareReadAllowed = (
					(method === "GET" && (
						path === "/api/settings"
						|| path === "/api/mails"
						|| path.startsWith("/api/mails?")
						|| path.startsWith("/api/mail/")
						|| path === "/api/parsed_mails"
						|| path.startsWith("/api/parsed_mails?")
						|| path.startsWith("/api/parsed_mail/")
						|| path === "/api/attachment/list"
					))
					|| (method === "POST" && path === "/api/attachment/get_url")
				);
				if (!shareReadAllowed) {
					shareTokenReadOnlyDenied = true;
					return;
				}
			}
			await next();
		});
		if (shareTokenReadOnlyDenied) {
			const payload = c.get("jwtPayload") as JwtPayload | undefined;
			queueAccessEvent(c, {
				event_type: "share.access.denied",
				actor_type: "share_token",
				actor_id: payload?.share_token_id || null,
				actor_label: payload?.address || null,
				resource_type: "address",
				resource_id: payload?.address_id || null,
				resource_label: payload?.address || null,
				status: "denied",
				failure_reason: "share_token_read_only",
			});
			return c.text("Share token is read-only", 403);
		}
		if (credentialDenied) {
			const lang = c.get("lang") || c.env.DEFAULT_LANG;
			const msgs = i18n.getMessages(lang);
			const payload = c.get("jwtPayload") as JwtPayload | undefined;
			queueAccessEvent(c, {
				event_type: "address.access.denied",
				actor_type: payload?.share_token_id ? "share_token" : "address",
				actor_id: payload?.share_token_id || payload?.address_id || null,
				actor_label: payload?.address || null,
				resource_type: "address",
				resource_id: payload?.address_id || null,
				resource_label: payload?.address || null,
				status: "denied",
				failure_reason: "invalid_credential",
			});
			return c.text(msgs.InvalidAddressCredentialMsg, 401);
		}
	} catch (e) {
		console.warn(e);
		const lang = c.get("lang") || c.env.DEFAULT_LANG;
		const msgs = i18n.getMessages(lang);
		queueAccessEvent(c, {
			event_type: "address.access.denied",
			actor_type: "address",
			status: "denied",
			failure_reason: "invalid_or_missing_credential",
		});
		return c.text(msgs.InvalidAddressCredentialMsg, 401)
	}
});
// user_api auth
app.use('/user_api/*', async (c, next) => {
	if (
		c.req.path.startsWith("/user_api/open_settings")
		|| c.req.path.startsWith("/user_api/register")
		|| c.req.path.startsWith("/user_api/login")
		|| c.req.path.startsWith("/user_api/verify_code")
		|| c.req.path.startsWith("/user_api/passkey/authenticate_")
		|| c.req.path.startsWith("/user_api/oauth2")
	) {
		await next();
		return;
	}

	const lang = c.req.raw.headers.get("x-lang") || c.env.DEFAULT_LANG;
	const msgs = i18n.getMessages(lang);

	try {
		const token = c.req.raw.headers.get("x-user-token");
		if (!token) return c.text(msgs.UserTokenExpiredMsg, 401)
		const payload = await Jwt.verify(token, c.env.JWT_SECRET, "HS256");
		// check expired
		if (!payload.exp) return c.text(msgs.UserTokenExpiredMsg, 401);
		// exp is in seconds
		if (payload.exp < Math.floor(Date.now() / 1000)) {
			return c.text(msgs.UserTokenExpiredMsg, 401)
		}
		c.set("userPayload", payload as UserPayload);
	} catch (e) {
		console.error(e);
		return c.text(msgs.UserTokenExpiredMsg, 401)
	}
	if (c.req.path.startsWith("/user_api/bind_address")) {
		await checkoutUserRolePayload(c);
	}
	if (c.req.path.startsWith('/user_api/bind_address')
		&& c.req.method === 'POST'
	) {
		return jwt({ secret: c.env.JWT_SECRET, alg: "HS256" })(c, next);
	}
	await next();
});
// admin auth
app.use('/admin/*', async (c, next) => {

	// check header x-admin-auth
	if (checkIsAdmin(c)) {
		queueAccessEvent(c, {
			event_type: "admin.access.granted",
			actor_type: "admin",
			actor_label: "x-admin-auth",
			resource_type: "admin_api",
			resource_label: c.req.path,
			status: "success",
		});
		await next();
		return;
	}
	const lang = c.req.raw.headers.get("x-lang") || c.env.DEFAULT_LANG;
	const msgs = i18n.getMessages(lang);
	// check if user is admin
	const access_token = c.req.raw.headers.get("x-user-access-token");
	if (c.env.ADMIN_USER_ROLE && access_token) {
		try {
			const payload = await Jwt.verify(access_token, c.env.JWT_SECRET, "HS256");
			// check expired
			if (!payload.exp) {
				queueAccessEvent(c, {
					event_type: "admin.access.denied",
					actor_type: "user",
					resource_type: "admin_api",
					resource_label: c.req.path,
					status: "denied",
					failure_reason: "user_access_token_expired",
				});
				return c.text(msgs.UserAcceesTokenExpiredMsg, 401);
			}
			// exp is in seconds
			if (payload.exp < Math.floor(Date.now() / 1000)) {
				queueAccessEvent(c, {
					event_type: "admin.access.denied",
					actor_type: "user",
					actor_id: payload.user_id as number | undefined,
					actor_label: payload.user_email as string | undefined,
					resource_type: "admin_api",
					resource_label: c.req.path,
					status: "denied",
					failure_reason: "user_access_token_expired",
				});
				return c.text(msgs.UserAcceesTokenExpiredMsg, 401)
			}
			if (payload.user_role !== c.env.ADMIN_USER_ROLE) {
				queueAccessEvent(c, {
					event_type: "admin.access.denied",
					actor_type: "user",
					actor_id: payload.user_id as number | undefined,
					actor_label: payload.user_email as string | undefined,
					resource_type: "admin_api",
					resource_label: c.req.path,
					status: "denied",
					failure_reason: "user_role_not_admin",
				});
				return c.text(msgs.UserRoleIsNotAdminMsg, 401)
			}
			queueAccessEvent(c, {
				event_type: "admin.access.granted",
				actor_type: "user",
				actor_id: payload.user_id as number | undefined,
				actor_label: payload.user_email as string | undefined,
				resource_type: "admin_api",
				resource_label: c.req.path,
				status: "success",
				metadata: { user_role: payload.user_role },
			});
			await next();
			return;
		} catch (e) {
			console.error(e);
		}
	}

	// disable admin api check
	if (getBooleanValue(c.env.DISABLE_ADMIN_PASSWORD_CHECK)) {
		queueAccessEvent(c, {
			event_type: "admin.access.granted",
			actor_type: "admin",
			actor_label: "admin_check_disabled",
			resource_type: "admin_api",
			resource_label: c.req.path,
			status: "success",
		});
		await next();
		return;
	}

	queueAccessEvent(c, {
		event_type: "admin.access.denied",
		actor_type: "admin",
		resource_type: "admin_api",
		resource_label: c.req.path,
		status: "denied",
		failure_reason: "missing_admin_auth",
	});
	return c.text(msgs.NeedAdminPasswordMsg, 401)
});


app.route('/', commonApi)
app.route('/', openAuthApi)
app.route('/', openShareApi)
app.route('/', mailsApi)
app.route('/', userApi)
app.route('/', adminApi)
app.route('/', apiSendMail)
app.route('/', telegramApi)

const health_check = async (c: Context<HonoCustomType>) => {
	const lang = c.req.raw.headers.get("x-lang") || c.env.DEFAULT_LANG;
	const msgs = i18n.getMessages(lang);
	if (!c.env.DB) {
		return c.text(msgs.DBNotAvailableMsg, 400);
	}
	if (!c.env.JWT_SECRET) {
		return c.text(msgs.JWTSecretNotSetMsg, 400);
	}
	if ((await getAddressCreationDomainNames(c)).length === 0) {
		return c.text(msgs.DomainsNotSetMsg, 400);
	}
	return c.text("OK");
}

app.get('/', health_check)
app.get('/health_check', health_check)
app.all('/*', async c => c.text("Not Found", 404))


export default {
	fetch: app.fetch,
	email: email,
	scheduled: scheduled,
}
