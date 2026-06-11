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

// Once the user installs or dismisses the banner we remember it here so the
// prompt never nags again — even when they later open the installed app in a
// plain browser tab, where `display-mode: standalone` reads false.
const DISMISS_KEY = "spendsilo-install-dismissed";

export interface InstallState {
  canPrompt: boolean;
  installed: boolean;
  dismissed: boolean;
}

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
let dismissed = false;
let initialized = false;
const listeners = new Set<() => void>();

// Cached snapshot for useSyncExternalStore — it must receive a referentially
// stable value between state changes (returning a fresh object each read would
// loop forever). Rebuilt only inside emit(), i.e. only when state changes.
let snapshot: InstallState = { canPrompt: false, installed: false, dismissed: false };

function emit() {
  snapshot = { canPrompt: deferred !== null, installed, dismissed };
  listeners.forEach((l) => l());
}

function detectInstalled(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function readDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function persistDismissed(): void {
  dismissed = true;
  try {
    window.localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* storage unavailable (private mode) — in-memory flag still hides it */
  }
}

// Attach the window listeners once. Safe to call from multiple components.
export function initInstallCapture(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  installed = detectInstalled();
  dismissed = readDismissed();

  window.addEventListener("beforeinstallprompt", (e: Event) => {
    e.preventDefault(); // suppress the mini-infobar; we drive our own button
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    deferred = null;
    persistDismissed(); // never re-prompt, even in a later browser-tab visit
    emit();
  });

  // Publish the post-detection snapshot. useSyncExternalStore re-reads after
  // subscribe and re-renders if this differs from the initial defaults — so the
  // banner hides when already standalone/dismissed and appears otherwise,
  // without a manual force-render. (In a standalone launch neither
  // `beforeinstallprompt` nor `appinstalled` fires, so this is the only signal.)
  emit();
}

export function getInstallState(): InstallState {
  return snapshot;
}

// Server + first-hydration snapshot: render the banner hidden so it never ships
// in SSR HTML (no flash for already-dismissed users). Constant ref, as required.
const SERVER_STATE: InstallState = { canPrompt: false, installed: false, dismissed: true };
export function getServerInstallState(): InstallState {
  return SERVER_STATE;
}

// User tapped the banner's X — remember it permanently so we stop nagging.
export function dismissInstall(): void {
  persistDismissed();
  emit();
}

export function subscribe(fn: () => void): () => void {
  initInstallCapture(); // idempotent — ensures listeners + the initial snapshot
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
  if (choice.outcome === "accepted") persistDismissed(); // don't nag post-install
  emit();
  return choice.outcome === "accepted";
}
