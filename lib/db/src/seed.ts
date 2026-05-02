/**
 * Seed script — run with: pnpm --filter @workspace/db run seed
 *
 * Seeds:
 *   1. user_roles reference table (6 platform roles)
 *   2. companies (4 STWV entities — idempotent via unique name constraint)
 *   3. Test accounts (6 pre-registered dev accounts using @stwv-dev.com)
 *   4. Default admin user (optional — requires env vars, see below)
 *
 * ADMIN USER BOOTSTRAP
 * ─────────────────────
 * Set env vars before running to seed a default admin user:
 *
 *   PLATFORM_ADMIN_CLERK_ID=user_2abc123...   (from Clerk Dashboard → Users)
 *   PLATFORM_ADMIN_EMAIL=vineet@stwv.de
 *
 * When both are set, this script inserts an admin user record linked to
 * that Clerk account. Idempotent — safe to run multiple times.
 *
 * Alternatively, set PLATFORM_ADMIN_EMAILS=email1,email2 as a Replit Secret.
 * Any user whose Clerk-verified email matches that list is auto-promoted to
 * admin on first sign-in via GET /api/users/me (no seed required).
 */
import { db, companiesTable, usersTable, userRolesTable } from "./index";
import { ROLE_DISPLAY_NAMES, PLATFORM_ROLES } from "./schema/userRoles";

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
  console.log("Seeding database…\n");

  // ── 1. User Roles reference table ──────────────────────────────────────────
  console.log("1. Seeding user_roles reference table…");
  for (const role of PLATFORM_ROLES) {
    const { displayName, description } = ROLE_DISPLAY_NAMES[role];
    const result = await db
      .insert(userRolesTable)
      .values({ role, displayName, description })
      .onConflictDoNothing()
      .returning({ role: userRolesTable.role });
    if (result.length > 0) {
      console.log(`   Inserted role: ${role} ("${displayName}")`);
    } else {
      console.log(`   Skipped (exists): ${role}`);
    }
  }

  // ── 2. Companies ───────────────────────────────────────────────────────────
  console.log("\n2. Seeding companies…");
  for (const company of companies) {
    // Conflict target: companies_name_unique (unique constraint on name column)
    const result = await db
      .insert(companiesTable)
      .values(company)
      .onConflictDoNothing()
      .returning({ id: companiesTable.id, name: companiesTable.name });
    if (result.length > 0) {
      console.log(`   Inserted: ${company.name} (id=${result[0].id})`);
    } else {
      console.log(`   Skipped (exists): ${company.name}`);
    }
  }

  // ── 3. Test accounts (development only) ────────────────────────────────────
  // These accounts use pending:email placeholders so they are linked when a
  // developer signs up through Clerk using the matching email address.
  // Domain: stwv-dev.com — a valid TLD accepted by Clerk.
  const testUsers: Array<{ email: string; firstName: string; lastName: string | null; role: typeof usersTable.$inferInsert["role"] }> = [
    { email: "admin@stwv-dev.com",       firstName: "Test",  lastName: "Admin",      role: "admin" },
    { email: "pm@stwv-dev.com",          firstName: "Test",  lastName: "PM",         role: "project_manager" },
    { email: "client@stwv-dev.com",      firstName: "Test",  lastName: "Client",     role: "client" },
    { email: "freelancer@stwv-dev.com",  firstName: "Test",  lastName: "Freelancer", role: "freelancer" },
    { email: "de-acct@stwv-dev.com",     firstName: "Test",  lastName: "DE Acct",    role: "germany_accountant" },
    { email: "in-acct@stwv-dev.com",     firstName: "Test",  lastName: "IN Acct",    role: "india_accountant" },
  ];

  console.log("\n3. Seeding test accounts…");
  for (const u of testUsers) {
    const result = await db
      .insert(usersTable)
      .values({
        clerkUserId: `pending:${u.email}`,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        isActive: true,
      })
      .onConflictDoNothing()
      .returning({ id: usersTable.id, email: usersTable.email });
    if (result.length > 0) {
      console.log(`   Inserted: ${u.email} (${u.role})`);
    } else {
      console.log(`   Skipped (exists): ${u.email}`);
    }
  }

  // ── 4. Default admin user (optional) ──────────────────────────────────────
  console.log("\n4. Default admin user…");
  const adminClerkId = process.env.PLATFORM_ADMIN_CLERK_ID?.trim();
  const adminEmail = process.env.PLATFORM_ADMIN_EMAIL?.trim();

  if (adminClerkId && adminEmail) {
    const result = await db
      .insert(usersTable)
      .values({
        clerkUserId: adminClerkId,
        email: adminEmail,
        firstName: "Admin",
        lastName: null,
        role: "admin",
        isActive: true,
      })
      .onConflictDoNothing()
      .returning({ id: usersTable.id, email: usersTable.email });
    if (result.length > 0) {
      console.log(`   Inserted admin: ${adminEmail} (id=${result[0].id})`);
    } else {
      console.log(`   Skipped (exists): ${adminEmail}`);
    }
  } else {
    console.log("   Skipped — set PLATFORM_ADMIN_CLERK_ID + PLATFORM_ADMIN_EMAIL to seed an admin.");
    console.log("   Alternative: set PLATFORM_ADMIN_EMAILS secret to auto-promote on first sign-in.");
  }

  console.log("\nSeed complete.");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
