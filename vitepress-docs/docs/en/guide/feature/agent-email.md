# AI Agent Mailbox Usage

For AI agents such as OpenClaw / Codex / Cursor: consume a temp mailbox directly using a user-supplied `Address JWT + API base URL` — list the inbox, fetch a single mail, extract verification codes / magic links.

## Prerequisites

The user must first open the frontend (e.g. `https://mail.example.com`) in a browser and **create or log into a mailbox address**. This step may require passing a Turnstile CAPTCHA that agents cannot complete automatically.

After creating or logging in, the **Address JWT** is displayed in the frontend UI and can be copied directly. The user provides the agent with:

1. **Address JWT** — copy from the frontend UI
2. **API base URL** — same origin as the frontend, e.g. `https://mail.example.com`
3. *(optional)* **Site password** — only if the deployment enabled `x-custom-auth`

### Credential handling

By default, read credentials only from the process environment, a tool secret input, or a user-selected ignored local file; do not create a credential file automatically. Persist credentials only when the user explicitly asks, after confirming the destination is untracked and accessible only to that user. Never echo the JWT in output, logs, or chat.

Validate the JWT with `GET /api/settings` before the first request. Treat `401` as an incorrect, expired, or mismatched credential without echoing or overwriting the old value.

## Why `parsed_mail` API

By design, `/api/mails` and `/api/mail/:id` return raw RFC822 (`raw` field), so the agent must ship a MIME parser to obtain `subject` / `text` / `html`.

To let agents consume the mailbox directly, the project adds **server-parsed** read-only endpoints that reuse the same `postal-mime` logic used by the frontend:

| Task                    | Method | Path                                 | Returns                                   |
| ----------------------- | ------ | ------------------------------------ | ----------------------------------------- |
| Address info            | GET    | `/api/settings`                      | `{ address, send_balance }`               |
| List parsed mails       | GET    | `/api/parsed_mails?limit=&offset=`   | `{ results: [parsedMail], count }`        |
| Get one parsed mail     | GET    | `/api/parsed_mail/:id`               | `parsedMail`                              |

`limit` is clamped to `1..100`, `offset` is 0-based.

`parsedMail` shape:

```json
{
  "id": 42,
  "message_id": "<...>",
  "source": "noreply@foo.com",
  "to": "abc@yourdomain.com",
  "created_at": "2026-04-21 10:00:00",
  "sender":  "Foo <noreply@foo.com>",
  "subject": "Your code is 123456",
  "text":    "Your code is 123456\n",
  "html":    "<p>Your code is <b>123456</b></p>",
  "attachments": [
    { "filename": "a.pdf", "mimeType": "application/pdf", "disposition": "attachment", "size": 12345 }
  ]
}
```

**Attachment binary content is not included** in `parsed_*` responses — only metadata. If you need the bytes, fall back to `/api/mail/:id` and parse the raw source yourself.

## Required headers

- `Authorization: Bearer <JWT>` — required on every `/api/*` request
- `x-custom-auth: <SITE_PASSWORD>` — only when the site enables the private password
- `x-lang: en` or `zh` — optional, error-message language

::: warning Do not confuse Address JWT with User JWT
Address JWT goes in `Authorization: Bearer`, User JWT goes in `x-user-token`. Mixing them returns `401 InvalidAddressCredentialMsg`.
:::

## Examples

### 1. Smoke-test the JWT

```bash
curl -s "$BASE/api/settings" -H "Authorization: Bearer $JWT"
# → { "address": "abc123@example.com", "send_balance": 0 }
```

If this returns `401`, the JWT is wrong / expired / mismatched with `BASE` — ask the user for a fresh one.

### 2. List the inbox (parsed)

```bash
curl -s "$BASE/api/parsed_mails?limit=20&offset=0" \
  -H "Authorization: Bearer $JWT"
```

### 3. Send mail

Requires `send_balance > 0` (check via `/api/settings`). The deployment must have a send method configured (Resend / SMTP / Cloudflare Email Routing binding).

Sending, requesting send access, and deleting sent records are external side effects. Perform them only when the user's current request explicitly authorizes the matching action, and never automatically retry an ambiguous failed send.

