# Admin guide — STWV Management Platform

This guide is for **non-developers** who run the platform day-to-day:
office admins, accountants, and project managers. It walks through what
each area of the app does and the most common things you'll want to do
inside it.

If you're a developer, you probably want [README.md](../README.md) or
[design.md](../design.md) instead.

---

## Roles at a glance

The platform has six roles. Your role determines what you can see and do.

| Role | What they can do |
|------|------------------|
| **Admin** | Everything. Add users and companies, manage all projects, see all financials, run all reports, manage compliance. |
| **Project Manager (PM)** | Create and run projects. Assign team members. Create offers, contracts, invoices for the projects they manage. |
| **Germany Accountant** | Read access to everything. Full edit on STWV UG financials, German invoices, DATEV export, German tax compliance. |
| **India Accountant** | Read access to everything. Full edit on Indian entities' financials, Indian invoices, Tally export, GST compliance. |
| **Client** | Sees only the projects, offers, contracts, invoices, and messages that belong to their company. Uses the **Client Portal**. |
| **Freelancer** | Sees only their own assignments, time entries, contracts, invoices, and messages. Uses the **Freelancer Portal**. |

---

## Signing in

1. Go to the platform URL.
2. Click **Sign In** and enter your work email.
3. Clerk sends you a verification email or one-time passcode the first
   time. Subsequent sign-ins are one-click.
4. You land on the **Dashboard** (or the appropriate Portal if you're a
   client/freelancer).

If you signed in but the dashboard is blank, your email isn't yet linked
to a platform user — ask an admin to add you, or, for the bootstrap
admin, set the `PLATFORM_ADMIN_EMAILS` environment variable to your
email and sign in again.

---

## The four companies

The platform is hard-wired around four legal entities, seeded on first
run:

1. **STWV UG** — Germany, VAT-registered, EUR.
2. **STWV Technologies Pvt Ltd (GST)** — India, GST-registered, INR.
3. **STWV Consulting (Non-GST A)** — India, no GST, INR.
4. **STWV Services (Non-GST B)** — India, no GST, INR.

Every project, offer, contract, and invoice is owned by exactly one of
these. Tax behaviour follows the company's `tax_regime` automatically.

### Adding or editing a company

**Admin only.** Go to **Companies** → click an entity to view, then use
the inline edit form. You can update legal form, tax number, address,
bank details, and currency. Deactivating a company hides it from new
work but preserves history.

---

## Users

**Admin only.** Go to **Users** to see all platform users.

- **Add a user**: click **Add User**, fill in name + email + role, save.
  The user can then sign in with that email via Clerk.
- **Edit role**: open the user, change the role dropdown, save.
- **Assign companies**: open the user, scroll to **Company assignments**,
  add or remove. Required for accountants (so they only see "their"
  entity) and clients (one company per client).
- **Deactivate**: toggle **Active** off. The account stays but can't sign
  in or be assigned to new projects.

---

## Projects

**Project managers and admins** create and run projects. Accountants can
view them.

### Creating a project

Go to **Projects** → **New Project**. Pick:

- **Type**: One-time, Monthly fixed, AMC (annual maintenance), or
  Internal.
- **Company**: which entity owns the project (drives currency + tax).
- **Client**: optional, links the project to a client user for portal
  access.
- **Billing model**: hourly, fixed, or retainer.
- **Fixed allocation hours** (for retainers / monthly fixed): how many
  hours per cycle the client paid for.

### Inside a project

The detail page has five tabs:

1. **Overview** — name, description, dates, edit/delete.
2. **Deliverables** — Kanban board (Todo · In progress · Done). Add,
   move, assign deliverables.
3. **Milestones** — date-driven checkpoints. Mark them complete when
   reached.
4. **Time entries** — log billable/non-billable hours per team member
   per day.
5. **Billing cycle** — for retainers/fixed projects, shows hours used
   vs. allocated for the selected month.

### Assigning a team

In **Overview** → **Team**, add employees and freelancers. Set the
hourly or monthly rate for each — used by profitability reports.

---

## Time tracking

Everyone can log their own hours. Admins and accountants can see
everyone's hours.

- Go to **Time tracking** → **Add entry**, pick project, date, hours,
  optional note, save.
- The Project detail page also lets you add an entry scoped to that
  project.
- The dashboard summarises hours logged this month (per role).

---

## Todos

A general-purpose task list separate from project deliverables. Each
todo can be tied to a project, a client, or be standalone. Set
priority + due date + assignee. Toggle done from the list.

---

## Offers, contracts, invoices

These three are the **Documents** flow:

```
Offer → (accept) → Contract → (work happens) → Invoice
```

### Offers

