export const CURRENCIES = ["ARS", "USD", "EUR", "MXN", "COP", "CLP", "PEN", "UYU", "DOP", "PYG"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  ARS: "AR$",
  USD: "US$",
  EUR: "€",
  MXN: "MX$",
  COP: "COP$",
  CLP: "CLP$",
  PEN: "S/",
  UYU: "$U",
  DOP: "RD$",
  PYG: "₲",
};

export const CURRENCY_DEFAULTS: Record<Currency, { priceKg: number; priceKwh: number; repairCosts: number }> = {
  ARS: { priceKg: 25000, priceKwh: 140, repairCosts: 150000 },
  USD: { priceKg: 25, priceKwh: 0.14, repairCosts: 150 },
  EUR: { priceKg: 23, priceKwh: 0.25, repairCosts: 140 },
  MXN: { priceKg: 450, priceKwh: 2.5, repairCosts: 3000 },
  COP: { priceKg: 90000, priceKwh: 700, repairCosts: 600000 },
  CLP: { priceKg: 25000, priceKwh: 170, repairCosts: 150000 },
  PEN: { priceKg: 80, priceKwh: 0.7, repairCosts: 500 },
  UYU: { priceKg: 900, priceKwh: 7, repairCosts: 6000 },
  DOP: { priceKg: 1500, priceKwh: 10, repairCosts: 9000 },
  PYG: { priceKg: 180000, priceKwh: 1000, repairCosts: 1100000 },
};

export function isCurrency(v: unknown): v is Currency {
  return typeof v === "string" && (CURRENCIES as readonly string[]).includes(v);
}

export const CUSTOM_PRINTER = "custom";

export interface PrinterModel {
  id: string;
  brand: string;
  name: string;
  watts: number;
}

const p = (brand: string, name: string, watts: number): PrinterModel => ({
  id: `${brand} ${name}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
  brand,
  name,
  watts,
});

export const PRINTER_MODELS: PrinterModel[] = [
  p("Bambu Lab", "A1", 95),
  p("Bambu Lab", "A1 Mini", 45),
  p("Bambu Lab", "A2L", 150),
  p("Bambu Lab", "P1P", 80),
  p("Bambu Lab", "P1S", 100),
  p("Bambu Lab", "X1 Carbon", 120),
  p("Bambu Lab", "P2S", 130),
  p("Bambu Lab", "H2S", 210),
  p("Bambu Lab", "H2D", 210),
  p("Bambu Lab", "H2C", 210),
  p("Prusa", "MK3S+", 80),
  p("Prusa", "MK4", 100),
  p("Creality", "Ender 3 V2", 110),
  p("Creality", "Ender 3 S1", 120),
  p("Creality", "K1", 100),
  p("Creality", "K1C", 100),
  p("Creality", "K1 Max", 200),
  p("Creality", "K2", 150),
  p("Creality", "K2 Pro", 180),
  p("Creality", "K2 Plus", 220),
  p("Anycubic", "Kobra 2", 75),
  p("Anycubic", "Vyper", 80),
  p("SnapMaker", "U1", 130),
  p("Elegoo", "Saturn 3 (resina)", 75),
  p("Elegoo", "Saturn 4 (resina)", 75),
  p("Voron", "2.4 350mm", 225),
];

export const PRINTER_BRANDS = [...new Set(PRINTER_MODELS.map((m) => m.brand))];

export function findPrinter(id: string): PrinterModel | undefined {
  return PRINTER_MODELS.find((m) => m.id === id);
}

export const MULTIPLIER_PRESETS: { value: number; label: string }[] = [
  { value: 2, label: "alto volumen / descuento" },
  { value: 2.5, label: "volumen medio" },
  { value: 3, label: "mayorista" },
  { value: 3.5, label: "intermedio" },
  { value: 4, label: "minorista" },
  { value: 5, label: "llaveros / piezas chicas" },
];
