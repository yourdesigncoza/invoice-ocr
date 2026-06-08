"use client";

import { useEffect } from "react";
import { initInstallCapture } from "@/lib/pwaInstall";

// Mounted once in the root layout. Registers the PWA service worker and starts
// capturing the install event globally (both must happen early + reliably for
// one-tap install to work).
export default function ServiceWorkerRegister() {
  useEffect(() => {
    // Start listening for beforeinstallprompt ASAP, before any screen mounts.
    initInstallCapture();

    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return; // avoid caching during dev

    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        /* registration failure is non-fatal */
      });
    };

    // The component usually mounts AFTER `load` has already fired, so a bare
    // load listener would never run and the SW would never register (which is
    // what makes the site install-eligible). Handle both cases.
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register);
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
