import { describe, expect, it } from "vitest";
import {
  billableLines,
  businessContactLines,
  lineSubtotal,
  normalizeBusiness,
  pdfCurrencySymbol,
  quoteFilename,
  quoteTotal,
  validUntil,
  type Quote,
  type QuoteLine,
} from "./quote";
import { buildQuotePdf } from "./quotePdf";

const line = (description: string, quantity: number, unitPrice: number): QuoteLine => ({
  id: description,
  description,
  quantity,
  unitPrice,
});

describe("presupuesto", () => {
  it("calcula subtotales y total redondeados a 2 decimales", () => {
    const lines = [line("Soporte", 3, 21742.97), line("Envío", 1, 3500)];
    expect(lineSubtotal(lines[0])).toBe(65228.91);
    expect(quoteTotal(lines)).toBe(68728.91);
  });

  it("ignora líneas con cantidad 0 o vacías", () => {
    const lines = [line("Soporte", 0, 100), line("", 1, 0), line("Llavero", 2, 50)];
    expect(billableLines(lines).map((l) => l.description)).toEqual(["Llavero"]);
    expect(quoteTotal(lines)).toBe(100);
  });

  it("sanitiza valores inválidos", () => {
    expect(lineSubtotal(line("x", Number.NaN, 100))).toBe(0);
    expect(lineSubtotal(line("x", 2, -5))).toBe(0);
  });

  it("calcula la fecha de vencimiento", () => {
    const d = new Date(validUntil("2026-11-11T12:00:00.000Z", 15));
    expect(d.toISOString().slice(0, 10)).toBe("2026-11-26");
  });

  it("usa el código ISO cuando el símbolo no entra en las fuentes del PDF", () => {
    expect(pdfCurrencySymbol("ARS")).toBe("AR$");
    expect(pdfCurrencySymbol("EUR")).toBe("€");
    expect(pdfCurrencySymbol("PYG")).toBe("PYG");
  });

  it("arma un nombre de archivo seguro", () => {
    expect(quoteFilename({ number: 7, clientName: "  Juan Pérez / Taller  " })).toBe("presupuesto-0007-juan-perez-taller.pdf");
    expect(quoteFilename({ number: 12, clientName: "" })).toBe("presupuesto-0012.pdf");
  });

  it("normaliza los datos del negocio guardados", () => {
    expect(normalizeBusiness(null)).toEqual({ name: "", phone: "", email: "", instagram: "" });
    expect(normalizeBusiness({ name: "Taller", phone: 5 })).toEqual({ name: "Taller", phone: "", email: "", instagram: "" });
  });

  it("arma las líneas de contacto omitiendo las vacías", () => {
    const b = { name: "Taller", phone: " 11 1234-5678 ", email: "", instagram: "@@taller3d" };
    expect(businessContactLines(b)).toEqual(["Tel.: 11 1234-5678", "Instagram: @taller3d"]);
  });

  it("genera un PDF válido", () => {
    const q: Quote = {
      number: 1,
      date: "2026-11-11T12:00:00.000Z",
      validDays: 15,
      currency: "ARS",
      business: { name: "Impresiones 3D", phone: "11 1234-5678", email: "hola@impresiones.com", instagram: "impresiones" },
      clientName: "Juan Pérez",
      clientContact: "juan@example.com",
      lines: [line("Soporte de auriculares", 2, 21742.97), line("Envío", 1, 3500)],
      notes: "Seña del 50 % para comenzar.",
    };
    const out = buildQuotePdf(q).output();
    expect(out.startsWith("%PDF-")).toBe(true);
    expect(out).toContain("PRESUPUESTO");
  });
});
