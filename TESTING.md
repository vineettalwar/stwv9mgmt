# Testing Guide

This document lists the test accounts available in development and explains how to sign in using Clerk.

## Test Accounts

All test accounts use the `@stwv-dev.com` domain, which is accepted by Clerk.

| Email | Role | Access |
|-------|------|--------|
| `admin@stwv-dev.com` | Admin | Full platform access — manage users, companies, projects, invoices, and all settings |
| `pm@stwv-dev.com` | Project Manager | Create and manage projects, milestones, deliverables, and team assignments |
| `client@stwv-dev.com` | Client | View projects and deliverables assigned to their company; access the client portal |
| `freelancer@stwv-dev.com` | Freelancer | View and manage their own assignments, timesheets, and invoices |
| `de-acct@stwv-dev.com` | Germany Accountant | Access German entity financials, invoices, and tax records (STWV UG) |
| `in-acct@stwv-dev.com` | India Accountant | Access Indian entity financials, invoices, and tax records (STWV India entities) |

## How to Sign In During Development

The test accounts are pre-registered in the database as pending placeholders. When you sign up through Clerk using a matching email, the system automatically links your Clerk account to the correct role.

**Steps:**

1. Open the app and click **Sign In**.
2. On the Clerk sign-in page, click **Sign up** (or navigate to the sign-up page).
3. Enter one of the test email addresses above (e.g. `admin@stwv-dev.com`).
4. Clerk will send a one-time passcode (OTP) to that email address. Enter it to verify.
5. Complete the sign-up flow. Clerk will create your account.
6. The platform automatically links your new Clerk account to the pre-registered user record with the correct role.
7. You are now signed in with the role shown in the table above.

> **Note:** Steps 2–6 only happen the first time. On subsequent visits, just sign in normally with your email and Clerk will authenticate you directly.

## Default Role for New Accounts

Any email address **not listed above** that signs up will automatically receive the `freelancer` role. To grant a different role, an admin must pre-register the user via the admin panel before they sign up.

## Re-Seeding the Database

If you need to reset the test accounts (e.g. after a database wipe), run:

```bash
pnpm --filter @workspace/db run seed
```

The seed script is idempotent — running it multiple times is safe and will not create duplicate records.

## Applying the Email Migration to an Existing Database

If you have an older development database that still contains `@stwv.test` emails, apply the one-off migration script to fix them:

```bash
psql $DATABASE_URL -f scripts/migrate-test-emails.sql
```

This updates the six test account rows in-place without requiring a re-seed. It is safe to run more than once.
