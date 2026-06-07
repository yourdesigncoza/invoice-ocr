import { describe, it, expect } from "vitest";
import { scoreDocument, deriveStatus } from "@/lib/extraction/confidence";
import { extraction } from "./_factories";

describe("scoreDocument", () => {
  it("trusts the model's overall score when present", () => {
    expect(scoreDocument(extraction({ confidence_score: 0.73 }))).toBe(0.73);
  });

  it("clamps an out-of-range score", () => {
    expect(scoreDocument(extraction({ confidence_score: 1.5 }))).toBe(1);
  });

  it("derives a low score from a near-empty extraction", () => {
    const score = scoreDocument(extraction({}));
    expect(score).toBeLessThan(0.5);
  });

  it("derives a higher score when key fields are present", () => {
    const score = scoreDocument(
      extraction({
        supplier: { normalized_name: "SPAR" },
        invoice_date: "2026-05-27",
        invoice_number: "123",
        total: 100,
        vat: 15,
      }),
    );
    expect(score).toBeGreaterThan(0.7);
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
