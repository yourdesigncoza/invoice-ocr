import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Opt-in live-API smoke test for the native PDF path (B1). Skipped unless
// RUN_PDF_SMOKE is set, so it never runs in normal `npm test` / CI. It loads
// the OpenAI key from .env.local itself and hits the real model once.
//   RUN_PDF_SMOKE=1 npx vitest run tests/integration/pdf-extract.smoke.test.ts
const run = process.env.RUN_PDF_SMOKE ? describe : describe.skip;

run("PDF extraction (live)", () => {
  it(
    "extracts a real PDF invoice end-to-end",
    async () => {
      // load env from .env.local (vitest doesn't auto-load it)
      const env = readFileSync(resolve(".env.local"), "utf8");
      for (const line of env.split("\n")) {
        const m = line.match(/^(\w+)=(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
      }

      const { processInvoice } = await import("@/lib/extraction");
      const { preprocessImage } = await import("@/lib/extraction/preprocess");

      const path = resolve(
        "tests/sample_invoices/wordpress-pdf-invoice-plugin-sample.pdf",
      );
      const buf = readFileSync(path);
      const pre = await preprocessImage(buf, "application/pdf");
      expect(pre.mimeType).toBe("application/pdf"); // passed through, not rasterised

      const result = await processInvoice({
        data: pre.data,
        mimeType: pre.mimeType,
        fileName: "wordpress-pdf-invoice-plugin-sample.pdf",
      });

      const summary = {
        status: result.status,
        confidence: result.confidence,
        providerModel: result.providerModel,
        durationMs: result.durationMs,
        warnings: result.warnings,
        fields: result.invoiceFields,
      };
      if (process.env.PDF_SMOKE_OUT) {
        writeFileSync(process.env.PDF_SMOKE_OUT, JSON.stringify(summary, null, 2));
      }

      // The contract held (Zod parsed) and the model read *something* structured.
      expect(result.extraction).toBeTruthy();
      expect(result.providerModel).toBeTruthy();
    },
    120_000,
  );
});
