# STWV Management Platform — Web App

React + Vite frontend. Talks to `@workspace/api-server` over `/api/*`.
Authentication is provided by Clerk (`@clerk/react`).

## Dev-only one-click test login

The Sign-In page renders a yellow **Dev Only** panel with four buttons —
**Admin**, **Project Manager**, **Client**, **Freelancer** — that signs you
in instantly as the matching seeded test user (`admin@stwv-dev.com`,
`pm@stwv-dev.com`, `client@stwv-dev.com`, `freelancer@stwv-dev.com`). No
email verification, no password.

How it works:
1. The frontend POSTs the chosen role to `/api/dev/sign-in-token`.
2. The api-server finds (or creates) a Clerk user with the seeded email,
   relinks the seeded `users` DB row to that Clerk account so the role is
   preserved, and returns a short-lived Clerk **Sign-In Token**.
3. The frontend exchanges the ticket via Clerk's
   `signIn.create({ strategy: "ticket", ticket })` and activates the new
   session, exactly like a normal Clerk sign-in.

### Production safety

The feature is gated in three independent places:
- **Frontend:** the `<DevLoginPanel>` is wrapped in `import.meta.env.DEV`.
  Vite dead-code-eliminates it from production builds.
- **Backend:** every route in `artifacts/api-server/src/routes/dev.ts` is
  short-circuited with HTTP 404 when `NODE_ENV === "production"`.
- **Seeded accounts:** the `@stwv-dev.com` test users are inserted by
  `pnpm --filter @workspace/db run seed`. Don't run that against a
  production database.

### Disabling it entirely

Either remove the `devRouter` mount from `routes/index.ts` (kills the
backend) or remove the `<DevLoginPanel>` import from
`pages/sign-in.tsx` (kills the UI). Either change is enough on its own.
