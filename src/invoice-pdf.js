import PDFDocument from '../vendor/pdfkit/pdfkit.cjs';
import { calculate, money, scaled } from '../shared/calculations.js';

/** Sanitize user-facing invoice numbers before using them in attachment filenames or headers. */
export const invoicePdfFilename = (number) =>
  `invoice-${
    String(number)
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'document'
  }.pdf`;

// Server-side PDF: the saved invoice is the only source of content and totals.
/**
 * Generate an A4 PDF buffer from saved invoice data and freshly calculated totals.
 * Reject invalid quantities/amounts, paginate long content and omit hidden custom fields.
 * @returns {Promise<Buffer>} Complete PDF bytes for downloads or email attachments.
 */
export function invoicePDF(invoice) {
  return new Promise((resolve, reject) => {
    const totals = calculate(invoice);
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 42, right: 42, bottom: 50, left: 42 },
      bufferPages: true,
      info: { Title: `Invoice ${invoice.number}`, Author: invoice.business.name },
    });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    try {
      const left = 42,
        width = doc.page.width - 84,
        right = left + width;
      const green = '#234b41',
        muted = '#536057';
      let y = 42;
      const plain = (value) => String(value).replace(/\s+/g, ' ').trim();
      const setFont = (size = 10, bold = false) =>
        doc
          .font(bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(size)
          .fillColor(green);
      /**
       * Reserve vertical space, moving to a new page before a block would enter the footer area.
       */
      function room(height) {
        if (y + height > doc.page.height - 50) {
          doc.addPage();
          y = 42;
        }
      }
      /**
       * Measure and draw a text block with consistent spacing, allowing long text to wrap.
       */
      function block(value, { size = 10, bold = false, color = muted, gap = 8 } = {}) {
        if (!value) return;
        setFont(size, bold);
        doc.fillColor(color);
        const height = doc.heightOfString(String(value), { width, lineGap: 2 });
        if (height <= doc.page.height - 92) room(height + gap);
        doc.text(String(value), left, y, { width, lineGap: 2 });
        y = doc.y + gap;
      }
      setFont(9, true);
      doc.text('INVOICE', left, y, { characterSpacing: 2 });
      setFont(10, true);
      doc.text(plain(invoice.number), right - 185, y, { width: 185, align: 'right' });
      setFont(9);
      doc.text(`Issued ${invoice.issueDate}\nDue ${invoice.dueDate}`, right - 185, y + 20, {
        width: 185,
        align: 'right',
        lineGap: 4,
      });
      y += 28;
      setFont(25, true);
      doc.text(invoice.business.name, left, y, { width: width - 205 });
      y = Math.max(doc.y + 12, 108);
      block(invoice.business.address, { gap: 4 });
      block(invoice.business.email, { gap: 16 });
      room(20);
      doc.moveTo(left, y).lineTo(right, y).lineWidth(1.5).strokeColor(green).stroke();
      y += 22;
      block('BILL TO', { size: 9, bold: true, color: green, gap: 8 });
      block(invoice.customer.name, { size: 12, bold: true, color: green, gap: 5 });
      block(invoice.customer.address, { gap: 4 });
      block(invoice.customer.email, { gap: 18 });
      const columns = [width * 0.47, width * 0.13, width * 0.19, width * 0.21];
      /**
       * Repeat column headings on item continuation pages so multi-page invoices remain readable.
       */
      function tableHeader(continued = false) {
        if (continued) {
          setFont(9, true);
          doc.text(`${plain(invoice.number)} — continued`, left, y, { width });
          y += 22;
        }
        doc.rect(left, y, width, 27).fill('#edf2eb');
        let x = left;
        ['Description', 'Qty', 'Price', 'Amount'].forEach((label, index) => {
          setFont(8, true);
          doc.text(label, x + 6, y + 9, {
            width: columns[index] - 12,
            align: index ? 'right' : 'left',
            lineBreak: false,
          });
          x += columns[index];
        });
        y += 27;
      }
      room(70);
      tableHeader();
      invoice.items.forEach((item, index) => {
        const values = [
          plain(item.description),
          String(item.quantity),
          money(scaled(item.unitPrice)),
          money(totals.lines[index]),
        ];
        setFont(9);
        const height =
          Math.max(
            ...values.map((value, column) =>
              doc.heightOfString(value, { width: columns[column] - 12, lineGap: 2 }),
            ),
          ) + 22;
        if (y + height > doc.page.height - 50) {
          doc.addPage();
          y = 42;
          tableHeader(true);
        }
        let x = left;
        values.forEach((value, column) => {
          setFont(9);
          doc.text(value, x + 6, y + 10, {
            width: columns[column] - 12,
            align: column ? 'right' : 'left',
            lineGap: 2,
          });
          x += columns[column];
        });
        y += height;
        doc.moveTo(left, y).lineTo(right, y).lineWidth(0.5).strokeColor('#d9dfd8').stroke();
      });
      y += 18;
      room(125);
      const totalLeft = right - 245;
      for (const [label, value] of [
        ['Subtotal', money(totals.subtotal)],
        ['Discount', `-${money(totals.discount)}`],
        [`Tax (${invoice.taxRate}%)`, money(totals.tax)],
      ]) {
        setFont(10);
        doc.text(label, totalLeft, y, { width: 130 });
        doc.text(value, totalLeft + 130, y, { width: 115, align: 'right' });
        y += 22;
      }
      doc.moveTo(totalLeft, y).lineTo(right, y).strokeColor(green).stroke();
      y += 13;
      setFont(14, true);
      doc.text('Total due (USD)', totalLeft, y, { width: 135 });
      doc.text(money(totals.total), totalLeft + 135, y, { width: 110, align: 'right' });
      y = doc.y + 26;
      for (const field of invoice.customFields.filter((field) => field.visible))
        block(`${field.label}: ${field.value}`, { gap: 10 });
      if (invoice.notes) {
        const notesAndClosing = `${invoice.notes}\n\nThank you for your business.`;
        setFont(10);
        const notesHeight = doc.heightOfString(notesAndClosing, { width, lineGap: 2 }) + 32;
        room(Math.min(notesHeight, doc.page.height - 92));
        block('A little note', { bold: true, color: green });
        block(notesAndClosing, { gap: 0 });
      } else block('Thank you for your business.', { color: green, gap: 0 });
      const pages = doc.bufferedPageRange();
      for (let page = pages.start; page < pages.start + pages.count; page++) {
        doc.switchToPage(page);
        const bottomMargin = doc.page.margins.bottom;
        doc.page.margins.bottom = 0; // Footer sits inside the reserved bottom margin.
        setFont(8);
        doc
          .fillColor(muted)
          .text(`Page ${page + 1} of ${pages.count}`, left, doc.page.height - 30, {
            width,
            align: 'right',
            lineBreak: false,
          });
        doc.page.margins.bottom = bottomMargin;
      }
      doc.end();
    } catch (error) {
      reject(error);
      doc.destroy();
    }
  });
}
