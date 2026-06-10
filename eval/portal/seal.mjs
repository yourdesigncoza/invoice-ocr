// Build the ENCRYPTED, online-deployable verification portal.
//
//   node eval/portal/seal.mjs --passcode "your-passphrase" [--model gpt-4o]
//
// Passcode resolution (first hit wins): --passcode flag → PORTAL_PASSCODE in the
// shell env → PORTAL_PASSCODE in the project's .env.local → a random one is
// generated and printed. Set PORTAL_PASSCODE in .env.local for reproducible
// re-seals without exporting it in every shell.
//
// Reads captured.json + manifest.json + images/ (produced by build.py), bundles
// EVERYTHING — the OCR data AND the receipt images (base64) — into one JSON
// payload, AES-256-GCM encrypts it with a key derived from your passcode
// (PBKDF2-SHA256, 210k iters), and writes a single self-contained
// index-deploy.html. The deployed file is just ciphertext: no loose image URLs,
// nothing readable without the passcode. Decryption happens client-side via
// WebCrypto when the helper enters the passcode.
//
// Deploy index-deploy.html (renamed index.html) as a static site. Share the URL
// + passcode out-of-band. Strong passphrase = real protection; weak = brute-forceable.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, pbkdf2Sync, createCipheriv } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const ITER = 210000;
const DOC_TYPES = ["Tax Invoice", "Receipt", "Cash Sale", "Purchase Notice",
  "Prepaid Electricity", "Statement", "Unknown", "Not Invoice"];

function arg(name, def) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const MIME = { ".jpeg": "image/jpeg", ".jpg": "image/jpeg", ".png": "image/png" };

// Read a single key from the project's .env.local (../../ from this dir), where
// the app keeps its other secrets. No dependency — a tiny KEY=VALUE parse.
function envLocal(key) {
  try {
    const txt = readFileSync(join(HERE, "..", "..", ".env.local"), "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m && m[1] === key) return m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch { /* no .env.local — fall through to generated */ }
  return "";
}

let passcode = arg("passcode", process.env.PORTAL_PASSCODE || envLocal("PORTAL_PASSCODE") || "");
let generated = false;
if (!passcode) {
  // readable-ish strong passphrase: 4 random 4-char chunks
  passcode = Array.from({ length: 4 }, () =>
    randomBytes(3).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 4)
  ).join("-");
  generated = true;
}
const model = arg("model", "gpt-4o");
const out = arg("out", join(HERE, "index-deploy.html"));

const records = JSON.parse(readFileSync(join(HERE, "captured.json"), "utf8"));
let bundled = 0;
for (const r of records) {
  try {
    const b64 = readFileSync(join(HERE, "images", r.file)).toString("base64");
    r.img = `data:${MIME[extname(r.file).toLowerCase()] || "image/jpeg"};base64,${b64}`;
    bundled++;
  } catch (e) {
    console.warn("⚠ missing image for", r.num, r.file);
  }
}

const payload = JSON.stringify({ model, docTypes: DOC_TYPES, records });

const salt = randomBytes(16);
const iv = randomBytes(12);
const key = pbkdf2Sync(passcode, salt, ITER, 32, "sha256");
const cipher = createCipheriv("aes-256-gcm", key, iv);
const ct = Buffer.concat([cipher.update(payload, "utf8"), cipher.final(), cipher.getAuthTag()]); // ct||tag for WebCrypto
const enc = {
  salt: salt.toString("base64"),
  iv: iv.toString("base64"),
  ct: ct.toString("base64"),
  iter: ITER,
};

const template = readFileSync(join(HERE, "template.html"), "utf8");
const bootstrap = `window.__ENC__=${JSON.stringify(enc)}; showLock();`;
const html = template.replace("/*__BOOTSTRAP__*/", bootstrap);
writeFileSync(out, html);

const mb = (Buffer.byteLength(html) / 1048576).toFixed(1);
console.log(`Sealed ${bundled}/${records.length} images. ${mb} MB → ${out}`);
if (generated) {
  console.log(`\n  PASSCODE (save this — needed to open the portal):\n\n      ${passcode}\n`);
  console.log("  Re-run with --passcode \"...\" to set your own.");
}
