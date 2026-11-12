# Calculadora de impresiones 3D

App web 100 % frontend para calcular el costo real y el precio de venta de una impresión 3D.
Sin backend: todo se guarda en el `localStorage` del navegador.

**Stack:** React 19 + TypeScript + Vite + Tailwind CSS v4 · tests con Vitest.

## Cómo correrla

Necesitás Node.js 20 o superior.

```bash
npm install
npm run dev        # servidor de desarrollo → http://localhost:5173
```

Otros comandos:

```bash
npm test           # corre los tests de la lógica de cálculo (Vitest)
npm run typecheck  # chequeo de tipos
npm run build      # build de producción en dist/
npm run preview    # sirve el build en http://localhost:4173
```

El contenido de `dist/` es estático: se puede subir tal cual a Netlify, Vercel, GitHub Pages, Cloudflare Pages o cualquier hosting de archivos.

## Qué hace

1. **Perfil (gastos fijos)** — varios perfiles (por ej. uno por impresora) con moneda, precio del filamento por kg, precio del kWh, modelo de impresora (autocompleta el consumo en W), vida útil, repuestos y margen de error. Al cambiar la moneda se cargan precios de referencia. Los cambios se reflejan en vivo; "Guardar perfil" los persiste.
2. **Pieza** — horas, minutos, gramos, insumos extra y multiplicador de ganancia (×2 a ×5 o personalizado). Se guarda sola con debounce de 500 ms.
3. **Resultados** — se recalculan en vivo: material, luz, desgaste, margen de error, costo total, insumos (+30 %), **total a cobrar** y **precio MercadoLibre**.
4. **Mis productos** — guardá la pieza calculada con nombre; buscá, cargala de nuevo, duplicala o eliminala. Exportá/importá todo (perfiles + productos) como JSON. Al importar podés reemplazar o combinar.
5. **Presupuesto PDF** — armá un presupuesto para el cliente con la pieza actual, productos guardados e ítems libres (envío, diseño…): cantidades, precios editables, datos del cliente, validez y observaciones. Se descarga como PDF (generado en el navegador con jsPDF) y muestra solo precios de venta, nunca los costos. Los datos de la empresa (nombre, teléfono, email e Instagram) y la numeración quedan guardados en el navegador.

## Fórmula

Cada número se sanitiza (no finito → 0, clamp entre 0 y 1e9).

```
horas    = hours + minutes / 60
material = grams / 1000 * priceKg
luz      = consumptionW / 1000 * horas * priceKwh
desgaste = (machineLifespanHours > 0 ? repairCosts / machineLifespanHours : 0) * horas
error    = errorMarginPercent / 100 * (material + luz + desgaste)
costo    = material + luz + desgaste + error
insumosR = insumos * 1.3
total    = costo * profitMultiplier + insumosR
precioML = costo * (profitMultiplier + 0.8) + insumosR
```

## Estructura

```
src/
  lib/
    calc.ts        lógica pura de cálculo + formato de moneda
    calc.test.ts   tests (incluye el caso de referencia: total 21742.97 / ML 25807.76)
    data.ts        monedas, símbolos, defaults e impresoras
    model.ts       tipos, valores por defecto, normalización e import/export
    quote.ts       modelo y totales del presupuesto
    quotePdf.ts    generación del PDF (se carga solo al descargar)
    storage.ts     acceso a localStorage envuelto en try/catch
  components/      ProfileSection, PieceSection, ResultsPanel, ProductsSection, NumberField, Section
  App.tsx          estado y persistencia
```

## Datos guardados

Claves en `localStorage`: `calc3d:profiles`, `calc3d:activeProfile`, `calc3d:piece`, `calc3d:products`, `calc3d:business`, `calc3d:quoteSeq`.
Si el navegador bloquea el almacenamiento (modo privado, cuota llena), la app sigue funcionando y avisa.
Los productos guardan una copia del perfil usado, así que borrar un perfil no rompe el historial.
