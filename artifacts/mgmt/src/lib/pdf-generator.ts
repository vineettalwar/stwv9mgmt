export type TaxSummaryBandData = {
  label: string;
  taxType: string;
  taxRate: string;
  invoiceCount: number;
  grossAmount: string;
  netAmount: string;
  taxAmount: string;
  cgst?: string | null;
  sgst?: string | null;
  igst?: string | null;
};

export type TaxSummaryPeriodData = {
  periodStart: string;
  periodEnd: string;
  invoiceCount: number;
  totalGross: string;
  totalNet: string;
  totalTax: string;
  breakdown: TaxSummaryBandData[];
};

export type TaxSummaryReportData = {
  companyId: number;
  companyName: string;
  regime: "germany" | "india";
  periodStart: string;
  periodEnd: string;
  currency: string;
  invoiceCount: number;
  totalGross: string;
  totalNet: string;
  totalTax: string;
  breakdown: TaxSummaryBandData[];
  previousPeriod?: TaxSummaryPeriodData | null;
};

type LineItem = {
  description: string;
  quantity: string | number;
  unitPrice: string | number;
  amount: string | number;
};

type CompanyInfo = {
  name: string;
  taxNumber?: string | null;
  address?: string | null;
  bankDetails?: string | null;
  currency: string;
};

type ClientInfo = {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
};

type OfferData = {
  offerNumber: string;
  title: string;
  status?: string | null;
  validUntil?: string | null;
  notes?: string | null;
  subtotal: string | number;
  taxAmount: string | number;
  totalAmount: string | number;
  currency: string;
  company?: CompanyInfo | null;
  client?: ClientInfo | null;
  lineItems?: LineItem[];
};

type ContractData = {
  contractNumber: string;
  title: string;
  type: string;
  content: string;
  status: string;
  startDate?: string | null;
  endDate?: string | null;
  company?: CompanyInfo | null;
  client?: ClientInfo | null;
};

type InvoiceData = {
  invoiceNumber: string;
  title: string;
  issueDate: string;
  dueDate?: string | null;
  status: string;
  taxType: string;
  taxRate: string | number;
  subtotal: string | number;
  taxAmount: string | number;
  totalAmount: string | number;
  currency: string;
  notes?: string | null;
  company?: CompanyInfo | null;
  client?: ClientInfo | null;
  lineItems?: LineItem[];
};

