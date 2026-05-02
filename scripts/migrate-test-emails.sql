-- One-off migration: fix test account emails from @stwv.test to @stwv-dev.com
-- The .test TLD is rejected by Clerk; .com is accepted.
--
-- Run against the development database:
--   psql $DATABASE_URL -f scripts/migrate-test-emails.sql
--
-- This migration is idempotent — running it again when the rows already use
-- @stwv-dev.com will match zero rows and make no changes.

BEGIN;

UPDATE users SET email = 'admin@stwv-dev.com',       clerk_user_id = 'pending:admin@stwv-dev.com'       WHERE email = 'admin@stwv.test';
UPDATE users SET email = 'pm@stwv-dev.com',           clerk_user_id = 'pending:pm@stwv-dev.com'           WHERE email = 'pm@stwv.test';
UPDATE users SET email = 'client@stwv-dev.com',       clerk_user_id = 'pending:client@stwv-dev.com'       WHERE email = 'client@stwv.test';
UPDATE users SET email = 'freelancer@stwv-dev.com',   clerk_user_id = 'pending:freelancer@stwv-dev.com'   WHERE email = 'freelancer@stwv.test';
UPDATE users SET email = 'de-acct@stwv-dev.com',      clerk_user_id = 'pending:de-acct@stwv-dev.com'      WHERE email = 'de-acct@stwv.test';
UPDATE users SET email = 'in-acct@stwv-dev.com',      clerk_user_id = 'pending:in-acct@stwv-dev.com'      WHERE email = 'in-acct@stwv.test';

COMMIT;
