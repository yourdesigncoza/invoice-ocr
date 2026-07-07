import { describe, it, expect } from "vitest";
import { vatSummaryRows, invoicesToRows, toCsv } from "@/lib/export/csv";
import type { InvoiceWithSupplier, InvoiceSiteAllocation } from "@/lib/types";

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

describe("invoicesToRows (per-allocation fan-out)", () => {
  const alloc = (
    invoice_id: string,
    name: string,
    amount: number,
  ): InvoiceSiteAllocation =>
    ({
      id: `${invoice_id}-${name}`,
      invoice_id,
      project_id: name,
      amount,
      source: "items",
      project: { id: name, name, color: null },
    }) as InvoiceSiteAllocation;

  it("split invoice → one row per site, site_amounts sum to the total", () => {
    const i = inv({ id: "i1", total_incl_vat: 100 } as Partial<InvoiceWithSupplier>);
    const rows = invoicesToRows(
      [i],
      new Map([["i1", [alloc("i1", "Site A", 66.67), alloc("i1", "Site B", 33.33)]]]),
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.site).sort()).toEqual(["Site A", "Site B"]);
    expect(rows.reduce((s, r) => s + Number(r.site_amount), 0)).toBeCloseTo(100, 2);
    // invoice-level columns repeat verbatim
    expect(rows.every((r) => r.total_incl_vat === 100)).toBe(true);
  });

  it("no allocations → single row, site_amount = total (column stays summable)", () => {
    const rows = invoicesToRows([
      inv({ id: "i2", total_incl_vat: 50 } as Partial<InvoiceWithSupplier>),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].site).toBe("");
    expect(rows[0].site_amount).toBe(50);
  });

  it("uniform keys: fan-out and plain rows share the same header set", () => {
    const i1 = inv({ id: "i1", total_incl_vat: 100 } as Partial<InvoiceWithSupplier>);
    const i2 = inv({ id: "i2", total_incl_vat: 50 } as Partial<InvoiceWithSupplier>);
    const rows = invoicesToRows([i1, i2], new Map([["i1", [alloc("i1", "A", 100)]]]));
    const keys = rows.map((r) => Object.keys(r).join(","));
    expect(new Set(keys).size).toBe(1);
  });
});

describe("toCsv", () => {
  it("escapes commas and quotes (RFC-4180)", () => {
    expect(toCsv([{ a: "x,y", b: 'he said "hi"' }])).toBe(
      'a,b\n"x,y","he said ""hi"""',
    );
  });
});
