import type { Extraction } from "./schema";

export interface ExtractionInput {
  /** Image/PDF bytes. */
  data: Buffer;
  /** MIME type, e.g. image/jpeg, application/pdf. */
  mimeType: string;
  fileName?: string;
}

export interface ProviderResult {
  extraction: Extraction; // schema-valid structured data
  rawText: string | null; // raw OCR / model text, stored separately (PRD §7.3.1)
  providerName: string;
  providerModel: string | null;
  durationMs: number;
}

/**
 * Provider abstraction (PRD §4.3 / §4.9). Every backend — OpenAI Vision first,
 * Gemini / Document AI / Textract / Tesseract later — implements this one
 * interface so `processInvoice()` is provider-agnostic.
 */
export interface ExtractionProvider {
  name: string;
  extract(input: ExtractionInput): Promise<ProviderResult>;
}

export type ProviderId =
  | "openai_vision"
  | "gemini_vision"
  | "document_ai"
  | "textract"
  | "tesseract";
