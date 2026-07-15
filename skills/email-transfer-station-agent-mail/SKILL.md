---
name: email-transfer-station-agent-mail
description: Read, poll, and explicitly send Email Transfer Station mailbox messages with a user-supplied Address JWT and API base URL. Use for inbox listing, parsed message retrieval, send-balance checks, requested sends, and sent-item management through /api/* endpoints. The skill does not create mailboxes, solve CAPTCHA, persist credentials automatically, or grant permission for unrequested send/delete operations.
---

# Email Transfer Station agent mail

## Inputs

Require:

- `BASE`: the deployment origin, such as `https://mail.example.com`.
- `JWT`: an Address JWT created or copied by the user in the frontend.
- `SITE_PASSWORD`: optional, only when the deployment requires `x-custom-auth`.

Do not confuse the Address JWT with the user-account token used by `x-user-token`.

## Credentials

Prefer process environment variables, the current tool's secret input, or a user-designated ignored local file. Never create a credential file by default, print a token, place it in chat/history, or commit it. If the user explicitly requests persistence, verify the destination is ignored and restrict it to the user account.

Send these headers only to the configured `BASE` origin:

- `Authorization: Bearer <JWT>` on mailbox `/api/*` requests.
- `x-custom-auth: <SITE_PASSWORD>` only when required.
- optional `x-lang: en` or `zh`.

Smoke-test once with `GET /api/settings`. Treat `401` as an expired, mismatched, or incorrectly supplied credential; ask for a fresh credential without echoing the old one.

## Read mail

Use the server-parsed endpoints first:

| Task | Method | Path |
| --- | --- | --- |
| Address and send balance | GET | `/api/settings` |
| Inbox | GET | `/api/parsed_mails?limit=20&offset=0` |
| One message | GET | `/api/parsed_mail/:id` |

Keep `limit` between 1 and 100 and `offset` at least 0. Return only the fields the user requested; do not dump private mailbox bodies into logs.

## Poll

Start at three seconds, deduplicate by numeric mail `id`, and exponentially back off to ten seconds. Never poll more than once per second. Respect `429` and stop when the user's condition is met.

## Send and delete

Only perform a send, access request, or delete when the user's current request clearly authorizes that side effect.

| Task | Method | Path |
| --- | --- | --- |
| Request send access | POST | `/api/request_send_mail_access` |
| Send | POST | `/api/send_mail` |
| Sent items | GET | `/api/sendbox?limit=20&offset=0` |
| Delete sent item | DELETE | `/api/sendbox/:id` |

Before sending, check `send_balance`, confirm the intended recipient, subject, plain-text/HTML mode, and content from the request, then report the sanitized result. Do not retry an ambiguous failed send automatically because it may have succeeded upstream.

Send body:

```json
{
  "from_name": "",
  "to_mail": "recipient@example.com",
  "to_name": "",
  "subject": "Hello",
  "content": "Hello",
  "is_html": false
}
```

## Raw fallback

If parsed endpoints are unavailable, fetch `/api/mails` and `/api/mail/:id`, then parse the RFC822 `raw` field with the existing Email Transfer Station dependencies (`mail-parser-wasm`, then `postal-mime`). Do not run `npm install` in an unknown working directory. Use an existing project checkout or an explicitly isolated temporary directory and remove temporary credential/material files afterward.

## Errors

- `401 InvalidAddressCredentialMsg`: refresh the Address JWT or fix the header.
- `401 CustomAuthPasswordMsg`: supply `x-custom-auth` through a secret input.
- `400 InvalidLimitMsg` / `InvalidOffsetMsg`: correct pagination.
- `404` on parsed endpoints: use the raw fallback.
- `429`: back off and retry only read operations automatically.
