import sharp from "sharp";

/**
 * Image preprocessing before extraction (PRD §4.5). Pattern adapted from
 * bhimrazy/receipt-ocr (MIT): cap the long side and re-encode, which cuts
 * vision token cost + latency without hurting legibility.
 *
 * We cap at 1568px — OpenAI's high-detail tile size — rather than a smaller
 * value, because thermal till slips have tiny print that downscaling too far
 * would destroy. Also auto-orients via EXIF. The ORIGINAL upload is never
 * mutated; this produces the `processed_file_path` companion.
 */
export const MAX_SIDE = 1568;
const JPEG_QUALITY = 85;

export interface Preprocessed {
  data: Buffer;
  mimeType: string;
  resized: boolean;
  width: number | null;
  height: number | null;
}

export async function preprocessImage(
  data: Buffer,
  mimeType: string,
): Promise<Preprocessed> {
  // PDFs need page rasterisation first (TODO) — pass through untouched.
  if (mimeType === "application/pdf") {
    return { data, mimeType, resized: false, width: null, height: null };
  }
  try {
    const meta = await sharp(data, { failOn: "none" }).metadata();
    const longSide = Math.max(meta.width ?? 0, meta.height ?? 0);
    // Already within the cap — don't re-encode (that can inflate an already
    // well-compressed photo). Extract straight from the original.
    if (longSide > 0 && longSide <= MAX_SIDE) {
      return { data, mimeType, resized: false, width: meta.width ?? null, height: meta.height ?? null };
    }
    const out = await sharp(data, { failOn: "none" })
      .rotate() // EXIF auto-orient
      .resize(MAX_SIDE, MAX_SIDE, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer({ resolveWithObject: true });
    return {
      data: out.data,
      mimeType: "image/jpeg",
      resized: true,
      width: out.info.width,
      height: out.info.height,
    };
  } catch {
    // Never block extraction on a preprocessing failure — use the original.
    return { data, mimeType, resized: false, width: null, height: null };
  }
}
