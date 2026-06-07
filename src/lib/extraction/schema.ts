import { z } from "zod";
import {
  DOCUMENT_TYPES,
  PAYMENT_METHODS,
  DEFAULT_CURRENCY,
} from "@/lib/constants";

/**
 * The extraction contract (PRD §7.3 / §7.3.1).
 *
 * Hard rules encoded here:
 *  - unknown fields are `null`, never invented
 *  - money is a number, dates are ISO `YYYY-MM-DD`
 *  - every important field carries its own confidence and the original
 *    detected `raw_value` (so normalisation is always reversible)
 *  - confidence lives at document level AND field level
 *  - warnings are an array
 *
 * `parseExtraction` rejects malformed model output *before* it reaches the
 * review queue.
 */

// A field that keeps the normalised value, the original detected text, and a
// per-field confidence. value is nullable — null means "not found".
const stringField = z.object({
  value: z.string().nullable(),
  raw_value: z.string().nullable().default(null),
  confidence: z.number().min(0).max(1).nullable().default(null),
});

const numberField = z.object({
  value: z.number().nullable(),
  raw_value: z.string().nullable().default(null),
  confidence: z.number().min(0).max(1).nullable().default(null),
});

// ISO date string or null
const dateField = z.object({
  value: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be ISO YYYY-MM-DD")
    .nullable(),
  raw_value: z.string().nullable().default(null),
  confidence: z.number().min(0).max(1).nullable().default(null),
});

export const lineItemSchema = z.object({
  description: z.string().nullable().default(null),
  quantity: z.number().nullable().default(null),
  unit_price: z.number().nullable().default(null),
  line_total: z.number().nullable().default(null),
  vat_rate: z.number().nullable().default(null),
  category: z.string().nullable().default(null),
});
export type LineItem = z.infer<typeof lineItemSchema>;

export const extractionSchema = z.object({
  document_type: z.enum(DOCUMENT_TYPES).default("Unknown"),

  supplier: z.object({
    raw_name: z.string().nullable().default(null),
    normalized_name: z.string().nullable().default(null),
    vat_number: z.string().nullable().default(null),
    phone: z.string().nullable().default(null),
    address: z.string().nullable().default(null),
  }),

  invoice: z.object({
    invoice_number: stringField,
    invoice_date: dateField,
    due_date: dateField,
    subtotal_excl_vat: numberField,
    vat_amount: numberField,
    total_incl_vat: numberField,
    currency_code: z.string().default(DEFAULT_CURRENCY),
    payment_method: z.enum(PAYMENT_METHODS).nullable().default(null),
    po_number: z.string().nullable().default(null),
    reference_number: z.string().nullable().default(null),
  }),

  line_items: z.array(lineItemSchema).default([]),

  // model-suggested warnings; validators add deterministic ones afterwards
  warnings: z.array(z.string()).default([]),

  // overall document confidence (0–1)
  confidence_score: z.number().min(0).max(1).nullable().default(null),
});

export type Extraction = z.infer<typeof extractionSchema>;

/** Validate raw model JSON. Throws ZodError on malformed output. */
export function parseExtraction(raw: unknown): Extraction {
  return extractionSchema.parse(raw);
}

/** The JSON Schema we hand the model (providers that support json_schema). */
export const EXTRACTION_JSON_SCHEMA = {
  name: "invoice_extraction",
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "document_type",
      "supplier",
      "invoice",
      "line_items",
      "warnings",
      "confidence_score",
    ],
    properties: {
      document_type: { type: "string", enum: [...DOCUMENT_TYPES] },
      supplier: {
        type: "object",
        additionalProperties: false,
        required: ["raw_name", "normalized_name", "vat_number", "phone", "address"],
        properties: {
          raw_name: { type: ["string", "null"] },
          normalized_name: { type: ["string", "null"] },
          vat_number: { type: ["string", "null"] },
          phone: { type: ["string", "null"] },
          address: { type: ["string", "null"] },
        },
      },
      invoice: {
        type: "object",
        additionalProperties: false,
        required: [
          "invoice_number",
          "invoice_date",
          "due_date",
          "subtotal_excl_vat",
          "vat_amount",
          "total_incl_vat",
          "currency_code",
          "payment_method",
          "po_number",
          "reference_number",
        ],
        properties: {
          invoice_number: field(["string", "null"]),
          invoice_date: field(["string", "null"]),
          due_date: field(["string", "null"]),
          subtotal_excl_vat: field(["number", "null"]),
          vat_amount: field(["number", "null"]),
          total_incl_vat: field(["number", "null"]),
          currency_code: { type: "string" },
          payment_method: { type: ["string", "null"], enum: [...PAYMENT_METHODS, null] },
          po_number: { type: ["string", "null"] },
          reference_number: { type: ["string", "null"] },
        },
      },
      line_items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["description", "quantity", "unit_price", "line_total", "vat_rate", "category"],
          properties: {
            description: { type: ["string", "null"] },
            quantity: { type: ["number", "null"] },
            unit_price: { type: ["number", "null"] },
            line_total: { type: ["number", "null"] },
            vat_rate: { type: ["number", "null"] },
            category: { type: ["string", "null"] },
          },
        },
      },
      warnings: { type: "array", items: { type: "string" } },
      confidence_score: { type: ["number", "null"] },
    },
  },
  strict: true,
} as const;

function field(valueType: string[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["value", "raw_value", "confidence"],
    properties: {
      value: { type: valueType },
      raw_value: { type: ["string", "null"] },
      confidence: { type: ["number", "null"] },
    },
  };
}
