"use client";

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, CheckCircle2, XCircle, X, Copy } from "lucide-react";

type JobStatus = "processing" | "done" | "failed";

interface Job {
  id: string;
  fileName: string;
  status: JobStatus;
  invoiceId?: string;
  duplicate?: boolean;
}

interface UploadResult {
  id: string | null;
  fileName: string;
  ok: boolean;
  error?: string;
}

interface StatusRow {
  id: string;
  file_name: string;
  upload_status: JobStatus;
  invoice_id: string | null;
  duplicate?: boolean;
}

interface Ctx {
  /** Register freshly-submitted uploads to watch until they finish. */
  startJobs: (uploads: UploadResult[]) => void;
}

const UploadCtx = createContext<Ctx | null>(null);

export function useUploadNotifications() {
  const ctx = useContext(UploadCtx);
  if (!ctx)
    throw new Error("useUploadNotifications must be used within provider");
  return ctx;
}

const POLL_MS = 3000;

export function UploadNotificationsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const jobsRef = useRef<Job[]>(jobs);
  jobsRef.current = jobs;

  const startJobs = useCallback((uploads: UploadResult[]) => {
    const fresh = uploads
      .filter((u) => u.ok && u.id)
      .map<Job>((u) => ({ id: u.id as string, fileName: u.fileName, status: "processing" }));
    if (fresh.length)
      setJobs((prev) => {
        const have = new Set(prev.map((p) => p.id));
        return [...prev, ...fresh.filter((f) => !have.has(f.id))];
      });
  }, []);

  // on mount, re-discover any uploads still processing from a previous session
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/uploads/status");
        if (!res.ok) return;
        const { uploads } = (await res.json()) as { uploads: StatusRow[] };
        if (cancelled || !uploads?.length) return;
        setJobs((prev) => {
          const have = new Set(prev.map((p) => p.id));
          const add = uploads
            .filter((u) => !have.has(u.id))
            .map<Job>((u) => ({ id: u.id, fileName: u.file_name, status: "processing" }));
          return add.length ? [...prev, ...add] : prev;
        });
      } catch {
        /* offline / transient — next poll retries */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // poll for transitions while any job is processing
  useEffect(() => {
    const tick = async () => {
      const active = jobsRef.current.filter((j) => j.status === "processing");
      if (!active.length) return;
      try {
        const res = await fetch(
          `/api/uploads/status?ids=${active.map((j) => j.id).join(",")}`,
        );
        if (!res.ok) return;
        const { uploads } = (await res.json()) as { uploads: StatusRow[] };
        let changed = false;
        const next = jobsRef.current.map((j) => {
          if (j.status !== "processing") return j;
          const u = uploads.find((x) => x.id === j.id);
          if (u && u.upload_status !== "processing") {
            changed = true;
            return {
              ...j,
              status: u.upload_status,
              invoiceId: u.invoice_id ?? undefined,
              duplicate: u.duplicate,
            };
          }
          return j;
        });
        if (changed) {
          setJobs(next);
          router.refresh(); // revalidate server lists so the new invoice appears
        }
      } catch {
        /* transient */
      }
    };
    const interval = setInterval(tick, POLL_MS);
    return () => clearInterval(interval);
  }, [router]);

  const dismiss = (id: string) =>
    setJobs((prev) => prev.filter((j) => j.id !== id));

  // batch CTA: with several documents ready, drop the user into the first one —
  // approve→next on the review screen then flows through the rest
  const ready = jobs.filter((j) => j.status === "done" && j.invoiceId);
  const dismissReady = () =>
    setJobs((prev) => prev.filter((j) => !(j.status === "done" && j.invoiceId)));

  return (
    <UploadCtx.Provider value={{ startJobs }}>
      {children}
      {jobs.length > 0 && (
        <div className="fixed bottom-4 right-4 z-[60] w-80 max-w-[calc(100vw-2rem)] space-y-2">
          {ready.length >= 2 && (
            <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-blue-50 px-3 py-2.5 shadow-lg">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1 text-sm font-medium">
                {ready.length} invoices ready for review
              </div>
              <Link
                href={`/review/${ready[0].invoiceId}`}
                onClick={dismissReady}
                className="shrink-0 text-sm font-semibold text-primary hover:underline"
              >
                Start reviewing →
              </Link>
            </div>
          )}
          {jobs.map((job) => (
            <div
              key={job.id}
              className="flex items-start gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 shadow-lg"
            >
              {job.status === "processing" && (
                <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary mt-0.5" />
              )}
              {job.status === "done" && job.duplicate && (
                <Copy className="h-5 w-5 shrink-0 text-status-duplicate mt-0.5" />
              )}
              {job.status === "done" && !job.duplicate && (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-status-approved mt-0.5" />
              )}
              {job.status === "failed" && (
                <XCircle className="h-5 w-5 shrink-0 text-status-low mt-0.5" />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{job.fileName}</div>
                <div className="text-xs text-muted">
                  {job.status === "processing" && "Processing…"}
                  {job.status === "done" &&
                    (job.duplicate ? "Done — possible duplicate" : "Done processing")}
                  {job.status === "failed" && "Extraction failed"}
                </div>
                {job.status === "done" && job.invoiceId && (
                  <Link
                    href={`/review/${job.invoiceId}`}
                    onClick={() => dismiss(job.id)}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Review now →
                  </Link>
                )}
              </div>
              {job.status !== "processing" && (
                <button
                  type="button"
                  aria-label="Dismiss"
                  onClick={() => dismiss(job.id)}
                  className="shrink-0 text-muted hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </UploadCtx.Provider>
  );
}
