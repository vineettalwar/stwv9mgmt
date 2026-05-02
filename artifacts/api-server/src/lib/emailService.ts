import { Resend } from "resend";

function getClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured — add it as a secret");
  return new Resend(apiKey);
}

function resolveFromEmail(taxRegime: string | null | undefined, companyName: string): string {
  if (taxRegime === "vat") {
    return process.env.RESEND_FROM_EMAIL_DE
      ?? process.env.RESEND_FROM_EMAIL
      ?? `${companyName} <onboarding@resend.dev>`;
  }
  return process.env.RESEND_FROM_EMAIL_IN
    ?? process.env.RESEND_FROM_EMAIL
    ?? `${companyName} <onboarding@resend.dev>`;
}

function buildEmailHtml(opts: {
  type: "offer" | "contract" | "invoice";
  docNumber: string;
  title: string;
  recipientName: string;
  fromCompanyName: string;
  currency?: string | null;
  totalAmount?: string | number | null;
  dueDate?: string | null;
  validUntil?: string | null;
  taxRegime?: string | null;
}): string {
  const TYPE_LABELS = { offer: "Offer", contract: "Contract", invoice: "Invoice" };
  const label = TYPE_LABELS[opts.type];
  const BLUE = "#1e3a5f";
  const greeting = opts.recipientName ? `Dear ${escHtml(opts.recipientName)},` : "Dear Client,";
  const actionLine = {
    offer: "Please find your offer attached. Review it at your convenience and reach out if you have any questions.",
    contract: "Please find your contract attached. Review the terms and contact us if you need any clarifications.",
    invoice: "Please find your invoice attached. Payment details are included in the document.",
  }[opts.type];

  const detailRows: string[] = [];
  if (opts.docNumber) {
    detailRows.push(`<tr><td style="color:#64748b;padding:4px 0;width:130px">${label} Number</td><td style="font-weight:600;padding:4px 0">${escHtml(opts.docNumber)}</td></tr>`);
  }
  if (opts.title) {
    detailRows.push(`<tr><td style="color:#64748b;padding:4px 0">Subject</td><td style="font-weight:600;padding:4px 0">${escHtml(opts.title)}</td></tr>`);
  }
  if (opts.currency && opts.totalAmount != null) {
    const amt = parseFloat(String(opts.totalAmount)).toFixed(2);
    detailRows.push(`<tr><td style="color:#64748b;padding:4px 0">Total Amount</td><td style="font-weight:600;padding:4px 0">${opts.currency} ${amt}</td></tr>`);
  }
  if (opts.validUntil) {
    detailRows.push(`<tr><td style="color:#64748b;padding:4px 0">Valid Until</td><td style="font-weight:600;padding:4px 0">${opts.validUntil}</td></tr>`);
  }
  if (opts.dueDate) {
    detailRows.push(`<tr><td style="color:#64748b;padding:4px 0">Due Date</td><td style="font-weight:600;padding:4px 0">${opts.dueDate}</td></tr>`);
  }

  const paymentNote = opts.taxRegime === "vat"
    ? "<p style='color:#64748b;font-size:13px;margin:0'>Payment terms: 30 days net. Late payments accrue interest per §288 BGB.</p>"
    : "<p style='color:#64748b;font-size:13px;margin:0'>Payment terms: 30 days net.</p>";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08)">
        <!-- Header -->
        <tr><td style="background:${BLUE};padding:28px 40px">
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px">${escHtml(opts.fromCompanyName)}</h1>
          <p style="margin:6px 0 0;color:#94a3b8;font-size:13px">${label} · ${escHtml(opts.docNumber)}</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:36px 40px">
          <p style="margin:0 0 16px;color:#1e293b;font-size:15px;white-space:pre-line">${greeting}</p>
          <p style="margin:0 0 28px;color:#475569;font-size:14px;line-height:1.6">${actionLine}</p>
          <!-- Details table -->
          <table cellpadding="0" cellspacing="0" style="width:100%;border-top:2px solid ${BLUE};border-bottom:1px solid #e2e8f0;margin-bottom:28px">
            <tbody style="font-size:14px">
              ${detailRows.join("\n")}
            </tbody>
          </table>
          ${opts.type === "invoice" || opts.type === "offer" ? paymentNote : ""}
          <p style="margin:28px 0 0;color:#475569;font-size:14px">Best regards,<br><strong>${escHtml(opts.fromCompanyName)}</strong></p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#f8fafc;padding:16px 40px;border-top:1px solid #e2e8f0">
          <p style="margin:0;color:#94a3b8;font-size:12px">This email was sent by <strong>${escHtml(opts.fromCompanyName)}</strong> via STWV Management Platform. The PDF document is attached to this email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export interface SendDocumentEmailOpts {
  type: "offer" | "contract" | "invoice";
  docNumber: string;
  title: string;
  recipientName: string;
  recipientEmail: string;
  fromCompanyName: string;
  taxRegime?: string | null;
  currency?: string | null;
  totalAmount?: string | number | null;
  dueDate?: string | null;
  validUntil?: string | null;
  pdfBuffer: Buffer;
  pdfFilename: string;
}

export async function sendDocumentEmail(opts: SendDocumentEmailOpts): Promise<void> {
  const client = getClient();
  const from = resolveFromEmail(opts.taxRegime, opts.fromCompanyName);
  const TYPE_LABELS = { offer: "Offer", contract: "Contract", invoice: "Invoice" };
  const label = TYPE_LABELS[opts.type];
  const subject = `${opts.fromCompanyName}: ${label} ${opts.docNumber} — ${opts.title}`;
  const html = buildEmailHtml(opts);

  await client.emails.send({
    from,
    to: opts.recipientEmail,
    subject,
    html,
    attachments: [
      {
        filename: opts.pdfFilename,
        content: opts.pdfBuffer,
      },
    ],
  });
}
