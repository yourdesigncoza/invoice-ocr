"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  UploadCloud,
  FileX2,
  Loader2,
  Camera,
  FolderOpen,
} from "lucide-react";
import { Card } from "@/components/ui";
import { useUploadNotifications } from "@/components/UploadNotifications";
import { compressImage } from "@/lib/image/compress";
import { cn } from "@/lib/utils";
import type { Project } from "@/lib/types";

interface UploadResult {
  id: string | null;
  fileName: string;
  ok: boolean;
  error?: string;
}

// Mirror the server's ACCEPTED list; HEIC etc. fall through compression as
// their original type and get caught here instead of failing in the background.
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
// Below the 4.5 MB Vercel serverless body limit, with margin.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export function UploadClient({ projects = [] }: { projects?: Project[] }) {
  const router = useRouter();
  const notify = useUploadNotifications();
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [errors, setErrors] = useState<{ fileName: string; error?: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;
      setBusy(true);
      setErrors([]);
      try {
        // shrink phone photos on-device before upload (Vercel body limit +
        // faster on mobile data); PDFs/small images pass through unchanged
        const prepared = await Promise.all(list.map(compressImage));

        // Guard before we hit the network: a format we can't process (e.g. an
        // un-compressible HEIC that fell through) or a file still over the
        // Vercel 4.5 MB body limit would otherwise fail with an opaque error.
        const clientRejects: { fileName: string; error?: string }[] = [];
        const sendable = prepared.filter((f) => {
          if (!ACCEPTED_TYPES.includes(f.type)) {
            clientRejects.push({ fileName: f.name, error: `Unsupported format (${f.type || "unknown"}). Use JPG, PNG, WEBP, or PDF.` });
            return false;
          }
          if (f.size > MAX_UPLOAD_BYTES) {
            clientRejects.push({ fileName: f.name, error: "File is too large (over 4 MB). Try a clearer photo, not a high-res scan." });
            return false;
          }
          return true;
        });
        if (sendable.length === 0) {
          setErrors(clientRejects);
          return;
        }

        const form = new FormData();
        sendable.forEach((f) => form.append("files", f));
        if (projectId) form.append("projectId", projectId);

        // returns fast: files are stored + queued, extraction runs in the
        // background. We register the jobs for toast tracking and head to the
        // dashboard rather than blocking on the vision call.
        const res = await fetch("/api/extract", { method: "POST", body: form });
        const json = await res.json();
        if (!res.ok) {
          setErrors([...clientRejects, { fileName: "Upload failed", error: json.error }]);
          return;
        }
        const uploads: UploadResult[] = json.uploads ?? [];
        const failed = uploads.filter((u) => !u.ok);
        const ok = uploads.filter((u) => u.ok);

        notify.startJobs(ok);

        // Only leave the page clean if nothing was rejected anywhere; otherwise
        // stay so the user can see which files need another try.
        if (ok.length && !failed.length && !clientRejects.length) {
          router.push("/dashboard");
          return;
        }
        const serverFailed = failed.map((f) => ({ fileName: f.fileName, error: f.error }));
        if (clientRejects.length || serverFailed.length)
          setErrors([...clientRejects, ...serverFailed]);
      } catch (e) {
        setErrors([{ fileName: "Upload error", error: String(e) }]);
      } finally {
        setBusy(false);
      }
    },
    [router, notify, projectId],
  );

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

      {/* site assignment — only when the user runs multiple sites */}
      {projects.length > 0 && (
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">
            Assign this batch to a site
          </label>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            disabled={busy}
            className="w-full max-w-xs rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-50"
          >
            <option value="">No site</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

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

      {/* upload progress — visible on every screen size (the heavy extraction
          continues in the background; we redirect to the dashboard once queued) */}
      {busy && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          Uploading & queuing for extraction…
        </div>
      )}

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
              {busy ? "Queuing…" : "Drag & drop invoices here"}
            </p>
            <p className="text-xs text-muted mt-0.5">
              JPG, PNG, WEBP, or PDF · single or batch · photos shrink before upload
            </p>
          </div>
        </div>
      </Card>

      {errors.length > 0 && (
        <Card className="divide-y divide-border">
          {errors.map((e, i) => (
            <div key={i} className="flex items-start gap-3 p-4">
              <FileX2 className="h-5 w-5 text-status-low shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{e.fileName}</div>
                {e.error && (
                  <p className="text-xs text-status-low mt-1">{e.error}</p>
                )}
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
