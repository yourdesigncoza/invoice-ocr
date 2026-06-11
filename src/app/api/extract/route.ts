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

// Max invoices processed concurrently in the background after() phase. Bounded
// to stay polite to the OpenAI rate limit while collapsing batch wall-clock.
const PHASE2_CONCURRENCY = 4;

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

  // Phase 2 — heavy processing, after the response is sent. Run jobs with
  // bounded concurrency so a multi-photo batch finishes well inside the 300s
  // function ceiling instead of serially (each job is I/O-bound on the vision
  // call). `processStored` owns its own try/catch, so a failure can't reject
  // the wave. The status endpoint reaps anything still stranded past 300s.
  if (jobs.length) {
    after(async () => {
      for (let i = 0; i < jobs.length; i += PHASE2_CONCURRENCY) {
        await Promise.allSettled(
          jobs.slice(i, i + PHASE2_CONCURRENCY).map((job) => processStored(supabase, job)),
        );
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

  const buffer = Buffer.from(await file.arrayBuffer());
  // Trust the bytes, not the client-supplied file.type: sniff the magic bytes
  // so a mislabelled or corrupt file fails here (a clear per-file error) rather
  // than in the background, and use the detected type downstream.
  const detected = sniffMime(buffer);
  if (!detected || !ACCEPTED.includes(detected)) {
    return { fileName, error: `Unsupported or unreadable file (${file.type || "unknown type"})` };
  }

  const dir = crypto.randomUUID();
  // namespace every object under the owner's uid so Storage RLS can isolate it
  const objectPath = `${userId}/${dir}/${sanitize(fileName)}`;

  // store the original, untouched (PRD §4.5)
  const up = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(objectPath, buffer, { contentType: detected, upsert: false });
  if (up.error) return { fileName, error: `Storage: ${up.error.message}` };

  const { data: doc, error: docErr } = await supabase
    .from("document_uploads")
    .insert({
      file_name: fileName,
      file_path: objectPath,
      file_type: detected,
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
    mimeType: detected,
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

    // Currency is a per-user setting, not detected per invoice. Resolve it
    // first: it both stamps the invoice (overriding the model's guess) and
    // gates SA-specific validation (e.g. the VAT-number shape lint). Admin
    // client → scope the lookup by user_id explicitly.
    const { data: settings } = await supabase
      .from("user_settings")
      .select("default_currency")
      .eq("user_id", userId)
      .maybeSingle();
    const currencyCode = settings?.default_currency ?? DEFAULT_CURRENCY;

    // extract (from the preprocessed image)
    const processed = await processInvoice({
      data: pre.data,
      mimeType: pre.mimeType,
      fileName,
      defaultCurrency: currencyCode,
    });

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
      prompt_tokens: processed.usage?.prompt_tokens ?? null,
      completion_tokens: processed.usage?.completion_tokens ?? null,
      total_tokens: processed.usage?.total_tokens ?? null,
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

/** Detect the real content type from magic bytes; null if unrecognised. */
function sniffMime(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
    return "image/png";
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46)
    return "application/pdf"; // %PDF
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP")
    return "image/webp";
  return null;
}
