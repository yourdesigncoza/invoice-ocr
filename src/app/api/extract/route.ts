import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { processInvoice } from "@/lib/extraction";
import { findDuplicates } from "@/lib/duplicates/detect";
import { STORAGE_BUCKET } from "@/lib/constants";

export const runtime = "nodejs";
export const maxDuration = 60; // vision calls can be slow

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

/**
 * Ingest one or more invoice files (PRD §4.4 pipeline). Per file:
 *  store original (untouched) → extract → validate → persist invoice +
 *  extraction_log → duplicate check. Each file is independent; one failure
 *  doesn't sink the batch.
 */
export async function POST(req: NextRequest) {
  const supabase = createAdminSupabase();
  if (!supabase)
    return NextResponse.json(
      { error: "Supabase not configured on the server" },
      { status: 503 },
    );

  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0)
    return NextResponse.json({ error: "No files provided" }, { status: 400 });

  const results = [];
  for (const file of files) {
    results.push(await ingestOne(supabase, file));
  }
  return NextResponse.json({ results });
}

async function ingestOne(
  supabase: NonNullable<ReturnType<typeof createAdminSupabase>>,
  file: File,
) {
  const fileName = file.name || "upload";
  if (!ACCEPTED.includes(file.type)) {
    return { fileName, ok: false, error: `Unsupported type: ${file.type}` };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  // Stable-ish object path without Date.now()/random (unavailable here):
  const objectPath = `${crypto.randomUUID()}/${sanitize(fileName)}`;

  // 1. store the original, untouched (PRD §4.5)
  const up = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(objectPath, buffer, { contentType: file.type, upsert: false });
  if (up.error)
    return { fileName, ok: false, error: `Storage: ${up.error.message}` };

  const { data: doc } = await supabase
    .from("document_uploads")
    .insert({
      file_name: fileName,
      file_path: objectPath,
      file_type: file.type,
      file_size: buffer.length,
      upload_status: "processing",
    })
    .select("id")
    .single();

  // 2. extract
  try {
    const processed = await processInvoice({
      data: buffer,
      mimeType: file.type,
      fileName,
    });

    // 3. persist invoice
    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .insert({
        ...processed.invoiceFields,
        original_file_path: objectPath,
      })
      .select("id, supplier_id, invoice_number, invoice_date, total_incl_vat")
      .single();
    if (invErr) throw new Error(invErr.message);

    // line items
    if (processed.extraction.line_items.length) {
      await supabase.from("invoice_items").insert(
        processed.extraction.line_items.map((li) => ({
          invoice_id: invoice.id,
          ...li,
        })),
      );
    }

    // extraction_log (raw text kept separate from structured json, PRD §7.3.1)
    await supabase.from("extraction_logs").insert({
      document_upload_id: doc?.id ?? null,
      invoice_id: invoice.id,
      provider_name: processed.providerName,
      provider_model: processed.providerModel,
      raw_ocr_text: processed.rawText,
      extracted_json: processed.extraction,
      validated_json: processed.invoiceFields,
      confidence_score: processed.confidence,
      warnings: processed.warnings,
      errors: [],
      processing_duration_ms: processed.durationMs,
    });

    // 4. duplicate check before approval (PRD §7.10)
    const dupes = await findDuplicates(supabase, {
      id: invoice.id,
      supplier_id: invoice.supplier_id,
      invoice_number: invoice.invoice_number,
      invoice_date: invoice.invoice_date,
      total_incl_vat: invoice.total_incl_vat,
    });
    if (dupes.length) {
      await supabase.from("duplicate_checks").insert(
        dupes.map((d) => ({
          invoice_id: invoice.id,
          possible_duplicate_invoice_id: d.invoice.id,
          match_score: d.score,
          match_reason: d.reason,
        })),
      );
    }

    await supabase
      .from("document_uploads")
      .update({ upload_status: "done", invoice_id: invoice.id })
      .eq("id", doc?.id ?? "");

    return {
      fileName,
      ok: true,
      invoiceId: invoice.id,
      status: processed.status,
      confidence: processed.confidence,
      warnings: processed.warnings,
      possibleDuplicates: dupes.length,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("document_uploads")
      .update({ upload_status: "failed" })
      .eq("id", doc?.id ?? "");
    await supabase.from("extraction_logs").insert({
      document_upload_id: doc?.id ?? null,
      provider_name: "openai_vision",
      errors: [message],
      warnings: [],
    });
    return { fileName, ok: false, error: message };
  }
}

function sanitize(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
}
