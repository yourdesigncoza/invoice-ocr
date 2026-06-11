import OpenAI from "openai";
import type { ExtractionProvider, ExtractionInput, ProviderResult } from "./provider";
import { parseExtraction, EXTRACTION_JSON_SCHEMA } from "./schema";
import { EXTRACTION_SYSTEM_PROMPT, EXTRACTION_USER_PROMPT } from "./prompt";

/**
 * Primary extractor (PRD §4.9). Uses an OpenAI(-compatible) vision model.
 *
 * Two portability ideas adapted from bhimrazy/receipt-ocr (MIT):
 *  - `baseURL` lets the same code path target ANY OpenAI-compatible endpoint
 *    (OpenRouter, Groq, Together, Azure, local vLLM/Ollama) — set OPENAI_BASE_URL.
 *  - response-format fallback: try strict `json_schema`, and if the model/endpoint
 *    doesn't support it, retry with `json_object` (schema embedded in the prompt).
 *    Either way Zod re-validates, so the contract holds (PRD §7.3.1).
 *
 * Images should be pre-downscaled (see preprocess.ts) before they reach here.
 * PDFs are sent to the model natively as a base64 `file` content part.
 */
type ResponseFormat = "json_schema" | "json_object";

export class OpenAIVisionProvider implements ExtractionProvider {
  name = "openai_vision";
  private client: OpenAI;
  private model: string;
  private preferredFormat: ResponseFormat;

  constructor(
    apiKey: string,
    model = process.env.OPENAI_VISION_MODEL || "gpt-4o",
    baseURL = process.env.OPENAI_BASE_URL || undefined,
  ) {
    this.client = new OpenAI({ apiKey, baseURL });
    this.model = model;
    this.preferredFormat =
      process.env.OPENAI_RESPONSE_FORMAT === "json_object"
        ? "json_object"
        : "json_schema";
  }

  async extract(input: ExtractionInput): Promise<ProviderResult> {
    const started = Date.now();
    const dataUrl = `data:${input.mimeType};base64,${input.data.toString("base64")}`;
    // PDFs go to the model natively (gpt-4o accepts a base64 `file` content
    // part and reads each page's text + image); raster images go as image_url
    // with high detail. Either way the same prompt/schema/validation applies.
    const media: OpenAI.Chat.Completions.ChatCompletionContentPart =
      input.mimeType === "application/pdf"
        ? {
            type: "file",
            file: { filename: input.fileName ?? "invoice.pdf", file_data: dataUrl },
          }
        : { type: "image_url", image_url: { url: dataUrl, detail: "high" } };

    let content: string;
    try {
      content = await this.call(this.preferredFormat, media);
    } catch (err) {
      // Fall back to json_object if the endpoint rejected strict json_schema.
      if (this.preferredFormat === "json_schema" && isFormatUnsupported(err)) {
        content = await this.call("json_object", media);
      } else {
        throw err;
      }
    }

    if (!content) throw new Error("Empty response from vision model");

    // parseExtraction throws ZodError on malformed output — caught upstream,
    // which keeps bad extractions out of the review queue (PRD §7.3.1).
    const extraction = parseExtraction(JSON.parse(content));

    return {
      extraction,
      rawText: content,
      providerName: this.name,
      providerModel: this.model,
      durationMs: Date.now() - started,
    };
  }

  private async call(
    format: ResponseFormat,
    media: OpenAI.Chat.Completions.ChatCompletionContentPart,
  ): Promise<string> {
    // In json_object mode the model gets the schema in-prompt (it can't be
    // enforced server-side), so it still produces the right shape.
    const userText =
      format === "json_object"
        ? `${EXTRACTION_USER_PROMPT}\n\nReturn a JSON object matching this schema:\n${JSON.stringify(EXTRACTION_JSON_SCHEMA.schema)}`
        : EXTRACTION_USER_PROMPT;

    const response_format =
      format === "json_schema"
        ? ({ type: "json_schema", json_schema: EXTRACTION_JSON_SCHEMA } as const)
        : ({ type: "json_object" } as const);

    const completion = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0,
      response_format,
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
        {
          role: "user",
          content: [{ type: "text", text: userText }, media],
        },
      ],
    });
    return completion.choices[0]?.message?.content ?? "";
  }
}

/** Heuristic: did the endpoint reject the strict json_schema response format? */
function isFormatUnsupported(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("json_schema") ||
    msg.includes("response_format") ||
    msg.includes("structured output") ||
    (msg.includes("schema") && msg.includes("support")) ||
    msg.includes("not supported")
  );
}
