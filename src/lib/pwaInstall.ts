"use client";

// Global capture of the PWA install state. The `beforeinstallprompt` event
// fires once, early, and only on Chromium when the site is install-eligible —
// so we must listen as soon as possible and from a component that is always
// mounted (not one that appears late on a specific screen). This module stores
// the captured event so the install button can fire a real one-tap install
// whenever the user taps it.

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
let initialized = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function detectInstalled(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

// Attach the window listeners once. Safe to call from multiple components.
export function initInstallCapture(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  installed = detectInstalled();
  // Detection is sync but happens inside an effect, after the first render has
  // already read the (false) default. Notify subscribers so they re-read and
  // hide the install UI when we're already running standalone — otherwise, in a
  // standalone launch neither `beforeinstallprompt` nor `appinstalled` ever
  // fires, so nothing else would wake them and the banner stays stuck.
  if (installed) emit();

  window.addEventListener("beforeinstallprompt", (e: Event) => {
    e.preventDefault(); // suppress the mini-infobar; we drive our own button
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    deferred = null;
    emit();
  });
}

export function getInstallState(): { canPrompt: boolean; installed: boolean } {
  return { canPrompt: deferred !== null, installed };
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

// Fire the native install dialog. Returns false if no captured prompt exists.
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const choice = await deferred.userChoice;
  deferred = null;
  emit();
  return choice.outcome === "accepted";
}
