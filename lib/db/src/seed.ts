import { db, companiesTable } from "./index";

const companies = [
  {
    name: "STWV UG",
    legalForm: "UG (haftungsbeschränkt)",
    country: "Germany",
    taxRegime: "vat" as const,
    taxNumber: "DE123456789",
    address: "Musterstraße 1, 10115 Berlin, Germany",
    bankDetails:
      "IBAN: DE89 3704 0044 0532 0130 00 | BIC: COBADEFFXXX | Commerzbank",
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
    bankDetails:
      "Account: 1122334455 | IFSC: SBIN0003456 | State Bank of India",
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
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
