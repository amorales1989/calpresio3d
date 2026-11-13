import { describe, expect, it } from "vitest";
import { agregarProducto, itemDesdeProducto, normalizeItem, resumenItems, totalItems } from "./items";
import { defaultPiece, defaultProfile, type Product } from "./model";

const prod = (id: string, name: string, total: number): Product => ({
  id,
  name,
  material: "PLA negro",
  description: "",
  createdAt: "2026-11-12T12:00:00.000Z",
  piece: defaultPiece(),
  profile: defaultProfile(),
  results: { horas: 0, material: 0, luz: 0, desgaste: 0, error: 0, costo: 0, insumos: 0, total, precioML: 0 },
});

describe("ítems", () => {
  it("un producto guardado trae nombre, detalle y precio", () => {
    expect(itemDesdeProducto(prod("m", "Maceta", 1234.567))).toMatchObject({
      productoId: "m",
      descripcion: "Maceta",
      detalle: "Material: PLA negro",
      cantidad: 1,
      precioUnitario: 1234.57,
    });
  });

  it("agregar el mismo producto suma cantidad en vez de duplicar", () => {
    const m = prod("m", "Maceta", 1000);
    const items = agregarProducto(agregarProducto(agregarProducto([], m), m), prod("l", "Llavero", 500));
    expect(items.map((i) => [i.descripcion, i.cantidad])).toEqual([["Maceta", 2], ["Llavero", 1]]);
    expect(totalItems(items)).toBe(2500);
    expect(resumenItems(items)).toBe("2 × Maceta, Llavero");
  });

  it("normaliza ítems rotos", () => {
    expect(normalizeItem(null)).toBeNull();
    expect(normalizeItem({ descripcion: "X", cantidad: -2, precioUnitario: "a" })).toMatchObject({ productoId: null, cantidad: 1, precioUnitario: 0 });
  });
});
