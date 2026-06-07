import { describe, it, expect } from "vitest";
import { vatSummaryRows, toCsv } from "@/lib/export/csv";
import type { InvoiceWithSupplier } from "@/lib/types";

function inv(o: Partial<InvoiceWithSupplier>): InvoiceWithSupplier {
  return {
    invoice_date: null,
    subtotal_excl_vat: null,
    vat_amount: null,
    total_incl_vat: null,
    currency_code: "ZAR",
    document_type: "Receipt",
    status: "approved",
    supplier: null,
    original_supplier_name: null,
    invoice_number: null,
    payment_method: null,
    vat_number: null,
    confidence_score: null,
    ...o,
  } as InvoiceWithSupplier;
}

describe("vatSummaryRows (VAT filing rollup)", () => {
  it("rolls up per month with input VAT and a TOTAL row", () => {
    const rows = vatSummaryRows([
      inv({ invoice_date: "2026-05-01", subtotal_excl_vat: 100, vat_amount: 15, total_incl_vat: 115 }),
      inv({ invoice_date: "2026-05-20", subtotal_excl_vat: 200, vat_amount: 0, total_incl_vat: 200 }),
      inv({ invoice_date: "2026-06-02", subtotal_excl_vat: 50, vat_amount: 7.5, total_incl_vat: 57.5 }),
    ]);
    expect(rows.map((r) => r.period)).toEqual(["May 2026", "Jun 2026", "TOTAL"]);

    const may = rows[0];
    expect(may.invoices).toBe(2);
    expect(may.invoices_with_vat).toBe(1); // only the R15 VAT one
    expect(may.vat_amount).toBe(15);
    expect(may.total_incl_vat).toBe(315);

    const total = rows[2];
    expect(total.invoices).toBe(3);
    expect(total.vat_amount).toBe(22.5);
    expect(total.total_incl_vat).toBe(372.5);
  });

  it("ignores undated invoices and returns empty when there are none", () => {
    expect(vatSummaryRows([inv({ invoice_date: null, total_incl_vat: 99 })])).toEqual([]);
  });
});

describe("toCsv", () => {
  it("escapes commas and quotes (RFC-4180)", () => {
    expect(toCsv([{ a: "x,y", b: 'he said "hi"' }])).toBe(
      'a,b\n"x,y","he said ""hi"""',
    );
  });
});
