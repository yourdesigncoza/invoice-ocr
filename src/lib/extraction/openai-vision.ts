import OpenAI from "openai";
import type { ExtractionProvider, ExtractionInput, ProviderResult } from "./provider";
import { parseExtraction, EXTRACTION_JSON_SCHEMA } from "./schema";
import { EXTRACTION_SYSTEM_PROMPT, EXTRACTION_USER_PROMPT } from "./prompt";

/**
 * Primary extractor (PRD §4.9). Uses an OpenAI vision model with a strict JSON
 * schema response so output conforms to the contract before Zod re-validates.
 *
 * Images are sent as data URLs. PDFs must be pre-converted to page images
 * (PRD §4.5 preprocessing) — that's a TODO; until then a PDF surfaces a clear
 * error that the pipeline turns into a needs-review warning.
 */
export class OpenAIVisionProvider implements ExtractionProvider {
  name = "openai_vision";
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model = process.env.OPENAI_VISION_MODEL || "gpt-4o") {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async extract(input: ExtractionInput): Promise<ProviderResult> {
    if (input.mimeType === "application/pdf") {
      throw new Error(
        "PDF received — convert to page images before extraction (preprocessing TODO, PRD §4.5).",
      );
    }
    const started = Date.now();
    const dataUrl = `data:${input.mimeType};base64,${input.data.toString("base64")}`;

    const completion = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0,
      response_format: {
        type: "json_schema",
        json_schema: EXTRACTION_JSON_SCHEMA,
      },
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: EXTRACTION_USER_PROMPT },
            { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
          ],
        },
      ],
    });

    const content = completion.choices[0]?.message?.content ?? "";
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
}
