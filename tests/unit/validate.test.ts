import { describe, it, expect } from "vitest";
import { validateExtraction, filterNoiseWarnings } from "@/lib/extraction/validate";
import { extraction } from "./_factories";

describe("validateExtraction (PRD §7.3.2 business rules)", () => {
  it("flags a missing total and hard-fails", () => {
    const r = validateExtraction(extraction({ total: null }));
    expect(r.hardFail).toBe(true);
    expect(r.warnings).toContain("Total amount not found");
  });

  it("rejects a negative total on a non-credit document", () => {
    const r = validateExtraction(extraction({ total: -50 }));
    expect(r.hardFail).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/negative total/i);
  });

  it("reconciles VAT when subtotal + vat = total (no reconcile warning)", () => {
    const r = validateExtraction(
      extraction({ subtotal: 100, vat: 15, total: 115 }),
    );
    expect(r.warnings.join(" ")).not.toMatch(/total does not equal/i);
  });

  it("warns when subtotal + vat != total", () => {
    const r = validateExtraction(
      extraction({ subtotal: 100, vat: 15, total: 130 }),
    );
    expect(r.warnings.join(" ")).toMatch(/total does not equal subtotal/i);
  });

  it("warns when VAT is missing entirely", () => {
    const r = validateExtraction(extraction({ total: 100, vat: null }));
    expect(r.warnings).toContain("VAT amount not clearly detected");
  });

  it("flags a tax invoice missing its invoice number and VAT number", () => {
    const r = validateExtraction(
      extraction({ document_type: "Tax Invoice", total: 100, vat: 15, subtotal: 85 }),
    );
    expect(r.warnings.join(" ")).toMatch(/invoice number missing/i);
    expect(r.warnings.join(" ")).toMatch(/vat number missing/i);
  });

  it("flags a missing supplier and date", () => {
    const r = validateExtraction(extraction({ total: 100, vat: 15 }));
    expect(r.warnings).toContain("Supplier name not found");
    expect(r.warnings).toContain("Invoice date not found");
  });

  it("filterNoiseWarnings drops the unactionable VAT-rate noise (SA is flat 15%)", () => {
    const kept = filterNoiseWarnings([
      "VAT rate not clearly detected on line items",
      "VAT rate could not be determined",
    ]);
    expect(kept).toEqual([]);
  });

  it("filterNoiseWarnings keeps genuine VAT signals", () => {
    const signals = [
      "VAT amount not clearly detected",
      "VAT number missing on a tax invoice",
      "VAT check failed: total does not equal subtotal + VAT — manual review required",
      "Total amount not found",
    ];
    expect(filterNoiseWarnings(signals)).toEqual(signals);
  });

  it("does not hard-fail a clean receipt", () => {
    const r = validateExtraction(
      extraction({
        supplier: { raw_name: "SPAR" },
        invoice_date: "2026-05-27",
        total: 100,
        vat: 15,
        subtotal: 85,
      }),
    );
    expect(r.hardFail).toBe(false);
  });
});
