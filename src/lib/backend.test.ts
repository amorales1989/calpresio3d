import { describe, expect, it } from "vitest";
import { diffById } from "./backend";

describe("diffById", () => {
  const a = { id: "a", n: 1 };
  const b = { id: "b", n: 2 };

  it("no manda nada si no cambió", () => {
    expect(diffById([a, b], [a, b])).toEqual({ upserts: [], deletes: [] });
    expect(diffById([a], [{ ...a }])).toEqual({ upserts: [], deletes: [] });
  });

  it("detecta altas, cambios y bajas", () => {
    const a2 = { ...a, n: 9 };
    const c = { id: "c", n: 3 };
    expect(diffById([a, b], [a2, c])).toEqual({ upserts: [a2, c], deletes: ["b"] });
  });
});
