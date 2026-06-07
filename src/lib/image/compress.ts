// On-device image downscale before upload (browser only).
//
// Two reasons this is required, not optional, for phone capture:
//  1. Vercel serverless functions reject request bodies > 4.5 MB — a raw phone
//     photo (3–8 MB) would fail to upload in production.
//  2. Uploading multi-MB photos over mobile data is slow.
//
// Caps the long side at 1568px (matches the server-side sharp preprocess) and
// re-encodes to JPEG. Respects EXIF orientation. Never throws — on any failure
// it returns the original file so the upload still proceeds.

const MAX_SIDE = 1568;
const QUALITY = 0.82;

export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file; // PDFs etc. pass through
  if (typeof document === "undefined" || typeof createImageBitmap === "undefined")
    return file;

  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    const longSide = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, MAX_SIDE / longSide);

    // already small enough and reasonably sized — don't re-encode (avoids
    // inflating an already-compressed gallery image)
    if (scale === 1 && file.size < 1_500_000) {
      bitmap.close?.();
      return file;
    }

    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITY),
    );
    if (!blob) return file;

    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file;
  }
}
