import { describe, it, expect } from "vitest";
import { scoreDocument, deriveStatus } from "@/lib/extraction/confidence";
import { extraction } from "./_factories";

describe("scoreDocument", () => {
  const fullFields = {
    supplier: { normalized_name: "SPAR" },
    invoice_date: "2026-05-27",
    invoice_number: "123",
    total: 100,
    vat: 15,
  } as const;

  it("keeps the model's score when field presence supports it", () => {
    expect(
      scoreDocument(extraction({ ...fullFields, confidence_score: 0.73 })),
    ).toBe(0.73);
  });

  it("caps the model's self-report at what the fields support", () => {
    // model claims near-certainty on a near-empty doc → the score reflects the
    // (low) field-presence evidence, never the inflated self-report
    expect(scoreDocument(extraction({ confidence_score: 0.95 }))).toBeLessThan(0.5);
  });

  it("never exceeds 1 for an out-of-range model score", () => {
    expect(
      scoreDocument(extraction({ ...fullFields, confidence_score: 1.5 })),
    ).toBeLessThanOrEqual(1);
  });

  it("derives a low score from a near-empty extraction", () => {
    expect(scoreDocument(extraction({}))).toBeLessThan(0.5);
  });

  it("derives a higher score when key fields are present", () => {
    expect(scoreDocument(extraction(fullFields))).toBeGreaterThan(0.7);
  });

  it("forces below the medium threshold when VAT does not reconcile", () => {
    // subtotal + VAT ≠ total is near-proof a money digit was misread, so a
    // high self-reported score must not keep the doc out of low_confidence
    const score = scoreDocument(
      extraction({ ...fullFields, confidence_score: 0.99 }),
      { reconcileFailed: true },
    );
    expect(score).toBeLessThan(0.7);
    expect(deriveStatus(score, false)).toBe("low_confidence");
  });

  it("forces below the medium threshold when supplier and date are both missing", () => {
    const score = scoreDocument(extraction({ total: 100, confidence_score: 0.99 }));
    expect(score).toBeLessThan(0.7);
  });
});

describe("deriveStatus (nothing auto-approves, PRD §3)", () => {
  it("needs_review for confident, clean docs", () => {
    expect(deriveStatus(0.95, false)).toBe("needs_review");
  });
  it("low_confidence below the medium threshold", () => {
    expect(deriveStatus(0.5, false)).toBe("low_confidence");
  });
  it("low_confidence on hard validation failure regardless of score", () => {
    expect(deriveStatus(0.99, true)).toBe("low_confidence");
  });
});
