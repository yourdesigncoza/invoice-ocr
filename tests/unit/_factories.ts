import type { Extraction } from "@/lib/extraction/schema";
import type { Supplier } from "@/lib/types";
import type { DocumentType } from "@/lib/constants";

const field = <T>(value: T) => ({ value, raw_value: null, confidence: null });

export interface ExtractionOverrides {
  document_type?: DocumentType;
  supplier?: Partial<Extraction["supplier"]>;
  invoice_number?: string | null;
  invoice_date?: string | null;
  subtotal?: number | null;
  vat?: number | null;
  total?: number | null;
  warnings?: string[];
  confidence_score?: number | null;
}

/** Build a complete, schema-shaped Extraction for testing pure logic. */
export function extraction(o: ExtractionOverrides = {}): Extraction {
  return {
    document_type: o.document_type ?? "Receipt",
    supplier: {
      raw_name: null,
      normalized_name: null,
      vat_number: null,
      phone: null,
      address: null,
      ...o.supplier,
    },
    invoice: {
      invoice_number: field<string | null>(o.invoice_number ?? null),
      invoice_date: field<string | null>(o.invoice_date ?? null),
      due_date: field<string | null>(null),
      subtotal_excl_vat: field<number | null>(o.subtotal ?? null),
      vat_amount: field<number | null>(o.vat ?? null),
      total_incl_vat: field<number | null>(o.total ?? null),
      currency_code: "ZAR",
      payment_method: null,
      po_number: null,
      reference_number: null,
    },
    line_items: [],
    warnings: o.warnings ?? [],
    confidence_score: o.confidence_score ?? null,
  };
}

export function supplier(o: Partial<Supplier> = {}): Supplier {
  return {
    id: "s1",
    supplier_name: "Test Supplier",
    normalized_name: "test supplier",
    parent_supplier_id: null,
    vat_number: null,
    phone: null,
    email: null,
    address: null,
    category: null,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    ...o,
  };
}