Go to **Offers** → **New Offer**. Pick the issuing company, the
client, add line items (description, quantity, unit price). Tax is
calculated automatically based on the issuing company. Send the offer
(state goes Draft → Sent), and the client either accepts or rejects.

You can export an offer to PDF from the offer detail page.

### Contracts

Convert an accepted offer into a contract with one click, or create a
contract from scratch using a **Contract template**. Contracts have
sign/execute states and a PDF export.

### Invoices

Go to **Invoices** → **New Invoice**. Pick the company, client, line
items. Tax is auto-applied:

- **STWV UG (Germany)** — 19% VAT.
- **STWV Technologies (India GST)** — CGST 9% + SGST 9% if intra-state,
  IGST 18% if inter-state. Auto-detected from the buyer's GSTIN state
  code.
- **Non-GST entities** — no tax.

Invoice numbers are gap-free per company and year (e.g. `UG-2026-0007`).

#### Recurring invoices

Mark an invoice as recurring and pick a cadence (monthly/quarterly).
The scheduler clones it automatically every cycle so you never miss a
retainer billing.

#### Exports

- **Germany Accountant / Admin** → **Export to DATEV** (CSV).
- **India Accountant / Admin** → **Export to Tally** (XML or CSV).

### Document Centre

A unified search across all offers, contracts, and invoices for all
four entities. Filter by type, company, project, client. Useful for
"find me everything we sent to ACME Corp last year".

---

## Communication Hub

Per-project message threads. The first time anyone opens the Hub for a
project, a thread is created automatically. Anyone assigned to the
project (admin, PM, accountants on that entity, the client, the
freelancer) can read and reply. Sending a message notifies everyone
else on the project.

---

## Notifications

The bell icon in the top bar lists recent notifications. Click one to
jump to the relevant entity, or **Mark all read**. Notification types:
new message, deliverable update, invoice issued, offer sent, contract
ready.

---

## Tax compliance

**Admin and accountants only.** Go to **Compliance**.

- **Germany checklist** — quarterly VAT return, annual KSt
  (Körperschaftsteuer), annual GewSt (Gewerbesteuer).
- **India checklist** — monthly GSTR-3B, quarterly GSTR-1.

Click **Seed checklist** for a company + year + regime to populate
the standard items with deadlines. Tick items off as you file them; the
"filed at" timestamp is stamped automatically. Items past their
deadline turn **Overdue** in red.

---

## Reports

The **Dashboard** shows admin financial overview: pending/overdue
invoices, open offers, hours logged this month, compliance items due
soon, totals per entity.

Per-entity tax summary reports are available from each company's detail
page (and inside the Compliance tab).

---

## Client and Freelancer Portals

Clients sign in and land on **/client-portal** with five tabs:

- **Projects** — what we're building for them, with deliverable
  progress bars.
- **Invoices** — their invoices, status, total due.
- **Offers** — pending offers to review.
- **Contracts** — signed and pending contracts.
- **Messages** — per-project threads.

Freelancers land on **/freelancer-portal** with:

- **Time log** — log and review their own hours.
- **Projects** — projects they're assigned to.
- **Contracts** — their freelancer contracts.
- **Invoices** — invoices they've issued or received.
- **Messages** — per-project threads.

---

## Audit log

**Admin only.** Every create / update / delete on important entities is
recorded with the actor, timestamp, and (where relevant) the before /
after values. The audit log is **append-only at the database level** —
nobody can edit or delete a row, even with direct DB access. Use it to
answer "who changed what, when".

---

## Common workflows

### Onboard a new freelancer

1. **Users** → **Add User** → role: Freelancer.
2. Tell them to sign in with that email.
3. Open the relevant project → **Team** → **Add member** → their name,
   set their hourly or monthly rate.
4. They now see the project in their **Freelancer Portal**.

### Bill a monthly retainer

1. The recurring scheduler will create a new invoice from the template
   automatically every cycle.
2. Or do it manually: open last month's invoice → **Duplicate** →
   change the billing period → save → send.

### Close out a quarter (Germany)

1. **Compliance** → STWV UG → current quarter.
2. File the VAT return externally.
3. Tick the **VAT return** item as filed.
4. Open **Invoices** → filter by STWV UG + the quarter → **Export
   to DATEV** for your tax advisor.

### Close out a month (India GST)

1. **Compliance** → STWV Technologies (GST) → current month.
2. Export Tally XML from **Invoices** → file GSTR-3B externally.
3. Tick the GSTR-3B item as filed.

---

## Getting help

- For platform bugs or feature requests, talk to your admin or open a
  ticket in your normal issue tracker.
- For Clerk sign-in issues, the Clerk dashboard shows account state and
  can resend verification emails.
- For DB-level questions, the developer guide is in
  [README.md](../README.md), [design.md](../design.md), and
  [memory.md](../memory.md).
