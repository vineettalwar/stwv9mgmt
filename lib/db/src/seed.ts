/**
 * Seed script — run with: pnpm --filter @workspace/db run seed
 *
 * Seeds the 4 STWV company entities (idempotent).
 *
 * ADMIN USER SETUP
 * ─────────────────
 * There is no hard-coded admin user because the Clerk user ID is only
 * known after the person signs up. Two ways to bootstrap an admin:
 *
 * Option A (recommended): Set the PLATFORM_ADMIN_EMAILS environment variable
 * in Replit Secrets to a comma-separated list of admin email addresses.
 *   e.g.  PLATFORM_ADMIN_EMAILS=vineet@stwv.de,admin@stwv.de
 * Any user who signs up with one of those emails is automatically assigned
 * the "admin" role via the POST /users self-registration endpoint.
 *
 * Option B: After any user signs up, an existing admin can promote them
 * via PATCH /api/users/:id  { "role": "admin" }.
 */
import { db, companiesTable } from "./index";

const companies = [
  {
    name: "STWV UG",
    legalForm: "UG (haftungsbeschränkt)",
    country: "Germany",
    taxRegime: "vat" as const,
    taxNumber: "DE123456789",
    address: "Musterstraße 1, 10115 Berlin, Germany",
    bankDetails: "IBAN: DE89 3704 0044 0532 0130 00 | BIC: COBADEFFXXX | Commerzbank",
    currency: "EUR" as const,
    isActive: true,
  },
  {
    name: "STWV Technologies Pvt Ltd (GST)",
    legalForm: "Private Limited Company",
    country: "India",
    taxRegime: "gst" as const,
    taxNumber: "29AABCT1332L1ZB",
    address: "Tech Park, Whitefield, Bengaluru, Karnataka 560066, India",
    bankDetails: "Account: 1234567890 | IFSC: HDFC0001234 | HDFC Bank",
    currency: "INR" as const,
    isActive: true,
  },
  {
    name: "STWV Consulting (Non-GST A)",
    legalForm: "Proprietorship",
    country: "India",
    taxRegime: "none" as const,
    taxNumber: null,
    address: "MG Road, New Delhi 110001, India",
    bankDetails: "Account: 9876543210 | IFSC: ICIC0002345 | ICICI Bank",
    currency: "INR" as const,
    isActive: true,
  },
  {
    name: "STWV Services (Non-GST B)",
    legalForm: "Partnership Firm",
    country: "India",
    taxRegime: "none" as const,
    taxNumber: null,
    address: "Bandra Kurla Complex, Mumbai 400051, India",
    bankDetails: "Account: 1122334455 | IFSC: SBIN0003456 | State Bank of India",
    currency: "INR" as const,
    isActive: true,
  },
];

async function seed() {
  console.log("Seeding database...");
  for (const company of companies) {
    const result = await db
      .insert(companiesTable)
      .values(company)
      .onConflictDoNothing()
      .returning({ id: companiesTable.id, name: companiesTable.name });
    if (result.length > 0) {
      console.log(`  Inserted company: ${company.name} (id=${result[0].id})`);
    } else {
      console.log(`  Skipped (already exists): ${company.name}`);
    }
  }
  console.log("Seed complete.");
  console.log("");
  console.log("ADMIN SETUP: Set PLATFORM_ADMIN_EMAILS env var to auto-promote admin users.");
  console.log("  Example: PLATFORM_ADMIN_EMAILS=vineet@stwv.de,admin@stwv.de");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
