/**
 * /learning — uploads.
 *
 * Four things go wrong with a photo taken on a phone, and all four of them
 * fail silently, which is the worst possible way for them to fail when the
 * person uploading is eleven:
 *
 *   1. iOS hands you a HEIC that nothing on the receiving end can display.
 *   2. A modern phone camera produces an 8 MB file.
 *   3. The image is sideways, because orientation lives in EXIF.
 *   4. The EXIF also contains the GPS coordinates of the house.
 *
 * The primary fix for all four is client-side: the upload form draws the
 * picture onto a canvas and exports a resized JPEG, which cannot carry EXIF at
 * all. This module is the server half — it assumes nothing about what the
 * client did, sniffs the bytes itself, and strips EXIF again from anything
 * that still has it.
 */

export const MAX_BYTES = 8 * 1024 * 1024;

const MAGIC: Array<[string, number[], string]> = [
  ['image/jpeg', [0xff, 0xd8, 0xff], 'jpg'],
  ['image/png', [0x89, 0x50, 0x4e, 0x47], 'png'],
  ['image/gif', [0x47, 0x49, 0x46, 0x38], 'gif'],
  ['application/pdf', [0x25, 0x50, 0x44, 0x46], 'pdf'],
];

export interface Sniffed {
  mime: string;
  ext: string;
}

/**
 * Determine the type from the bytes. The browser's Content-Type is a claim by
 * the client and is never used, because an upload form on a device the boy
 * controls is precisely where a wrong claim would come from.
 */
export function sniff(bytes: Uint8Array): Sniffed | null {
  for (const [mime, sig, ext] of MAGIC) {
    if (sig.every((b, i) => bytes[i] === b)) return { mime, ext };
  }
  // RIFF....WEBP
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return { mime: 'image/webp', ext: 'webp' };
  }
  // ....ftypheic / ftypheix / ftypmif1 — recognised only so the error message
  // can say something useful instead of "unsupported file".
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (['heic', 'heix', 'hevc', 'mif1', 'msf1'].includes(brand)) return { mime: 'image/heic', ext: 'heic' };
  }
  return null;
}

/**
 * Remove every APP1 (EXIF/XMP) segment from a JPEG.
 *
 * Only APP1 is removed: APP0 carries the JFIF density and APP14 carries the
 * Adobe colour transform, and dropping either can change how the picture
 * renders. Non-JPEG input is returned untouched.
 */
export function stripJpegExif(bytes: Uint8Array): Uint8Array {
  if (!(bytes[0] === 0xff && bytes[1] === 0xd8)) return bytes;

  const keep: Array<[number, number]> = [[0, 2]];
  let i = 2;
  while (i + 3 < bytes.length) {
    if (bytes[i] !== 0xff) break;
    const marker = bytes[i + 1];
    // Start of scan: the rest is entropy-coded data, copy it verbatim.
    if (marker === 0xda) {
      keep.push([i, bytes.length]);
      break;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
      keep.push([i, i + 2]);
      i += 2;
      continue;
    }
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (len < 2) break;
    if (marker !== 0xe1) keep.push([i, i + 2 + len]);
    i += 2 + len;
  }

  const size = keep.reduce((n, [a, b]) => n + (b - a), 0);
  if (size === bytes.length) return bytes;
  const out = new Uint8Array(size);
  let o = 0;
  for (const [a, b] of keep) {
    out.set(bytes.subarray(a, b), o);
    o += b - a;
  }
  return out;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * R2 keys are dated and grouped by evening, so that the bucket is browsable
 * and an export is a directory walk rather than a join.
 *
 *   entries/2026-09-26/<entry-id>/<upload-id>.jpg
 */
export function r2Key(onDate: string, entryId: string, uploadId: string, ext: string): string {
  return `entries/${onDate}/${entryId}/${uploadId}.${ext}`;
}

export const UPLOAD_KINDS = [
  'sheet_photo',
  'notebook_photo',
  'typing_screenshot',
  'folder_screenshot',
  'file',
  'other',
] as const;

export type UploadKind = (typeof UPLOAD_KINDS)[number];

export function isUploadKind(v: unknown): v is UploadKind {
  return typeof v === 'string' && (UPLOAD_KINDS as readonly string[]).includes(v);
}