function esc(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return "";
  return String(val)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escAttr(val: string): string {
  return esc(val);
}

function clientName(client?: ClientInfo | null): string {
  if (!client) return "—";
  return esc([client.firstName, client.lastName].filter(Boolean).join(" ") || client.email);
}

function fmt(val: string | number): string {
  return parseFloat(String(val)).toFixed(2);
}

function openPrintWindow(html: string, title: string) {
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head>
    <title>${esc(title)}</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; background: #fff; padding: 40px; font-size: 13px; line-height: 1.6; }
      h1 { font-size: 26px; font-weight: 700; color: #0f172a; }
      h2 { font-size: 16px; font-weight: 600; color: #0f172a; margin-bottom: 4px; }
      h3 { font-size: 13px; font-weight: 600; color: #475569; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
      .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
      .doc-number { font-size: 13px; color: #64748b; margin-top: 4px; font-family: monospace; }
      .badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; text-transform: uppercase; }
      .badge-draft { background: #f1f5f9; color: #475569; }
      .badge-sent { background: #dbeafe; color: #1d4ed8; }
      .badge-accepted, .badge-paid, .badge-signed { background: #d1fae5; color: #065f46; }
      .badge-rejected, .badge-cancelled { background: #fee2e2; color: #991b1b; }
      .badge-overdue { background: #fef3c7; color: #92400e; }
      .section { margin-bottom: 28px; }
      .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
      .label { font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px; }
      .value { font-size: 13px; color: #1e293b; }
      .divider { border: none; border-top: 1px solid #e2e8f0; margin: 24px 0; }
      table { width: 100%; border-collapse: collapse; }
      th { text-align: left; padding: 8px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; border-bottom: 2px solid #e2e8f0; }
      th:last-child, td:last-child { text-align: right; }
      td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #334155; }
      .totals { margin-top: 16px; }
      .totals-row { display: flex; justify-content: space-between; padding: 4px 12px; font-size: 13px; color: #475569; }
      .totals-total { display: flex; justify-content: space-between; padding: 8px 12px; font-size: 15px; font-weight: 700; color: #0f172a; border-top: 2px solid #0f172a; margin-top: 4px; }
      .notes { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; font-size: 12px; color: #475569; white-space: pre-wrap; }
      .content-pre { white-space: pre-wrap; font-size: 13px; line-height: 1.7; color: #334155; }
      @media print {
        body { padding: 20px; }
        button { display: none; }
      }
    </style>
  </head><body>${html}<br><br><button onclick="window.print()" style="background:#0f172a;color:#fff;border:none;padding:8px 20px;border-radius:6px;cursor:pointer;font-size:13px">Print / Save as PDF</button></body></html>`);
  win.document.close();
}

/** Render a small "prev: X (▲X.X%)" sub-line for a numeric cell when previousPeriod is present. Returns "" when no prev. */
function pdfDeltaSub(curStr: string | number, prevStr: string | number | null | undefined, currency?: string): string {
  if (prevStr === null || prevStr === undefined || prevStr === "") return "";
  const cur = typeof curStr === "number" ? curStr : parseFloat(String(curStr));
  const prev = typeof prevStr === "number" ? prevStr : parseFloat(String(prevStr));
  if (Number.isNaN(cur) || Number.isNaN(prev)) return "";
  const prevDisplay = currency ? `${esc(currency)} ${prev.toFixed(2)}` : esc(prev);
  let arrow = "";
  let color = "#94a3b8";
  let pctTxt = "0.0%";
  if (prev === 0 && cur === 0) {
    arrow = "—";
  } else if (prev === 0) {
    arrow = "▲";
    color = "#059669";
    pctTxt = "100.0%";
  } else {
    const change = ((cur - prev) / Math.abs(prev)) * 100;
    if (Math.abs(change) < 0.05) {
      arrow = "—";
    } else if (change > 0) {
      arrow = "▲";
      color = "#059669";
      pctTxt = `${change.toFixed(1)}%`;
    } else {
      arrow = "▼";
      color = "#dc2626";
      pctTxt = `${Math.abs(change).toFixed(1)}%`;
    }
  }
  return `<div style="font-size:10px;color:#94a3b8;margin-top:2px">prev: ${prevDisplay} <span style="color:${color};font-weight:600">${arrow} ${pctTxt}</span></div>`;
}

export function generateTaxSummaryPdf(report: TaxSummaryReportData) {
  const isGermany = report.regime === "germany";
  const regimeLabel = isGermany ? "Germany — VAT Voranmeldung Summary" : "India — GSTR-3B Summary";
  const cur = esc(report.currency);
  const prev = report.previousPeriod ?? null;
  const withPrev = !!prev;

  // Build prev-row lookup
  const prevByKey = new Map<string, TaxSummaryBandData>();
  if (prev) for (const b of prev.breakdown) prevByKey.set(`${b.taxType}|${b.taxRate}`, b);

  // Combine current rows + prev-only rows
  type Row = { cur: TaxSummaryBandData | null; prv: TaxSummaryBandData | null; label: string };
  const allRows: Row[] = report.breakdown.map(b => ({
    cur: b, prv: prevByKey.get(`${b.taxType}|${b.taxRate}`) ?? null, label: b.label,
  }));
  if (prev) {
    for (const pb of prev.breakdown) {
      if (!report.breakdown.some(b => b.taxType === pb.taxType && b.taxRate === pb.taxRate)) {
        allRows.push({ cur: null, prv: pb, label: `${pb.label} (prev only)` });
      }
    }
  }

  const renderAmt = (val: string | null | undefined, prevVal: string | null | undefined, withCur: boolean): string => {
    const main = val != null && val !== "" ? `${cur} ${fmt(val)}` : "—";
    if (!withPrev) return main;
    return `${main}${pdfDeltaSub(val ?? 0, prevVal ?? (withCur ? 0 : ""), report.currency)}`;
  };
  const renderCount = (val: number | null | undefined, prevVal: number | null | undefined): string => {
    const main = val != null ? esc(val) : "0";
    if (!withPrev) return main;
    return `${main}${pdfDeltaSub(val ?? 0, prevVal ?? 0)}`;
  };

  const bandRows = allRows.map(({ cur: b, prv: pb, label }) => {
    const inv = b?.invoiceCount ?? 0;
    if (isGermany) {
      return `
        <tr${b ? "" : ' style="background:#f8fafc;font-style:italic;color:#64748b"'}>
          <td>${esc(label)}</td>
          <td style="text-align:right;vertical-align:top">${renderCount(inv, pb?.invoiceCount)}</td>
          <td style="text-align:right;vertical-align:top">${renderAmt(b?.netAmount ?? null, pb?.netAmount, !!b)}</td>
          <td style="text-align:right;vertical-align:top">${renderAmt(b?.taxAmount ?? null, pb?.taxAmount, !!b)}</td>
          <td style="text-align:right;vertical-align:top">${renderAmt(b?.grossAmount ?? null, pb?.grossAmount, !!b)}</td>
        </tr>`;
    }
    return `
      <tr${b ? "" : ' style="background:#f8fafc;font-style:italic;color:#64748b"'}>
        <td>${esc(label)}</td>
        <td style="text-align:right;vertical-align:top">${renderCount(inv, pb?.invoiceCount)}</td>
        <td style="text-align:right;vertical-align:top">${renderAmt(b?.netAmount ?? null, pb?.netAmount, !!b)}</td>
        <td style="text-align:right;vertical-align:top">${b?.cgst ? renderAmt(b.cgst, pb?.cgst, true) : (pb?.cgst && withPrev ? renderAmt(null, pb.cgst, false) : "—")}</td>
        <td style="text-align:right;vertical-align:top">${b?.sgst ? renderAmt(b.sgst, pb?.sgst, true) : (pb?.sgst && withPrev ? renderAmt(null, pb.sgst, false) : "—")}</td>
        <td style="text-align:right;vertical-align:top">${b?.igst ? renderAmt(b.igst, pb?.igst, true) : (pb?.igst && withPrev ? renderAmt(null, pb.igst, false) : "—")}</td>
        <td style="text-align:right;vertical-align:top">${renderAmt(b?.taxAmount ?? null, pb?.taxAmount, !!b)}</td>
        <td style="text-align:right;vertical-align:top">${renderAmt(b?.grossAmount ?? null, pb?.grossAmount, !!b)}</td>
      </tr>`;
  }).join("");

  const tableHead = isGermany
    ? `<tr><th>Rate Band</th><th style="text-align:right">Invoices${withPrev ? " (vs prev)" : ""}</th><th style="text-align:right">Net (Excl. Tax)${withPrev ? " (vs prev)" : ""}</th><th style="text-align:right">Tax Collected${withPrev ? " (vs prev)" : ""}</th><th style="text-align:right">Gross Total${withPrev ? " (vs prev)" : ""}</th></tr>`
    : `<tr><th>GST Component</th><th style="text-align:right">Invoices${withPrev ? " (vs prev)" : ""}</th><th style="text-align:right">${withPrev ? "Taxable (vs prev)" : "Taxable Value"}</th><th style="text-align:right">CGST${withPrev ? " (vs prev)" : ""}</th><th style="text-align:right">SGST${withPrev ? " (vs prev)" : ""}</th><th style="text-align:right">IGST${withPrev ? " (vs prev)" : ""}</th><th style="text-align:right">Tax Total${withPrev ? " (vs prev)" : ""}</th><th style="text-align:right">Gross Total${withPrev ? " (vs prev)" : ""}</th></tr>`;

  const comparisonBlock = withPrev && prev
    ? `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:10px 14px;margin-top:8px;font-size:12px;color:#1e40af">
        <strong>Comparison:</strong> Current period <strong>${esc(report.periodStart)} → ${esc(report.periodEnd)}</strong>
        vs prior <strong>${esc(prev.periodStart)} → ${esc(prev.periodEnd)}</strong>.
        Each value cell shows the prior figure and percentage change.
      </div>`
    : "";

  const totalsBlock = withPrev && prev
    ? `<div class="totals" style="margin-top:24px">
        <div class="totals-row"><span>Total Taxable (Net)</span><span>${cur} ${fmt(report.totalNet)} <span style="font-size:11px;color:#94a3b8">(prev: ${cur} ${fmt(prev.totalNet)} ${pdfDeltaSubInline(report.totalNet, prev.totalNet)})</span></span></div>
        <div class="totals-row"><span>Total Tax Collected</span><span>${cur} ${fmt(report.totalTax)} <span style="font-size:11px;color:#94a3b8">(prev: ${cur} ${fmt(prev.totalTax)} ${pdfDeltaSubInline(report.totalTax, prev.totalTax)})</span></span></div>
        <div class="totals-total"><span>Total Gross Revenue</span><span>${cur} ${fmt(report.totalGross)} <span style="font-size:11px;color:#94a3b8;font-weight:400">(prev: ${cur} ${fmt(prev.totalGross)} ${pdfDeltaSubInline(report.totalGross, prev.totalGross)})</span></span></div>
      </div>`
    : `<div class="totals" style="margin-top:24px">
        <div class="totals-row"><span>Total Taxable (Net)</span><span>${cur} ${fmt(report.totalNet)}</span></div>
        <div class="totals-row"><span>Total Tax Collected</span><span>${cur} ${fmt(report.totalTax)}</span></div>
        <div class="totals-total"><span>Total Gross Revenue</span><span>${cur} ${fmt(report.totalGross)}</span></div>
      </div>`;

  const html = `
    <div class="header">
      <div>
        <h1>${esc(regimeLabel)}</h1>
        <div class="doc-number">Period: ${esc(report.periodStart)} to ${esc(report.periodEnd)}${withPrev && prev ? ` &nbsp;·&nbsp; vs prior ${esc(prev.periodStart)} to ${esc(prev.periodEnd)}` : ""}</div>
      </div>
      <div style="text-align:right">
        <div style="color:#64748b;font-size:12px;margin-top:4px">Generated: ${new Date().toLocaleDateString()}</div>
      </div>
    </div>

    <div class="section grid-2">
      <div>
        <h3>Company</h3>
        <h2>${esc(report.companyName)}</h2>
      </div>
      <div>
        <h3>Period</h3>
        <div class="value">${esc(report.periodStart)} — ${esc(report.periodEnd)}</div>
        <div class="value" style="margin-top:4px">Invoices in scope: <strong>${esc(report.invoiceCount)}</strong></div>
      </div>
    </div>

    ${comparisonBlock}

    <hr class="divider">

    <div class="section">
      <h3>${isGermany ? "VAT Breakdown by Rate Band" : "GST Breakdown by Component"}</h3>
      <table>
        <thead>${tableHead}</thead>
        <tbody>${bandRows || `<tr><td colspan="${isGermany ? 5 : 8}" style="text-align:center;color:#94a3b8;padding:20px">No invoices in this period</td></tr>`}</tbody>
      </table>
    </div>

    ${totalsBlock}

    ${isGermany ? `
    <br>
    <div class="notes" style="font-size:11px;color:#64748b">
      <strong>Note:</strong> This report summarises output tax on sales invoices only. Input tax credits (Vorsteuer) are not included.
      VAT reference: Umsatzsteuervoranmeldung pursuant to §18 UStG.
    </div>` : `
    <br>
    <div class="notes" style="font-size:11px;color:#64748b">
      <strong>Note:</strong> This report covers output GST on sales invoices only. ITC (Input Tax Credit) is not included.
      CGST+SGST applies to intra-state transactions; IGST applies to inter-state transactions.
    </div>`}
  `;

  const titleSuffix = withPrev ? " (vs prior period)" : "";
  openPrintWindow(html, `${regimeLabel} — ${report.periodStart} to ${report.periodEnd}${titleSuffix}`);
}

/** Inline (no leading "prev:") delta arrow + pct fragment for use inside totals rows. */
function pdfDeltaSubInline(curStr: string | number, prevStr: string | number): string {
  const cur = typeof curStr === "number" ? curStr : parseFloat(String(curStr));
  const prev = typeof prevStr === "number" ? prevStr : parseFloat(String(prevStr));
  if (Number.isNaN(cur) || Number.isNaN(prev)) return "";
  if (prev === 0 && cur === 0) return `<span style="color:#94a3b8">— 0%</span>`;
  if (prev === 0) return `<span style="color:#059669;font-weight:600">▲ 100%</span>`;
  const change = ((cur - prev) / Math.abs(prev)) * 100;
  if (Math.abs(change) < 0.05) return `<span style="color:#94a3b8">— 0%</span>`;
  const color = change > 0 ? "#059669" : "#dc2626";
  const arrow = change > 0 ? "▲" : "▼";
  return `<span style="color:${color};font-weight:600">${arrow} ${Math.abs(change).toFixed(1)}%</span>`;
}

export function generateOfferPdf(offer: OfferData) {
  const status = esc(offer.status ?? "draft");
  const html = `
    <div class="header">
      <div>
        <h1>Offer</h1>
        <div class="doc-number">${esc(offer.offerNumber)}</div>
      </div>
      <div style="text-align:right">
        <span class="badge badge-${escAttr(offer.status ?? "draft")}">${status.replace("_", " ")}</span>
        ${offer.validUntil ? `<div style="margin-top:8px;color:#64748b;font-size:12px">Valid until: ${esc(offer.validUntil)}</div>` : ""}
      </div>
    </div>

    <div class="section grid-2">
      <div>
        <h3>From</h3>
        <h2>${esc(offer.company?.name ?? "—")}</h2>
        ${offer.company?.taxNumber ? `<div class="value">Tax No: ${esc(offer.company.taxNumber)}</div>` : ""}
        ${offer.company?.address ? `<div class="value" style="white-space:pre-line">${esc(offer.company.address)}</div>` : ""}
        ${offer.company?.bankDetails ? `<div class="value">Bank: ${esc(offer.company.bankDetails)}</div>` : ""}
      </div>
      <div>
        <h3>To</h3>
        <h2>${clientName(offer.client)}</h2>
        ${offer.client?.email ? `<div class="value">${esc(offer.client.email)}</div>` : ""}
      </div>
    </div>

    <div class="section">
      <h3>Subject</h3>
      <div class="value" style="font-size:15px;font-weight:600">${esc(offer.title)}</div>
    </div>

    <hr class="divider">

    ${offer.lineItems && offer.lineItems.length > 0 ? `
    <div class="section">
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th style="text-align:right">Qty</th>
            <th style="text-align:right">Unit Price</th>
            <th style="text-align:right">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${offer.lineItems.map(li => `
            <tr>
              <td>${esc(li.description)}</td>
              <td style="text-align:right">${esc(li.quantity)}</td>
              <td style="text-align:right">${esc(offer.currency)} ${fmt(li.unitPrice)}</td>
              <td style="text-align:right">${esc(offer.currency)} ${fmt(li.amount)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      <div class="totals">
        <div class="totals-row"><span>Subtotal</span><span>${esc(offer.currency)} ${fmt(offer.subtotal)}</span></div>
        ${parseFloat(String(offer.taxAmount)) > 0 ? `<div class="totals-row"><span>Tax</span><span>${esc(offer.currency)} ${fmt(offer.taxAmount)}</span></div>` : ""}
        <div class="totals-total"><span>Total</span><span>${esc(offer.currency)} ${fmt(offer.totalAmount)}</span></div>
      </div>
    </div>` : `
    <div class="section">
      <div class="totals">
        <div class="totals-total"><span>Total</span><span>${esc(offer.currency)} ${fmt(offer.totalAmount)}</span></div>
      </div>
    </div>`}

    ${offer.notes ? `<div class="section"><h3>Notes</h3><div class="notes">${esc(offer.notes)}</div></div>` : ""}
  `;
  openPrintWindow(html, `Offer ${offer.offerNumber}`);
}

export function generateContractPdf(contract: ContractData) {
  const typeLabel = contract.type === "client_service" ? "Client Service Agreement" : "Freelancer Service Agreement";
  const html = `
    <div class="header">
      <div>
        <h1>${esc(typeLabel)}</h1>
        <div class="doc-number">${esc(contract.contractNumber)}</div>
      </div>
      <div style="text-align:right">
        <span class="badge badge-${escAttr(contract.status)}">${esc(contract.status)}</span>
      </div>
    </div>

    <div class="section grid-2">
      <div>
        <h3>Company</h3>
        <h2>${esc(contract.company?.name ?? "—")}</h2>
        ${contract.company?.taxNumber ? `<div class="value">Tax No: ${esc(contract.company.taxNumber)}</div>` : ""}
        ${contract.company?.address ? `<div class="value" style="white-space:pre-line">${esc(contract.company.address)}</div>` : ""}
      </div>
      <div>
        <h3>Counterparty</h3>
        <h2>${clientName(contract.client)}</h2>
        ${contract.client?.email ? `<div class="value">${esc(contract.client.email)}</div>` : ""}
      </div>
    </div>

    ${contract.startDate || contract.endDate ? `
    <div class="section">
      <div class="grid-2">
        ${contract.startDate ? `<div><div class="label">Start Date</div><div class="value">${esc(contract.startDate)}</div></div>` : ""}
        ${contract.endDate ? `<div><div class="label">End Date</div><div class="value">${esc(contract.endDate)}</div></div>` : ""}
      </div>
    </div>` : ""}

    <hr class="divider">

    <div class="section">
      <div class="content-pre">${esc(contract.content)}</div>
    </div>
  `;
  openPrintWindow(html, `Contract ${contract.contractNumber}`);
}

export function generateInvoicePdf(invoice: InvoiceData) {
  const taxTypeLabels: Record<string, string> = {
    none: "No Tax",
    vat: "MwSt 19%",
    cgst_sgst: "CGST+SGST 9%+9%",
    igst: "IGST 18%",
  };
  const taxLabel = esc(taxTypeLabels[invoice.taxType] ?? invoice.taxType);

  const html = `
    <div class="header">
      <div>
        <h1>Invoice</h1>
        <div class="doc-number">${esc(invoice.invoiceNumber)}</div>
      </div>
      <div style="text-align:right">
        <span class="badge badge-${escAttr(invoice.status)}">${esc(invoice.status)}</span>
      </div>
    </div>

    <div class="section grid-2">
      <div>
        <h3>From</h3>
        <h2>${esc(invoice.company?.name ?? "—")}</h2>
        ${invoice.company?.taxNumber ? `<div class="value">Tax No: ${esc(invoice.company.taxNumber)}</div>` : ""}
        ${invoice.company?.address ? `<div class="value" style="white-space:pre-line">${esc(invoice.company.address)}</div>` : ""}
        ${invoice.company?.bankDetails ? `<div class="value">Bank: ${esc(invoice.company.bankDetails)}</div>` : ""}
      </div>
      <div>
        <h3>Bill To</h3>
        <h2>${clientName(invoice.client)}</h2>
        ${invoice.client?.email ? `<div class="value">${esc(invoice.client.email)}</div>` : ""}
      </div>
    </div>

    <div class="section grid-2">
      <div>
        <div class="label">Issue Date</div>
        <div class="value">${esc(invoice.issueDate)}</div>
      </div>
      ${invoice.dueDate ? `<div><div class="label">Due Date</div><div class="value">${esc(invoice.dueDate)}</div></div>` : ""}
    </div>

    <div class="section">
      <h3>Subject</h3>
      <div class="value" style="font-size:15px;font-weight:600">${esc(invoice.title)}</div>
    </div>

    <hr class="divider">

    ${invoice.lineItems && invoice.lineItems.length > 0 ? `
    <div class="section">
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th style="text-align:right">Qty</th>
            <th style="text-align:right">Unit Price</th>
            <th style="text-align:right">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${invoice.lineItems.map(li => `
            <tr>
              <td>${esc(li.description)}</td>
              <td style="text-align:right">${esc(li.quantity)}</td>
              <td style="text-align:right">${esc(invoice.currency)} ${fmt(li.unitPrice)}</td>
              <td style="text-align:right">${esc(invoice.currency)} ${fmt(li.amount)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>` : ""}

    <div class="totals">
      <div class="totals-row"><span>Subtotal</span><span>${esc(invoice.currency)} ${fmt(invoice.subtotal)}</span></div>
      ${parseFloat(String(invoice.taxAmount)) > 0 ? `<div class="totals-row"><span>${taxLabel}</span><span>${esc(invoice.currency)} ${fmt(invoice.taxAmount)}</span></div>` : ""}
      <div class="totals-total"><span>Total Due</span><span>${esc(invoice.currency)} ${fmt(invoice.totalAmount)}</span></div>
    </div>

    ${invoice.notes ? `<br><div class="section"><h3>Notes</h3><div class="notes">${esc(invoice.notes)}</div></div>` : ""}
  `;
  openPrintWindow(html, `Invoice ${invoice.invoiceNumber}`);
}
