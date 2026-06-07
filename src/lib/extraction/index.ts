import type { ExtractionInput, ProviderId } from "./provider";
import { OpenAIVisionProvider } from "./openai-vision";
import { validateExtraction } from "./validate";
import { scoreDocument, deriveStatus } from "./confidence";
import type { Extraction } from "./schema";
import { DEFAULT_CURRENCY, type InvoiceStatus } from "@/lib/constants";

export * from "./schema";
export * from "./provider";

/** Resolve a provider by id. OpenAI Vision is the only one wired today. */
function getProvider(provider: ProviderId) {
  switch (provider) {
    case "openai_vision": {
      const key = process.env.OPENAI_API_KEY;
      if (!key) throw new Error("OPENAI_API_KEY is not configured");
      return new OpenAIVisionProvider(key);
    }
    default:
      throw new Error(`Provider "${provider}" not implemented yet`);
  }
}

export interface ProcessedInvoice {
  extraction: Extraction;
  rawText: string | null;
  warnings: string[];
  confidence: number;
  status: InvoiceStatus;
  /** Flattened column values ready to upsert into `invoices`. */
  invoiceFields: InvoiceFields;
  providerName: string;
  providerModel: string | null;
  durationMs: number;
}

export interface InvoiceFields {
  original_supplier_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  document_type: Extraction["document_type"];
  subtotal_excl_vat: number | null;
  vat_amount: number | null;
  total_incl_vat: number | null;
  currency_code: string;
  payment_method: Extraction["invoice"]["payment_method"];
  po_number: string | null;
  reference_number: string | null;
  vat_number: string | null;
  address: string | null;
  confidence_score: number;
  status: InvoiceStatus;
  warnings: string[];
}

/**
 * Full extraction pipeline (PRD §4.4): provider extract → (schema validated
 * inside provider) → business-rule validation → confidence + warnings →
 * status. Returns everything the caller needs to persist an invoice and an
 * extraction_log. Throwing is the caller's signal to mark the upload failed.
 */
export async function processInvoice(
  input: ExtractionInput & { provider?: ProviderId },
): Promise<ProcessedInvoice> {
  const providerId = input.provider ?? "openai_vision";
  const provider = getProvider(providerId);
  const result = await provider.extract(input);
  const ex = result.extraction;

  const { warnings: ruleWarnings, hardFail } = validateExtraction(ex);
  const warnings = dedupe([...ex.warnings, ...ruleWarnings]);
  const confidence = scoreDocument(ex);
  const status = deriveStatus(confidence, hardFail);

  return {
    extraction: ex,
    rawText: result.rawText,
    warnings,
    confidence,
    status,
    invoiceFields: flatten(ex, confidence, status, warnings),
    providerName: result.providerName,
    providerModel: result.providerModel,
    durationMs: result.durationMs,
  };
}

function flatten(
  ex: Extraction,
  confidence: number,
  status: InvoiceStatus,
  warnings: string[],
): InvoiceFields {
  return {
    original_supplier_name: ex.supplier.raw_name ?? ex.supplier.normalized_name,
    invoice_number: ex.invoice.invoice_number.value,
    invoice_date: ex.invoice.invoice_date.value,
    due_date: ex.invoice.due_date.value,
    document_type: ex.document_type,
    subtotal_excl_vat: ex.invoice.subtotal_excl_vat.value,
    vat_amount: ex.invoice.vat_amount.value,
    total_incl_vat: ex.invoice.total_incl_vat.value,
    currency_code: ex.invoice.currency_code || DEFAULT_CURRENCY,
    payment_method: ex.invoice.payment_method,
    po_number: ex.invoice.po_number,
    reference_number: ex.invoice.reference_number,
    vat_number: ex.supplier.vat_number,
    address: ex.supplier.address,
    confidence_score: confidence,
    status,
    warnings,
  };
}

function dedupe(arr: string[]): string[] {
  return [...new Set(arr.filter(Boolean))];
}
