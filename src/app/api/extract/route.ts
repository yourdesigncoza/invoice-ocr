import { NextRequest, NextResponse, after } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth-guards";
import { processInvoice } from "@/lib/extraction";
import { preprocessImage } from "@/lib/extraction/preprocess";
import { findDuplicates } from "@/lib/duplicates/detect";
import { STORAGE_BUCKET, DEFAULT_CURRENCY } from "@/lib/constants";

export const runtime = "nodejs";
export const maxDuration = 300; // background vision work continues after the response

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

type Supabase = NonNullable<ReturnType<typeof createAdminSupabase>>;

// a file that was stored and queued; carries the in-memory buffer into the
// background phase so we don't re-read the (already-consumed) request body
interface Job {
  uploadId: string;
  docId: string;
  fileName: string;
  objectPath: string;
  dir: string;
  buffer: Buffer;
  mimeType: string;
  userId: string;
  projectId: string | null;
}

/**
 * Ingest one or more invoice files (PRD §4.4 pipeline), now **async**:
 *
 *  Phase 1 (blocking, fast): validate + store the untouched original + create a
 *  `document_uploads` row with status 'processing'. Returns immediately so the
 *  client can redirect and show a "Processing…" notification.
 *
 *  Phase 2 (`after()`, background): preprocess → vision extract → persist
 *  invoice + extraction_log → duplicate check → flip the upload to
 *  'done'/'failed'. Runs after the response is flushed on Fluid Compute, so it
 *  survives the client navigating away or closing the app. The client polls
 *  `/api/uploads/status` (the DB is the source of truth) for completion.
 */
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
  // optional site assignment for the whole batch (a batch is usually one site)
  const projectId = (form.get("projectId") as string | null) || null;

  // Phase 1 — store originals + create processing rows (fast)
  const jobs: Job[] = [];
  const uploads: { id: string | null; fileName: string; ok: boolean; error?: string }[] = [];
  for (const file of files) {
    const stored = await storeOriginal(supabase, file, user.id, projectId);
    if ("error" in stored) {
      uploads.push({ id: null, fileName: stored.fileName, ok: false, error: stored.error });
    } else {
      jobs.push(stored);
      uploads.push({ id: stored.uploadId, fileName: stored.fileName, ok: true });
    }
  }

  // Phase 2 — heavy processing, after the response is sent
  if (jobs.length) {
    after(async () => {
      for (const job of jobs) {
        await processStored(supabase, job);
      }
    });
  }

  return NextResponse.json({ uploads });
}

async function storeOriginal(
  supabase: Supabase,
  file: File,
  userId: string,
  projectId: string | null,
): Promise<Job | { fileName: string; error: string }> {
  const fileName = file.name || "upload";
  if (!ACCEPTED.includes(file.type)) {
    return { fileName, error: `Unsupported type: ${file.type}` };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const dir = crypto.randomUUID();
  // namespace every object under the owner's uid so Storage RLS can isolate it
  const objectPath = `${userId}/${dir}/${sanitize(fileName)}`;

  // store the original, untouched (PRD §4.5)
  const up = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(objectPath, buffer, { contentType: file.type, upsert: false });
  if (up.error) return { fileName, error: `Storage: ${up.error.message}` };

  const { data: doc, error: docErr } = await supabase
    .from("document_uploads")
    .insert({
      file_name: fileName,
      file_path: objectPath,
      file_type: file.type,
      file_size: buffer.length,
      upload_status: "processing",
      user_id: userId,
      uploaded_by: userId,
    })
    .select("id")
    .single();
  if (docErr || !doc) return { fileName, error: `DB: ${docErr?.message ?? "insert failed"}` };

  return {
    uploadId: doc.id,
    docId: doc.id,
    fileName,
    objectPath,
    dir,
    buffer,
    mimeType: file.type,
    userId,
    projectId,
  };
}

async function processStored(supabase: Supabase, job: Job) {
  const { docId, fileName, objectPath, dir, buffer, mimeType, userId, projectId } = job;
  try {
    // preprocess (downscale large images / auto-orient) — only store a processed
    // companion when an actual resize happened (PRD §4.5)
    const pre = await preprocessImage(buffer, mimeType);
    let processedPath: string | null = null;
    if (pre.resized) {
      processedPath = `${userId}/${dir}/processed.jpg`;
      await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(processedPath, pre.data, { contentType: pre.mimeType, upsert: true });
    }

    // extract (from the preprocessed image)
    const processed = await processInvoice({
      data: pre.data,
      mimeType: pre.mimeType,
      fileName,
    });

    // Currency is a per-user setting, not detected per invoice. Stamp the
    // user's chosen default, overriding whatever the model guessed. Admin
    // client → scope the lookup by user_id explicitly.
    const { data: settings } = await supabase
      .from("user_settings")
      .select("default_currency")
      .eq("user_id", userId)
      .maybeSingle();
    const currencyCode = settings?.default_currency ?? DEFAULT_CURRENCY;

    // persist invoice
    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .insert({
        ...processed.invoiceFields,
        currency_code: currencyCode,
        original_file_path: objectPath,
        processed_file_path: processedPath,
        user_id: userId,
        project_id: projectId,
      })
      .select("id, supplier_id, original_supplier_name, invoice_number, invoice_date, total_incl_vat")
      .single();
    if (invErr) throw new Error(invErr.message);

    if (processed.extraction.line_items.length) {
      await supabase.from("invoice_items").insert(
        processed.extraction.line_items.map((li) => ({
          invoice_id: invoice.id,
          user_id: userId,
          ...li,
        })),
      );
    }

    // extraction_log (raw text kept separate from structured json, PRD §7.3.1)
    await supabase.from("extraction_logs").insert({
      document_upload_id: docId,
      invoice_id: invoice.id,
      user_id: userId,
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

    // duplicate check before approval (PRD §7.10) — scoped to this user
    const dupes = await findDuplicates(supabase, {
      id: invoice.id,
      user_id: userId,
      supplier_id: invoice.supplier_id,
      original_supplier_name: invoice.original_supplier_name,
      invoice_number: invoice.invoice_number,
      invoice_date: invoice.invoice_date,
      total_incl_vat: invoice.total_incl_vat,
    });
    if (dupes.length) {
      await supabase.from("duplicate_checks").insert(
        dupes.map((d) => ({
          invoice_id: invoice.id,
          user_id: userId,
          possible_duplicate_invoice_id: d.invoice.id,
          match_score: d.score,
          match_reason: d.reason,
        })),
      );
    }

    await supabase
      .from("document_uploads")
      .update({ upload_status: "done", invoice_id: invoice.id })
      .eq("id", docId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("document_uploads")
      .update({ upload_status: "failed" })
      .eq("id", docId);
    await supabase.from("extraction_logs").insert({
      document_upload_id: docId,
      user_id: userId,
      provider_name: "openai_vision",
      errors: [message],
      warnings: [],
    });
  }
}

function sanitize(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
}
