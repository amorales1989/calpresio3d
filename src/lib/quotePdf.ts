// Genera el PDF del presupuesto. Se importa de forma diferida para no cargar jsPDF al abrir la app.
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { formatMoney } from "./calc";
import {
  billableLines,
  businessContactLines,
  formatQuoteNumber,
  lineSubtotal,
  pdfCurrencySymbol,
  quoteFilename,
  quoteTotal,
  validUntil,
  type Quote,
} from "./quote";

const TEAL: [number, number, number] = [15, 118, 110]; // teal-700
const DARK: [number, number, number] = [28, 25, 23]; // stone-900
const MUTED: [number, number, number] = [120, 113, 108]; // stone-500

const dateFmt = new Intl.DateTimeFormat("es-AR", { dateStyle: "short" });
const qtyFmt = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 2 });

export function buildQuotePdf(q: Quote): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 18; // margen
  const symbol = pdfCurrencySymbol(q.currency);
  const money = (n: number) => formatMoney(n, symbol);

  // ---------- encabezado: negocio (izq.) y datos del presupuesto (der.) ----------
  let y = M + 4;
  doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(...DARK);
  const businessName = q.business.name.trim() || "Presupuesto";
  doc.text(doc.splitTextToSize(businessName, pageW / 2 - M), M, y);
  y += 6;
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED);
  for (const line of businessContactLines(q.business)) {
    doc.text(line, M, y);
    y += 4.5;
  }

  const rx = pageW - M;
  doc.setFont("helvetica", "bold").setFontSize(18).setTextColor(...TEAL);
  doc.text("PRESUPUESTO", rx, M + 4, { align: "right" });
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...DARK);
  doc.text(`N° ${formatQuoteNumber(q.number)}`, rx, M + 11, { align: "right" });
  doc.text(`Fecha: ${dateFmt.format(new Date(q.date))}`, rx, M + 15.5, { align: "right" });
  doc.text(`Válido hasta: ${dateFmt.format(new Date(validUntil(q.date, q.validDays)))}`, rx, M + 20, { align: "right" });

  y = Math.max(y, M + 20) + 6;
  doc.setDrawColor(231, 229, 228).setLineWidth(0.3).line(M, y, pageW - M, y);
  y += 8;

  // ---------- cliente ----------
  const client = q.clientName.trim();
  const clientContact = q.clientContact.trim();
  if (client || clientContact) {
    doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(...MUTED);
    doc.text("CLIENTE", M, y);
    y += 5;
    doc.setFont("helvetica", "normal").setFontSize(11).setTextColor(...DARK);
    if (client) {
      doc.text(client, M, y);
      y += 5;
    }
    doc.setFontSize(9).setTextColor(...MUTED);
    for (const line of clientContact.split("\n").map((s) => s.trim()).filter(Boolean)) {
      doc.text(line, M, y);
      y += 4.5;
    }
    y += 4;
  }

  // ---------- detalle ----------
  const lines = billableLines(q.lines);
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [["Descripción", "Cant.", "Precio unit.", "Subtotal"]],
    body: lines.map((l) => [l.description.trim() || "—", qtyFmt(l.quantity), money(l.unitPrice), money(lineSubtotal(l))]),
    foot: [["", "", "Total", money(quoteTotal(q.lines))]],
    theme: "plain",
    styles: { font: "helvetica", fontSize: 10, textColor: DARK, cellPadding: { top: 3, bottom: 3, left: 2, right: 2 } },
    headStyles: { fillColor: TEAL, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 9 },
    footStyles: { fontStyle: "bold", fontSize: 12, textColor: DARK },
    alternateRowStyles: { fillColor: [245, 245, 244] },
    columnStyles: {
      1: { halign: "right", cellWidth: 18 },
      2: { halign: "right", cellWidth: 36 },
      3: { halign: "right", cellWidth: 38 },
    },
    didParseCell: (data) => {
      // alinear encabezados numéricos igual que sus columnas
      if (data.section !== "body" && data.column.index > 0) data.cell.styles.halign = "right";
    },
  });
  y = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y) + 10;

  // ---------- notas ----------
  const notes = q.notes.trim();
  if (notes) {
    const wrapped: string[] = doc.setFontSize(9).splitTextToSize(notes, pageW - 2 * M);
    if (y + 6 + wrapped.length * 4.5 > pageH - M - 10) {
      doc.addPage();
      y = M;
    }
    doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(...MUTED);
    doc.text("OBSERVACIONES", M, y);
    y += 5;
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...DARK);
    doc.text(wrapped, M, y, { lineHeightFactor: 1.4 });
  }

  // ---------- pie en todas las páginas ----------
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED);
    doc.text(`Precios en ${q.currency}. Presupuesto válido por ${Math.floor(q.validDays)} días.`, M, pageH - 10);
    if (pages > 1) doc.text(`${i} / ${pages}`, pageW - M, pageH - 10, { align: "right" });
  }

  doc.setProperties({ title: `Presupuesto ${formatQuoteNumber(q.number)}`, subject: client || undefined });
  return doc;
}

export function downloadQuotePdf(q: Quote): void {
  buildQuotePdf(q).save(quoteFilename(q));
}
