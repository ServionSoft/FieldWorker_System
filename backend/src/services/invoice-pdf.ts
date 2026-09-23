import fs from 'node:fs';
import path from 'node:path';
import type { PoolClient } from 'pg';
import PDFDocument from 'pdfkit';
import { parseInvoiceSettings, type InvoiceSettings } from '../modules/company/invoice-settings.js';

export type EmailAttachment = {
  filename: string;
  content: Buffer;
  contentType: string;
};

const uploadDir = path.join(process.cwd(), 'uploads');

function money(n: number) {
  return `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(value: Date | string | null | undefined) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function bufferFromPdf(doc: PDFKit.PDFDocument) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

async function logoPathFor(
  client: PoolClient,
  companyId: string,
  fileId: string | null | undefined,
  showLogo: boolean,
): Promise<string | null> {
  if (!showLogo || !fileId) return null;
  const { rows } = await client.query(
    `SELECT storage_key, mime_type FROM files WHERE company_id = $1 AND id = $2`,
    [companyId, fileId],
  );
  const file = rows[0];
  if (!file) return null;
  if (!/^image\/(jpeg|jpg|png)$/i.test(String(file.mime_type || ''))) return null;
  const full = path.resolve(uploadDir, file.storage_key);
  if (!full.startsWith(path.resolve(uploadDir))) return null;
  if (!fs.existsSync(full)) return null;
  return full;
}

function drawCompanyHeader(
  doc: PDFKit.PDFDocument,
  opts: {
    name: string;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    website?: string | null;
    logoPath: string | null;
    settings: InvoiceSettings;
  },
) {
  const startY = 50;
  let textX = 50;
  if (opts.settings.showLogo && opts.logoPath) {
    try {
      doc.image(opts.logoPath, 50, startY, { fit: [110, 52] });
      textX = 175;
    } catch {
      textX = 50;
    }
  }
  doc.fillColor('#111111').fontSize(18).font('Helvetica-Bold')
    .text(opts.name || 'FieldPro', textX, startY, { width: 385 });
  doc.fontSize(9).font('Helvetica').fillColor('#444444');
  if (opts.settings.showAddress && opts.address) doc.text(String(opts.address), textX, doc.y, { width: 385 });
  const bits = [
    opts.settings.showPhone ? opts.phone : null,
    opts.settings.showEmail ? opts.email : null,
    opts.settings.showWebsite ? opts.website : null,
  ].filter(Boolean);
  if (bits.length) doc.text(bits.join('  ·  '), textX, doc.y, { width: 385 });
  doc.fillColor('#111111');
  const headerBottom = opts.settings.showLogo && opts.logoPath ? startY + 58 : doc.y;
  if (doc.y < headerBottom) doc.y = headerBottom;
  doc.moveDown(0.8);
}

function drawParty(
  doc: PDFKit.PDFDocument,
  heading: string,
  lines: string[],
) {
  if (!lines.length) return;
  doc.fontSize(10).font('Helvetica-Bold').text(heading);
  doc.font('Helvetica').fontSize(10);
  for (const line of lines) doc.text(line);
}

function drawItemsTable(
  doc: PDFKit.PDFDocument,
  items: { description?: string; quantity?: number; unit_price?: number; total?: number }[],
) {
  doc.moveDown(1);
  const tableTop = doc.y;
  const cols = { desc: 50, qty: 320, price: 390, total: 470 };
  doc.font('Helvetica-Bold').fontSize(9);
  doc.text('Description', cols.desc, tableTop, { width: 250 });
  doc.text('Qty', cols.qty, tableTop, { width: 50, align: 'right' });
  doc.text('Price', cols.price, tableTop, { width: 60, align: 'right' });
  doc.text('Amount', cols.total, tableTop, { width: 70, align: 'right' });
  doc.moveTo(50, tableTop + 14).lineTo(560, tableTop + 14).strokeColor('#cccccc').stroke();

  let y = tableTop + 22;
  doc.font('Helvetica').fontSize(9).strokeColor('#111111');
  for (const row of items) {
    if (y > 680) {
      doc.addPage();
      y = 50;
    }
    const qty = Number(row.quantity || 0);
    const unit = Number(row.unit_price || 0);
    const total = Number(row.total || qty * unit);
    doc.text(String(row.description || 'Item'), cols.desc, y, { width: 250 });
    doc.text(String(qty), cols.qty, y, { width: 50, align: 'right' });
    doc.text(money(unit), cols.price, y, { width: 60, align: 'right' });
    doc.text(money(total), cols.total, y, { width: 70, align: 'right' });
    y += 18;
  }
  doc.moveTo(50, y).lineTo(560, y).strokeColor('#cccccc').stroke();
  return y + 12;
}

function drawTotals(
  doc: PDFKit.PDFDocument,
  y: number,
  settings: InvoiceSettings,
  subtotal: number,
  tax: number,
  total: number,
) {
  const totalsX = 390;
  const colsTotal = 470;
  doc.font('Helvetica').fontSize(10);
  doc.text('Subtotal', totalsX, y, { width: 70 });
  doc.text(money(subtotal), colsTotal, y, { width: 70, align: 'right' });
  y += 16;
  if (settings.showTax) {
    doc.text('Tax', totalsX, y, { width: 70 });
    doc.text(money(tax), colsTotal, y, { width: 70, align: 'right' });
    y += 16;
  }
  doc.font('Helvetica-Bold');
  doc.text('Total', totalsX, y, { width: 70 });
  doc.text(money(total), colsTotal, y, { width: 70, align: 'right' });
  return y + 8;
}

function drawBankDetails(doc: PDFKit.PDFDocument, settings: InvoiceSettings, y: number) {
  if (!settings.showBankDetails) return y;
  const lines = [
    settings.bankName && `Bank: ${settings.bankName}`,
    settings.bankAccountName && `Account name: ${settings.bankAccountName}`,
    settings.bankAccountNumber && `Account number: ${settings.bankAccountNumber}`,
    settings.bankRoutingNumber && `Routing: ${settings.bankRoutingNumber}`,
    settings.bankIban && `IBAN: ${settings.bankIban}`,
    settings.bankSwift && `SWIFT/BIC: ${settings.bankSwift}`,
  ].filter(Boolean) as string[];
  if (!lines.length && !settings.paymentInstructions) return y;
  y += 20;
  if (y > 680) {
    doc.addPage();
    y = 50;
  }
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#111111').text('Payment details', 50, y);
  y += 14;
  doc.font('Helvetica').fontSize(9);
  for (const line of lines) {
    doc.text(line, 50, y);
    y += 13;
  }
  if (settings.paymentInstructions) {
    doc.text(settings.paymentInstructions, 50, y, { width: 510 });
    y = doc.y;
  }
  return y;
}

function drawFooter(doc: PDFKit.PDFDocument, settings: InvoiceSettings, footer?: string | null) {
  if (!settings.showFooter || !footer) return;
  doc.font('Helvetica').fontSize(8).fillColor('#555555');
  doc.text(String(footer), 50, 720, { width: 510, align: 'center' });
}

export async function buildInvoicePdf(
  client: PoolClient,
  companyId: string,
  invoiceId: string,
): Promise<EmailAttachment | null> {
  const inv = await client.query(
    `SELECT i.*,
       c.name AS company_name, c.email AS company_email, c.phone AS company_phone,
       c.address AS company_address, c.website, c.invoice_footer, c.logo_file_id, c.invoice_settings,
       cc.first_name, cc.last_name, cc.email AS customer_email, cc.phone AS customer_phone
     FROM invoices i
     JOIN companies c ON c.id = i.company_id
     LEFT JOIN LATERAL (
       SELECT * FROM customer_contacts WHERE customer_id = i.customer_id ORDER BY is_primary DESC LIMIT 1
     ) cc ON true
     WHERE i.company_id = $1 AND i.id = $2`,
    [companyId, invoiceId],
  );
  const i = inv.rows[0];
  if (!i) return null;
  const settings = parseInvoiceSettings(i.invoice_settings);
  const logoPath = await logoPathFor(client, companyId, i.logo_file_id, settings.showLogo);

  const items = (await client.query(
    `SELECT description, quantity, unit_price, total FROM invoice_line_items WHERE invoice_id = $1 ORDER BY id`,
    [invoiceId],
  )).rows;

  const addr = await client.query(
    `SELECT street, unit, city, state, zip
     FROM addresses
     WHERE company_id = $1 AND customer_id = $2
     ORDER BY is_default DESC, location_name
     LIMIT 1`,
    [companyId, i.customer_id],
  );
  const a = addr.rows[0];
  const billTo = [
    `${i.first_name ?? ''} ${i.last_name ?? ''}`.trim() || 'Customer',
    ...(settings.showCustomerAddress
      ? [
          [a?.street, a?.unit].filter(Boolean).join(' '),
          [a?.city, [a?.state, a?.zip].filter(Boolean).join(' ')].filter(Boolean).join(', '),
        ]
      : []),
  ].filter(Boolean);

  const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
  const number = String(i.invoice_number || 'invoice');

  drawCompanyHeader(doc, {
    name: i.company_name,
    address: i.company_address,
    phone: i.company_phone,
    email: i.company_email,
    website: i.website,
    logoPath,
    settings,
  });

  doc.fontSize(18).font('Helvetica-Bold').text('INVOICE');
  doc.moveDown(0.3);
  doc.fontSize(10).font('Helvetica');
  doc.text(`Invoice: ${number}`);
  doc.text(`Date: ${fmtDate(i.created_at)}`);
  if (settings.showDueDate) doc.text(`Due: ${fmtDate(i.due_date)}`);
  if (settings.showStatus) doc.text(`Status: ${String(i.status || '').replace(/_/g, ' ')}`);

  doc.moveDown(0.8);
  drawParty(doc, 'Bill to', [
    ...billTo,
    i.customer_email ? String(i.customer_email) : '',
    i.customer_phone ? String(i.customer_phone) : '',
  ].filter(Boolean));

  let y = drawItemsTable(doc, items);
  y = drawTotals(doc, y, settings, Number(i.subtotal), Number(i.tax), Number(i.total));
  drawBankDetails(doc, settings, y);
  drawFooter(doc, settings, i.invoice_footer);

  const content = await bufferFromPdf(doc);
  return {
    filename: `${number.replace(/[^\w.-]+/g, '_')}.pdf`,
    content,
    contentType: 'application/pdf',
  };
}

export async function buildEstimatePdf(
  client: PoolClient,
  companyId: string,
  estimateId: string,
): Promise<EmailAttachment | null> {
  const est = await client.query(
    `SELECT e.*,
       c.name AS company_name, c.email AS company_email, c.phone AS company_phone,
       c.address AS company_address, c.website, c.invoice_footer, c.logo_file_id, c.invoice_settings,
       cc.first_name, cc.last_name, cc.email AS customer_email, cc.phone AS customer_phone,
       a.street, a.unit, a.city, a.state, a.zip
     FROM estimates e
     JOIN companies c ON c.id = e.company_id
     LEFT JOIN LATERAL (
       SELECT * FROM customer_contacts WHERE customer_id = e.customer_id ORDER BY is_primary DESC LIMIT 1
     ) cc ON true
     LEFT JOIN addresses a ON a.id = e.address_id
     WHERE e.company_id = $1 AND e.id = $2`,
    [companyId, estimateId],
  );
  const e = est.rows[0];
  if (!e) return null;
  const settings = parseInvoiceSettings(e.invoice_settings);
  const logoPath = await logoPathFor(client, companyId, e.logo_file_id, settings.showLogo);

  const items = (await client.query(
    `SELECT description, quantity, unit_price, total FROM estimate_line_items WHERE estimate_id = $1 ORDER BY id`,
    [estimateId],
  )).rows;

  const billTo = [
    `${e.first_name ?? ''} ${e.last_name ?? ''}`.trim() || 'Customer',
    ...(settings.showCustomerAddress
      ? [
          [e.street, e.unit].filter(Boolean).join(' '),
          [e.city, [e.state, e.zip].filter(Boolean).join(' ')].filter(Boolean).join(', '),
        ]
      : []),
  ].filter(Boolean);

  const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
  const number = String(e.estimate_number || 'estimate');

  drawCompanyHeader(doc, {
    name: e.company_name,
    address: e.company_address,
    phone: e.company_phone,
    email: e.company_email,
    website: e.website,
    logoPath,
    settings,
  });

  doc.fontSize(18).font('Helvetica-Bold').text('ESTIMATE');
  doc.moveDown(0.3);
  doc.fontSize(10).font('Helvetica');
  doc.text(`Estimate: ${number}`);
  doc.text(`Date: ${fmtDate(e.created_at)}`);
  if (settings.showDueDate && e.valid_until) doc.text(`Valid until: ${fmtDate(e.valid_until)}`);
  if (settings.showStatus) doc.text(`Status: ${String(e.status || '').replace(/_/g, ' ')}`);

  doc.moveDown(0.8);
  drawParty(doc, 'Prepared for', [
    ...billTo,
    e.customer_email ? String(e.customer_email) : '',
    e.customer_phone ? String(e.customer_phone) : '',
  ].filter(Boolean));

  if (e.description) {
    doc.moveDown(0.6);
    doc.font('Helvetica-Bold').text('Description');
    doc.font('Helvetica').text(String(e.description));
  }

  let y = drawItemsTable(doc, items);
  y = drawTotals(doc, y, settings, Number(e.subtotal), Number(e.tax), Number(e.total));

  const notes = e.note_to_customer || e.notes;
  if (settings.showNotes && notes) {
    y += 20;
    doc.font('Helvetica-Bold').fontSize(10).text('Notes', 50, y);
    y += 14;
    doc.font('Helvetica').fontSize(9).fillColor('#333333').text(String(notes), 50, y, { width: 510 });
    doc.fillColor('#111111');
    y = doc.y;
  }

  drawBankDetails(doc, settings, y);
  drawFooter(doc, settings, e.invoice_footer);

  const content = await bufferFromPdf(doc);
  return {
    filename: `${number.replace(/[^\w.-]+/g, '_')}.pdf`,
    content,
    contentType: 'application/pdf',
  };
}
