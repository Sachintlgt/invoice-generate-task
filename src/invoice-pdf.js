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
      function block(
        value,
        {
          size = 10,
          bold = false,
          color = muted,
          gap = 8,
          x = left,
          y: startY = y,
          width: blockWidth = width,
        } = {},
      ) {
        if (!value) return;
        setFont(size, bold);
        doc.fillColor(color);
        const height = doc.heightOfString(String(value), { width: blockWidth, lineGap: 2 });
        // Pagination only applies to the main content flow at the left margin; fixed-position
        // header-box content is already sized to fit before any of this is drawn.
        if (x === left && height <= doc.page.height - 92) room(height + gap);
        doc.text(String(value), x, startY, { width: blockWidth, lineGap: 2 });
        y = doc.y + gap;
      }
      // Logo and business letterhead sit top-left; INVOICE, the invoice number and dates
      // stack top-right, both columns top-aligned with each other — no heading spanning
      // both, no divider, matching a standard two-corner invoice letterhead.
      const columnsTop = y,
        columnGap = 24,
        leftColWidth = width * 0.56,
        leftColX = left,
        rightColX = leftColX + leftColWidth + columnGap,
        rightColWidth = right - rightColX;
      const logoBox = { width: Math.min(140, leftColWidth), height: 60 };
      let leftY = columnsTop;
      if (invoice.business.logo) {
        try {
          // PDFKit decodes a `data:image/...;base64,...` string directly; passing the
          // data URL (rather than a pre-decoded Buffer) matches its own image loader path.
          doc.image(invoice.business.logo, leftColX, leftY, {
            fit: [logoBox.width, logoBox.height],
          });
          leftY += logoBox.height + 10;
        } catch {
          /* Unreadable logo data: continue rendering the invoice without it. */
        }
      }
      // The second row of each column (business name / invoice number) lines up across
      // both columns, mirroring the first row (logo / INVOICE) — the same row-to-row
      // rhythm on both sides, logo height included, rather than a fixed small gap.
      const nameY = leftY;
      setFont(20, true);
      doc.text(invoice.business.name, leftColX, nameY, { width: leftColWidth });
      leftY = doc.y + 10;
      if (invoice.business.address) {
        block(invoice.business.address, { gap: 6, x: leftColX, y: leftY, width: leftColWidth });
        leftY = y;
      }
      if (invoice.business.email)
        block(invoice.business.email, { gap: 0, x: leftColX, y: leftY, width: leftColWidth });
      const leftBottom = y;
      setFont(20, true);
      doc.text('INVOICE', rightColX, columnsTop, {
        width: rightColWidth,
        align: 'right',
        characterSpacing: 2,
      });
      // Without a logo there is no first-row height to mirror, so fall back to a plain gap.
      const numberY = invoice.business.logo ? nameY : doc.y + 10;
      setFont(11, true);
      doc.text(plain(invoice.number), rightColX, numberY, {
        width: rightColWidth,
        align: 'right',
      });
      setFont(9);
      doc.text(`Issued ${invoice.issueDate}\nDue ${invoice.dueDate}`, rightColX, doc.y + 10, {
        width: rightColWidth,
        align: 'right',
        lineGap: 4,
      });
      y = Math.max(leftBottom, doc.y) + 24;
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