| Task                    | Method | Path                            | Body / Returns                              |
| ----------------------- | ------ | ------------------------------- | ------------------------------------------- |
| Request send access     | POST   | `/api/request_send_mail_access` | `{}` → `{ status: "ok" }`                  |
| Send mail               | POST   | `/api/send_mail`                | `sendMailBody` → `{ status: "ok" }`        |
| List sent (sendbox)     | GET    | `/api/sendbox?limit=&offset=`   | `{ results: [...], count }`                |
| Delete sent item        | DELETE | `/api/sendbox/:id`              | `{ success: true }`                        |

`sendMailBody`:

```json
{
  "from_name": "My Name",
  "to_mail": "recipient@example.com",
  "to_name": "Recipient",
  "subject": "Hello",
  "content": "<p>Hi</p>",
  "is_html": true
}
```

`from_name` and `to_name` are optional (empty string is fine). `is_html: false` sends plain text.

```bash
curl -s -X POST "$BASE/api/send_mail" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"from_name":"","to_mail":"someone@example.com","to_name":"","subject":"Test","content":"Hello","is_html":false}'
```

## Fallback: local parse of raw source

If `/api/parsed_mails` / `/api/parsed_mail/:id` returns `404` (older deployment) or a parse error, fall back to `/api/mails` / `/api/mail/:id` (RFC822 `raw`) and **parse locally with the same strategy as the frontend**: `mail-parser-wasm` first, `postal-mime` as fallback (implementation reference: `frontend/src/utils/email-parser.js`).

Prefer parser dependencies already installed in a trusted project checkout. Do not run `npm install` in an unknown working directory; if isolated parsing is necessary, use an explicit temporary directory and remove temporary credentials and mail material afterward.

```js
async function parseRaw(raw) {
    try {
        const { parse_message } = await import('mail-parser-wasm');
        const m = parse_message(raw);
        if (m?.subject && (m?.body_html || m?.text)) {
            return {
                sender: m.sender || '',
                subject: m.subject || '',
                text: m.text || '',
                html: m.body_html || '',
                attachments: (m.attachments || []).map(a => ({
                    filename: a.filename || a.content_id || '',
                    mimeType: a.content_type || '',
                    size: a.content?.length ?? 0,
                })),
            };
        }
    } catch { /* fall through */ }
    const PostalMime = (await import('postal-mime')).default;
    const p = await PostalMime.parse(raw);
    const sender = p.from?.name && p.from?.address
        ? `${p.from.name} <${p.from.address}>`
        : (p.from?.address || '');
    return {
        sender,
        subject: p.subject || '',
        text: p.text || '',
        html: p.html || '',
        attachments: (p.attachments || []).map(a => ({
            filename: a.filename || a.contentId || '',
            mimeType: a.mimeType || '',
            size: a.content?.length ?? 0,
        })),
    };
}

const row = await (await fetch(`${BASE}/api/mail/${id}`, {
    headers: { Authorization: `Bearer ${JWT}` },
})).json();
const parsed = await parseRaw(row.raw);
```

For attachment bytes, use `postal-mime` directly — `parsed.attachments[i].content` is a `Uint8Array`.

## Polling discipline

- Start at 3s, exponential backoff capped at 10s
- Dedupe by mail `id`
- Never poll faster than once per second
- Respect `429` — sleep and retry

## `email-transfer-station-agent-mail` Skill

The canonical Agent Skill lives at `skills/email-transfer-station-agent-mail/` and works with Claude Code, Cursor, Codex, OpenClaw, and similar tools. It does not persist Address JWTs or install parser dependencies in an unknown working directory by default.

Until public release coordinates are finalized, copy it only from a trusted checkout of this repository:

```bash
cp -r skills/email-transfer-station-agent-mail <your-agent-skills-dir>/
```

Read that directory's `SKILL.md` before use and provide the JWT through the process environment, a tool secret input, or a user-selected ignored local file.

## Common errors

- `401 InvalidAddressCredentialMsg` — JWT wrong / expired / sent via the wrong header. Ask the user for a fresh JWT.
- `401 CustomAuthPasswordMsg` — site requires `x-custom-auth`; attach `SITE_PASSWORD`.
- `400 InvalidLimitMsg` / `InvalidOffsetMsg` — `limit` must be 1..100, `offset ≥ 0`.
- `429` — rate limited; back off and retry.
