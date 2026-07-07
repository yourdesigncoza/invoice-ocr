import { describe, it, expect } from "vitest";
import {
  normalizeName,
  similarity,
  rankSuppliers,
  pickAutoLink,
  AUTO_LINK_THRESHOLD,
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

describe("pickAutoLink (auto-silo on approve)", () => {
  const spar = supplier({ id: "spar", supplier_name: "SPAR", normalized_name: "spar" });

  it("links VAT / phone / normalized-name matches (all above the floor)", () => {
    for (const score of [0.99, 0.95, 0.97]) {
      expect(pickAutoLink([{ supplier: spar, score, reason: "x" }])).not.toBeNull();
    }
  });

  it("refuses weak fuzzy matches — a new silo is safer than a wrong merge", () => {
    // rankSuppliers' fuzzy band starts at 0.6 + 0.8*0.35 = 0.88, below the floor
    expect(pickAutoLink([{ supplier: spar, score: 0.88, reason: "fuzzy" }])).toBeNull();
    expect(pickAutoLink([])).toBeNull();
  });

  it("floor sits between the weak-fuzzy band and the strong signals", () => {
    expect(AUTO_LINK_THRESHOLD).toBeGreaterThan(0.88);
    expect(AUTO_LINK_THRESHOLD).toBeLessThanOrEqual(0.95);
  });
});
