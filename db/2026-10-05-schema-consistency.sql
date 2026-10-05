-- v0.0.17: executed by worker/src/database.ts after the three authenticator
-- tables have been rebuilt atomically from schema.sql. This reconciles both
-- published v0.0.16 shapes (with and without foreign keys) without changing
-- access-source semantics. No owner-derived permission is added.
-- Definitions stay solely in schema.sql; old migration files stay unchanged.
DROP INDEX IF EXISTS idx_user_authenticators_owner;
DROP INDEX IF EXISTS idx_authenticator_shares_item;
