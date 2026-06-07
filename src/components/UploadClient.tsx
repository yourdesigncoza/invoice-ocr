"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  UploadCloud,
  FileCheck2,
  FileX2,
  Loader2,
  Camera,
  FolderOpen,
} from "lucide-react";
import { Card, Button } from "@/components/ui";
import { StatusBadge } from "@/components/StatusBadge";
import { compressImage } from "@/lib/image/compress";
import { cn, formatPct } from "@/lib/utils";
import type { InvoiceStatus } from "@/lib/constants";

interface FileResult {
  fileName: string;
  ok: boolean;
  invoiceId?: string;
  status?: InvoiceStatus;
  confidence?: number;
  warnings?: string[];
  possibleDuplicates?: number;
  error?: string;
}

export function UploadClient() {
  const router = useRouter();
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<FileResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    setBusy(true);
    setResults([]);
    try {
      // shrink phone photos on-device before upload (Vercel 4.5 MB body limit
      // + faster on mobile data); PDFs/small images pass through unchanged
      const prepared = await Promise.all(list.map(compressImage));
      const form = new FormData();
      prepared.forEach((f) => form.append("files", f));
      const res = await fetch("/api/extract", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) {
        setResults([{ fileName: "Request failed", ok: false, error: json.error }]);
      } else {
        setResults(json.results ?? []);
        router.refresh();
      }
    } catch (e) {
      setResults([
        { fileName: "Upload error", ok: false, error: String(e) },
      ]);
    } finally {
      setBusy(false);
    }
  }, [router]);

  return (
    <div className="space-y-6">
      {/* hidden inputs: camera opens the rear camera on phones */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => e.target.files && upload(e.target.files)}
      />
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => e.target.files && upload(e.target.files)}
      />

      {/* primary actions — camera first, since most uploads are phone photos */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => cameraRef.current?.click()}
          disabled={busy}
          className="flex flex-col items-center justify-center gap-2 rounded-xl bg-primary px-4 py-6 text-white hover:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none"
        >
          <Camera className="h-7 w-7" />
          <span className="text-sm font-medium">Take photo</span>
        </button>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-6 text-foreground hover:bg-slate-50 disabled:opacity-50 disabled:pointer-events-none"
        >
          <FolderOpen className="h-7 w-7 text-muted" />
          <span className="text-sm font-medium">Choose files</span>
        </button>
      </div>

      {/* drag & drop — desktop convenience */}
      <Card
        className={cn(
          "hidden sm:block border-2 border-dashed transition-colors",
          dragging ? "border-primary bg-blue-50/50" : "border-border",
        )}
      >
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            upload(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className="flex flex-col items-center justify-center gap-3 py-12 cursor-pointer text-center"
        >
          {busy ? (
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
          ) : (
            <UploadCloud className="h-8 w-8 text-muted" />
          )}
          <div>
            <p className="text-sm font-medium text-foreground">
              {busy ? "Extracting…" : "Drag & drop invoices here"}
            </p>
            <p className="text-xs text-muted mt-0.5">
              JPG, PNG, WEBP, or PDF · single or batch · photos shrink before upload
            </p>
          </div>
        </div>
      </Card>

      {results.length > 0 && (
        <Card className="divide-y divide-border">
          {results.map((r, i) => (
            <div key={i} className="flex items-start gap-3 p-4">
              {r.ok ? (
                <FileCheck2 className="h-5 w-5 text-status-approved shrink-0 mt-0.5" />
              ) : (
                <FileX2 className="h-5 w-5 text-status-low shrink-0 mt-0.5" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium truncate">{r.fileName}</span>
                  {r.status && <StatusBadge status={r.status} />}
                  {typeof r.confidence === "number" && (
                    <span className="text-xs text-muted">
                      {formatPct(r.confidence)} confidence
                    </span>
                  )}
                  {!!r.possibleDuplicates && (
                    <span className="text-xs text-status-duplicate font-medium">
                      {r.possibleDuplicates} possible duplicate(s)
                    </span>
                  )}
                </div>
                {r.error && (
                  <p className="text-xs text-status-low mt-1">{r.error}</p>
                )}
                {r.warnings && r.warnings.length > 0 && (
                  <ul className="mt-1 text-xs text-muted list-disc list-inside">
                    {r.warnings.slice(0, 3).map((w, j) => (
                      <li key={j}>{w}</li>
                    ))}
                  </ul>
                )}
                {r.ok && r.invoiceId && (
                  <Button
                    href={`/review/${r.invoiceId}`}
                    variant="ghost"
                    className="mt-2 !py-1 !px-2.5 text-xs"
                  >
                    Review →
                  </Button>
                )}
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
