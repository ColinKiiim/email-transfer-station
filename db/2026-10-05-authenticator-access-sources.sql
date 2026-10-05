-- v0.0.18: source cleanup after the authenticator tables are rebuilt by the
-- database runner. Direct assignments are represented by direct_assigned;
-- assignment:* rows are never valid share links.
DELETE FROM authenticator_share_tokens WHERE token_hash LIKE 'assignment:%';
