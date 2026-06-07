import { describe, it, expect } from "vitest";
import {
  normalizeName,
  similarity,
  rankSuppliers,
} from "@/lib/suppliers/matching";
import { supplier } from "./_factories";

describe("normalizeName", () => {
  it("lowercases, expands &, strips suffixes and punctuation", () => {
    expect(normalizeName("Hartenbos Spar & Tops (Pty) Ltd")).toBe(
      "hartenbos spar and tops",
    );
  });
  it("collapses whitespace", () => {
    expect(normalizeName("  SPAR   Hartenbos  ")).toBe("spar hartenbos");
  });
});

describe("similarity", () => {
  it("is 1 for identical strings and 0 for empty", () => {
    expect(similarity("spar", "spar")).toBe(1);
    expect(similarity("", "spar")).toBe(0);
  });
  it("scores near-duplicates high", () => {
    expect(similarity("kekkel en kraai", "kekkel en kraal")).toBeGreaterThan(0.9);
  });
});

describe("rankSuppliers (multi-signal, PRD §7.5)", () => {
  it("ranks an exact VAT match highest", () => {
    const candidates = [
      supplier({ id: "a", supplier_name: "Other", vat_number: "999" }),
      supplier({ id: "b", supplier_name: "SPAR HB", vat_number: "4260266616" }),
    ];
    const matches = rankSuppliers(
      { rawName: "totally different", vatNumber: "4260266616" },
      candidates,
    );
    expect(matches[0].supplier.id).toBe("b");
    expect(matches[0].reason).toMatch(/vat/i);
    expect(matches[0].score).toBeGreaterThan(0.95);
  });

  it("fuzzy-matches inconsistent supplier names", () => {
    const candidates = [
      supplier({
        id: "spar",
        supplier_name: "SPAR Hartenbos",
        normalized_name: "spar hartenbos",
      }),
    ];
    const matches = rankSuppliers(
      { rawName: "Hartenbos Spar & Tops" },
      candidates,
    );
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].supplier.id).toBe("spar");
  });

  it("returns nothing for an unrelated name", () => {
    const candidates = [
      supplier({ supplier_name: "SPAR", normalized_name: "spar" }),
    ];
    const matches = rankSuppliers({ rawName: "Acme Industrial Bearings" }, candidates);
    expect(matches).toHaveLength(0);
  });
});
