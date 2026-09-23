import type { PoolClient } from 'pg';
import PDFDocument from 'pdfkit';

export type EmailAttachment = {
  filename: string;
  content: Buffer;
  contentType: string;
};

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

export async function buildInvoicePdf(
  client: PoolClient,
  companyId: string,
  invoiceId: string,
): Promise<EmailAttachment | null> {
  const inv = await client.query(
    `SELECT i.*,
       c.name AS company_name, c.email AS company_email, c.phone AS company_phone,
       c.address AS company_address, c.website, c.invoice_footer,
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
    [a?.street, a?.unit].filter(Boolean).join(' '),
    [a?.city, [a?.state, a?.zip].filter(Boolean).join(' ')].filter(Boolean).join(', '),
  ].filter(Boolean);

  const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
  const number = String(i.invoice_number || 'invoice');

  doc.fontSize(20).font('Helvetica-Bold').text(i.company_name || 'FieldPro', { continued: false });
  doc.moveDown(0.2);
  doc.fontSize(9).font('Helvetica').fillColor('#444444');
  if (i.company_address) doc.text(String(i.company_address));
  const companyLine = [i.company_phone, i.company_email, i.website].filter(Boolean).join('  ·  ');
  if (companyLine) doc.text(companyLine);
  doc.fillColor('#111111');

  doc.moveDown(0.8);
  doc.fontSize(18).font('Helvetica-Bold').text('INVOICE');
  doc.moveDown(0.3);
  doc.fontSize(10).font('Helvetica');
  doc.text(`Invoice: ${number}`);
  doc.text(`Date: ${fmtDate(i.created_at)}`);
  doc.text(`Due: ${fmtDate(i.due_date)}`);
  doc.text(`Status: ${String(i.status || '').replace(/_/g, ' ')}`);

  doc.moveDown(0.8);
  doc.fontSize(10).font('Helvetica-Bold').text('Bill to');
  doc.font('Helvetica').fontSize(10);
  for (const line of billTo) doc.text(line);
  if (i.customer_email) doc.text(String(i.customer_email));
  if (i.customer_phone) doc.text(String(i.customer_phone));

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
  y += 12;
  doc.font('Helvetica').fontSize(10);
  const totalsX = 390;
  doc.text('Subtotal', totalsX, y, { width: 70 });
  doc.text(money(Number(i.subtotal)), cols.total, y, { width: 70, align: 'right' });
  y += 16;
  doc.text('Tax', totalsX, y, { width: 70 });
  doc.text(money(Number(i.tax)), cols.total, y, { width: 70, align: 'right' });
  y += 16;
  doc.font('Helvetica-Bold');
  doc.text('Total', totalsX, y, { width: 70 });
  doc.text(money(Number(i.total)), cols.total, y, { width: 70, align: 'right' });

  if (i.invoice_footer) {
    doc.font('Helvetica').fontSize(8).fillColor('#555555');
    doc.text(String(i.invoice_footer), 50, 720, { width: 510, align: 'center' });
  }

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
       c.address AS company_address, c.website, c.invoice_footer,
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

  const items = (await client.query(
    `SELECT description, quantity, unit_price, total FROM estimate_line_items WHERE estimate_id = $1 ORDER BY id`,
    [estimateId],
  )).rows;

  const billTo = [
    `${e.first_name ?? ''} ${e.last_name ?? ''}`.trim() || 'Customer',
    [e.street, e.unit].filter(Boolean).join(' '),
    [e.city, [e.state, e.zip].filter(Boolean).join(' ')].filter(Boolean).join(', '),
  ].filter(Boolean);

  const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
  const number = String(e.estimate_number || 'estimate');

  doc.fontSize(20).font('Helvetica-Bold').text(e.company_name || 'FieldPro', { continued: false });
  doc.moveDown(0.2);
  doc.fontSize(9).font('Helvetica').fillColor('#444444');
  if (e.company_address) doc.text(String(e.company_address));
  const companyLine = [e.company_phone, e.company_email, e.website].filter(Boolean).join('  ·  ');
  if (companyLine) doc.text(companyLine);
  doc.fillColor('#111111');

  doc.moveDown(0.8);
  doc.fontSize(18).font('Helvetica-Bold').text('ESTIMATE');
  doc.moveDown(0.3);
  doc.fontSize(10).font('Helvetica');
  doc.text(`Estimate: ${number}`);
  doc.text(`Date: ${fmtDate(e.created_at)}`);
  if (e.valid_until) doc.text(`Valid until: ${fmtDate(e.valid_until)}`);
  doc.text(`Status: ${String(e.status || '').replace(/_/g, ' ')}`);

  doc.moveDown(0.8);
  doc.fontSize(10).font('Helvetica-Bold').text('Prepared for');
  doc.font('Helvetica').fontSize(10);
  for (const line of billTo) doc.text(line);
  if (e.customer_email) doc.text(String(e.customer_email));
  if (e.customer_phone) doc.text(String(e.customer_phone));

  if (e.description) {
    doc.moveDown(0.6);
    doc.font('Helvetica-Bold').text('Description');
    doc.font('Helvetica').text(String(e.description));
  }

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
  y += 12;
  doc.font('Helvetica').fontSize(10);
  const totalsX = 390;
  doc.text('Subtotal', totalsX, y, { width: 70 });
  doc.text(money(Number(e.subtotal)), cols.total, y, { width: 70, align: 'right' });
  y += 16;
  doc.text('Tax', totalsX, y, { width: 70 });
  doc.text(money(Number(e.tax)), cols.total, y, { width: 70, align: 'right' });
  y += 16;
  doc.font('Helvetica-Bold');
  doc.text('Total', totalsX, y, { width: 70 });
  doc.text(money(Number(e.total)), cols.total, y, { width: 70, align: 'right' });

  const notes = e.note_to_customer || e.notes;
  if (notes) {
    y += 28;
    doc.font('Helvetica-Bold').fontSize(10).text('Notes', 50, y);
    y += 14;
    doc.font('Helvetica').fontSize(9).fillColor('#333333').text(String(notes), 50, y, { width: 510 });
    doc.fillColor('#111111');
  }

  if (e.invoice_footer) {
    doc.font('Helvetica').fontSize(8).fillColor('#555555');
    doc.text(String(e.invoice_footer), 50, 720, { width: 510, align: 'center' });
  }

  const content = await bufferFromPdf(doc);
  return {
    filename: `${number.replace(/[^\w.-]+/g, '_')}.pdf`,
    content,
    contentType: 'application/pdf',
  };
}
