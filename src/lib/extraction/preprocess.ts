import sharp from "sharp";

/**
 * Image preprocessing before extraction (PRD §4.5). Pattern adapted from
 * bhimrazy/receipt-ocr (MIT): cap the long side and re-encode, which cuts
 * vision token cost + latency without hurting legibility.
 *
 * We cap the long side at 1568px — a ~1.15 MP budget that keeps thermal-slip
 * print legible without paying for resolution the model discards. (gpt-4o's
 * high-detail path fits the image to 2048² then scales the shortest side to
 * 768px and tiles at 512px, so very large uploads buy little.) Also
 * auto-orients via EXIF. The client now stores a higher-res original (≤2560px),
 * so this server downscale to 1568 is what actually governs the model input.
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
