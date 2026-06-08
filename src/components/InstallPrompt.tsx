"use client";

import { useEffect, useState } from "react";
import { Smartphone, Share, MoreVertical, X } from "lucide-react";
import {
  initInstallCapture,
  getInstallState,
  subscribe,
  promptInstall,
} from "@/lib/pwaInstall";

// Persistent floating "Add to Home Screen" banner, pinned to the bottom on
// mobile only (md:hidden). Mounted once from the app layout, so it survives
// client-side navigation; the X hides it for the current load. Reads the
// globally-captured install event (see pwaInstall.ts) so a real one-tap install
// works even though this mounts after the event has already fired.
//   - captured prompt available (Chromium) → fire the native install dialog;
//   - iOS Safari → Share → Add to Home Screen steps;
//   - otherwise → generic "use the browser menu" steps.
function detectIOS(): boolean {
  const ua = window.navigator.userAgent.toLowerCase();
  return (
    /iphone|ipad|ipod/.test(ua) ||
    (ua.includes("macintosh") && navigator.maxTouchPoints > 1)
  );
}

export default function InstallPrompt() {
  const [, force] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [help, setHelp] = useState<null | "ios" | "generic">(null);

  useEffect(() => {
    initInstallCapture();
    return subscribe(() => force((n) => n + 1));
  }, []);

  const { canPrompt, installed } = getInstallState();
  if (installed || dismissed) return null;

  const onClick = async () => {
    if (canPrompt) {
      await promptInstall();
      return;
    }
    setHelp(detectIOS() ? "ios" : "generic");
  };

  return (
    <>
      <div className="md:hidden fixed inset-x-0 bottom-0 z-40 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-md items-center gap-3 rounded-xl border border-white/10 bg-sidebar px-3.5 py-2.5 shadow-lg">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-brand-yellow">
            <Smartphone className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium leading-tight text-white">
              Install SpendSilo
            </p>
            <p className="text-xs leading-tight text-slate-400">
              Add it to your home screen for one-tap access
            </p>
          </div>
          <button
            type="button"
            onClick={onClick}
            className="shrink-0 rounded-lg bg-brand-yellow px-3 py-1.5 text-sm font-semibold text-sidebar hover:bg-brand-yellow/90"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
            className="shrink-0 -mr-1 p-1 text-slate-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {help && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-4 sm:items-center"
          onClick={() => setHelp(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-surface p-5 text-foreground shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 text-base font-semibold">
              Add SpendSilo to your phone
            </h2>
            {help === "ios" ? (
              <ol className="mb-4 list-decimal space-y-2 pl-5 text-sm text-muted">
                <li>
                  Tap the <strong className="text-foreground">Share</strong> button{" "}
                  <Share className="inline h-3.5 w-3.5 align-text-bottom" /> at the
                  bottom of Safari.
                </li>
                <li>
                  Scroll down and tap{" "}
                  <strong className="text-foreground">Add to Home Screen</strong>.
                </li>
                <li>
                  Tap <strong className="text-foreground">Add</strong> — the icon
                  appears on your home screen.
                </li>
              </ol>
            ) : (
              <ol className="mb-4 list-decimal space-y-2 pl-5 text-sm text-muted">
                <li>
                  Open the browser menu{" "}
                  <MoreVertical className="inline h-3.5 w-3.5 align-text-bottom" />{" "}
                  (top-right in Chrome).
                </li>
                <li>
                  Tap <strong className="text-foreground">Install app</strong> or{" "}
                  <strong className="text-foreground">Add to Home screen</strong>.
                </li>
                <li>Confirm — the SpendSilo icon appears on your home screen.</li>
              </ol>
            )}
            <button
              type="button"
              className="w-full rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-700"
              onClick={() => setHelp(null)}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
