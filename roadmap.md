# Roadmap — STWV Management Platform

A snapshot of what's shipped, what's in flight, and what's next, grouped
by theme. Each line is one task. Status legend:

- ✅ **Shipped** — code is live in this repo
- 🛠 **In progress** — being actively worked on
- 📝 **Proposed** — agreed direction, not yet started

Last reviewed: May 2026.

---

## Auth, setup & foundations

- ✅ Clerk auth (web), JWT bridge to API, role-aware sidebar & private routes
- ✅ 6-role RBAC (admin, germany/india accountant, project manager, client, freelancer)
- ✅ Multi-company tenancy (4 STWV entities seeded)
- ✅ Dev-only one-click test login (Admin / PM / Client / Freelancer)
- ✅ Default-admin auto-promotion via `PLATFORM_ADMIN_EMAILS`
- ✅ SSO callback route fixes
- 🛠 Documentation set + migration-only DB workflow + GitHub push *(this task)*

## Projects & time tracking

- ✅ Projects CRUD with 4 types (one-time, monthly fixed, AMC, internal)
- ✅ Project assignments (employees + freelancers, hourly/monthly rates)
- ✅ Tabbed project detail: Overview · Deliverables (Kanban) · Milestones · Time Entries · Billing Cycle
- ✅ Per-user time tracking with billing summary
- ✅ Todos with priority, due date, role-filtered list
- 📝 Inline editing for deliverables and milestones on the project detail page
- 📝 Inline editing for TODOs (title, priority, due date, assignee)
- 📝 Show project statistics on the dashboard (active projects, hours logged this month)

## Documents — offers, contracts, invoices

- ✅ Offer builder with line items, send/accept, PDF export
- ✅ Offer → Contract conversion
- ✅ Contract management with templates, sign/execute, PDF export
- ✅ Multi-entity invoicing with German VAT (19%) and Indian GST (auto CGST+SGST/IGST/none)
- ✅ DATEV CSV export (Germany) and Tally XML/CSV export (India)
- ✅ Recurring invoice scheduler (auto-clone every 6h)
- ✅ Document Centre — unified view across offers, contracts, invoices
- 📝 Let clients and freelancers accept/reject offers and sign contracts directly from their portal

## Expenses

- ✅ Project expenses table with categories, billable flag, currency
- 📝 Allow expenses to be attached to a receipt image or document
- 📝 Let the Expenses tab filter and sort by category, date, or billable status
- 📝 Show expense costs in the profitability report

## Tax & compliance

- ✅ Tax compliance checklist (DE quarterly VAT + KSt + GewSt; IN monthly GSTR-3B + quarterly GSTR-1)
- ✅ Per-company / per-year checklist seeding and "filed" toggle
- ✅ Tax summary reports per entity
- 📝 Email the tax summary report directly from the Tax Report modal
- 📝 Show net tax payable by including input tax (ITC / Vorsteuer)
- 📝 Drill into the invoices behind each tax report row

## Reporting & analytics

- ✅ Admin dashboard stats (companies, users by role/country)
- ✅ Admin financial overview (pending/overdue invoices, open offers, hours, compliance)
- 📝 Email a weekly revenue & profitability summary to admins
- 📝 Handle multi-currency projects correctly in profitability reports

## Resource & capacity planning

- ✅ Per-user `weekly_capacity_hours` field
- ✅ Capacity grid (planned vs actual hours)
- 📝 Let project managers export the capacity grid as a spreadsheet
- 📝 Show resource workload on the project list and dashboard
- 📝 Set per-project capacity limits and alert when exceeded

## Portals (client / freelancer)

- ✅ Client portal — Projects (with deliverable progress), Invoices, Offers, Contracts, Messages
- ✅ Freelancer portal — Time Log, Projects, Contracts, Invoices, Messages
- 📝 Self-service offer accept / contract sign from the portal *(see Documents)*

## Communication & notifications

- ✅ Per-project message threads with auto-create on first access
- ✅ Notification fan-out to project participants on new messages, deliverable updates, invoices, offers, contracts
- ✅ Notification list + read/dismiss endpoints
- 📝 Show live notification badge in the top bar so staff never miss a message
- 📝 Add file attachment support for messages in the Communication Hub

## Audit log

- ✅ Append-only audit_logs table with DB triggers blocking UPDATE/DELETE
- ✅ Audit Log page with actor / entity / action filtering
- 📝 Capture audit events for more actions (deliverable changes, milestone updates, time entries)
- 📝 Show change details inline on Audit Log rows (before/after field comparison)
