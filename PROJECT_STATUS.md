# Email Transfer Station Project Status

Current development label: `v0.0.0(test)`.

This repository is the future public code area for Email Transfer Station. It started as a development copy of `dreamhunter2333/cloudflare_temp_email` source at commit `72bbfe8fd6d329237fa2e70b17cb95031597b345`, with the upstream remote preserved as `upstream`.

Current local development changes add the first Email Transfer Station-specific MVP slice:

- per-address share-token links for `/i/:token` read-only mailbox access;
- ImprovMX free-forwarding collector support for non-Cloudflare domains;
- original-recipient mail metadata for grouped domain/address admin views.
- manual credential rotation so old address auto-login links can be invalidated without deleting and recreating an address.
- per-address bulk revocation for share links, with every short-lived share session re-checking token activity before reading mailbox data.
- safer local defaults for the current product shape: administrator-created addresses, no anonymous public creation, no non-admin deletion, and share-only token pages without the upstream global navigation.
- first-pass public surface cleanup: the default Header brand is `Email Transfer Station`, the top-right version/GitHub entry is hidden, and the global footer copyright is not rendered.
- public release cleanup baseline: inherited GitHub workflows are disabled, inherited Claude release skills are removed, package names use `email-transfer-station-*`, runtime version is `v0.0.0-test`, and root README files describe the current MVP instead of the upstream project.
- address management improvements: admin-editable address labels/owner notes, share-link labels, optional share expiration, share-record listing, and single-token revocation.
- admin mail grouping: domain/address grouping sidebar with exact-address and prefix filters.
- Gmail copy shortcut: admin account settings can add a forwarding rule that keeps a copy in Gmail.
- routing status reporting: Worker config exposes Cloudflare-native versus ImprovMX-collector domain status.
- external Webhook configuration: admins can set a mail Webhook target URL for third-party service integration.

Before public release, this repo still needs inherited VitePress docs source cleanup, GitHub `origin` setup, and a license/NOTICE pass. The original MIT license must remain preserved.
