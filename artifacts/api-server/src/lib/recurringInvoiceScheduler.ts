import { eq, and, lte, isNotNull } from "drizzle-orm";
import { db, invoicesTable, invoiceLineItemsTable, companiesTable } from "@workspace/db";

function addInterval(dateStr: string, interval: string): string {
  const date = new Date(dateStr);
  if (interval === "quarterly") {
    date.setMonth(date.getMonth() + 3);
  } else {
    date.setMonth(date.getMonth() + 1);
  }
  return date.toISOString().slice(0, 10);
}

async function processDueRecurringInvoices(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  const dueInvoices = await db
    .select()
    .from(invoicesTable)
    .where(
      and(
        eq(invoicesTable.isRecurring, true),
        isNotNull(invoicesTable.nextInvoiceDate),
        lte(invoicesTable.nextInvoiceDate, today),
      ),
    );

  for (const invoice of dueInvoices) {
    if (!invoice.nextInvoiceDate || !invoice.recurringInterval) continue;

    const lineItems = await db
      .select()
      .from(invoiceLineItemsTable)
      .where(eq(invoiceLineItemsTable.invoiceId, invoice.id))
      .orderBy(invoiceLineItemsTable.sortOrder);

    const [company] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.id, invoice.companyId));

    if (!company) continue;

    const invoiceNumber = `INV-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    const [newInvoice] = await db
      .insert(invoicesTable)
      .values({
        invoiceNumber,
        companyId: invoice.companyId,
        projectId: invoice.projectId,
        clientId: invoice.clientId,
        title: invoice.title,
        notes: invoice.notes,
        issueDate: invoice.nextInvoiceDate,
        dueDate: invoice.dueDate
          ? addInterval(invoice.nextInvoiceDate, "monthly")
          : null,
        status: "draft",
        taxType: invoice.taxType,
        taxRate: invoice.taxRate,
        sellerState: invoice.sellerState,
        buyerState: invoice.buyerState,
        subtotal: invoice.subtotal,
        taxAmount: invoice.taxAmount,
        totalAmount: invoice.totalAmount,
        currency: invoice.currency,
        isRecurring: false,
        recurringInterval: null,
        nextInvoiceDate: null,
        parentInvoiceId: invoice.id,
        createdBy: invoice.createdBy,
      })
      .returning();

    if (lineItems.length > 0) {
      await db.insert(invoiceLineItemsTable).values(
        lineItems.map((li) => ({
          invoiceId: newInvoice.id,
          timeEntryId: li.timeEntryId,
          description: li.description,
          quantity: li.quantity,
          unitPrice: li.unitPrice,
          amount: li.amount,
          sortOrder: li.sortOrder,
        })),
      );
    }

    await db
      .update(invoicesTable)
      .set({
        nextInvoiceDate: addInterval(invoice.nextInvoiceDate, invoice.recurringInterval),
        updatedAt: new Date(),
      })
      .where(eq(invoicesTable.id, invoice.id));
  }
}

export function startRecurringInvoiceScheduler(): void {
  const RUN_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours

  async function run() {
    try {
      await processDueRecurringInvoices();
    } catch (err) {
      console.error("[RecurringInvoiceScheduler] Error:", err);
    }
  }

  run();
  setInterval(run, RUN_INTERVAL_MS);
}
