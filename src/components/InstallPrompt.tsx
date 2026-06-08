"use client";

import { useEffect, useState } from "react";
import { Smartphone, Share, MoreVertical } from "lucide-react";
import {
  initInstallCapture,
  getInstallState,
  subscribe,
  promptInstall,
} from "@/lib/pwaInstall";

// "Add to Home Screen" button for the mobile drawer. Always visible until the
// app is installed. Reads the globally-captured install event (see
// pwaInstall.ts) so a real one-tap install works even though this button mounts
// after the event has already fired.
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
  const [help, setHelp] = useState<null | "ios" | "generic">(null);

  useEffect(() => {
    initInstallCapture();
    return subscribe(() => force((n) => n + 1));
  }, []);

  const { canPrompt, installed } = getInstallState();
  if (installed) return null;

  const onClick = async () => {
    if (canPrompt) {
      await promptInstall();
      return;
    }
    setHelp(detectIOS() ? "ios" : "generic");
  };

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10"
      >
        <Smartphone className="h-4 w-4 shrink-0" />
        Add to Home Screen
      </button>

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
