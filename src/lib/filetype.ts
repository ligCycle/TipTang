/**
 * Check an upload's real bytes against the MIME type the browser declared.
 * `File.type` comes from the client and is trivially faked; the first few
 * bytes of every format we accept are fixed, so a file only passes if it
 * actually is what it claims to be.
 */

function startsWith(b: Uint8Array, sig: number[], offset = 0): boolean {
  if (b.length < offset + sig.length) return false;
  return sig.every((v, i) => b[offset + i] === v);
}

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

const RIFF = ascii("RIFF");
const EBML = [0x1a, 0x45, 0xdf, 0xa3]; // Matroska / WebM

const CHECKS: Record<string, (b: Uint8Array) => boolean> = {
  "image/jpeg": (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  "image/png": (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  "image/gif": (b) => startsWith(b, ascii("GIF87a")) || startsWith(b, ascii("GIF89a")),
  "image/webp": (b) => startsWith(b, RIFF) && startsWith(b, ascii("WEBP"), 8),
  // MP3: an ID3 tag, or straight into an MPEG audio frame (11 sync bits).
  "audio/mpeg": (b) =>
    startsWith(b, ascii("ID3")) || (b.length > 1 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0),
  "audio/wav": (b) => startsWith(b, RIFF) && startsWith(b, ascii("WAVE"), 8),
  "audio/ogg": (b) => startsWith(b, ascii("OggS")),
  "audio/webm": (b) => startsWith(b, EBML),
  "video/webm": (b) => startsWith(b, EBML),
  // MP4 / ISO BMFF: a box size, then "ftyp".
  "video/mp4": (b) => startsWith(b, ascii("ftyp"), 4),
};
CHECKS["audio/mp3"] = CHECKS["audio/mpeg"];
CHECKS["audio/x-wav"] = CHECKS["audio/wav"];

/** True when `bytes` look like `declaredType`. Unknown types never pass. */
export function bytesMatchType(declaredType: string, bytes: Uint8Array): boolean {
  const check = CHECKS[declaredType];
  return check ? check(bytes) : false;
}

/** Reads just the header of `file` (never the whole upload). */
export async function fileMatchesType(file: File): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  return bytesMatchType(file.type, head);
}
