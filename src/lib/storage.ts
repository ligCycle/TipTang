import "server-only";
import { createClient } from "@supabase/supabase-js";
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.SUPABASE_BUCKET || "uploads";

// Default to Supabase when configured; fall back to local disk for offline dev.
const DRIVER =
  process.env.STORAGE_DRIVER || (SUPABASE_URL ? "supabase" : "local");

const LOCAL_DIR = path.join(process.cwd(), ".uploads");

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
// Alert images may be animated GIFs too.
export const ALLOWED_ALERT_IMAGE_TYPES = [...ALLOWED_IMAGE_TYPES, "image/gif"];
export const ALLOWED_AUDIO_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/webm",
];
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_AUDIO_BYTES = 2 * 1024 * 1024; // 2 MB

function extFor(file: File): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/ogg": "ogg",
    "audio/webm": "weba",
  };
  return map[file.type] ?? "bin";
}

/**
 * Persist an uploaded file and return a public URL.
 * - driver "supabase": uploads to a public bucket, returns the public URL.
 * - driver "local": writes outside /public and serves via /api/uploads/[file]
 *   (avoids the public/ webpack-cache 404 gotcha and Vercel cold-start loss).
 */
export async function uploadImage(
  file: File,
  folder = "slips",
): Promise<string> {
  const filename = `${randomUUID()}.${extFor(file)}`;
  const key = `${folder}/${filename}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  if (DRIVER === "supabase") {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      throw new Error(
        "Supabase storage is not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).",
      );
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false },
    });
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(key, bytes, { contentType: file.type, upsert: false });
    if (error) throw new Error(`Supabase upload failed: ${error.message}`);

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(key);
    return data.publicUrl;
  }

  // local driver
  const dir = path.join(LOCAL_DIR, folder);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, filename), bytes);
  return `/api/uploads/${folder}/${filename}`;
}

/** Read a locally-stored file (used by the /api/uploads route). */
export async function readLocalUpload(segments: string[]) {
  // Prevent path traversal.
  const safe = segments.filter((s) => s && s !== "." && s !== "..");
  const filePath = path.join(LOCAL_DIR, ...safe);
  if (!filePath.startsWith(LOCAL_DIR)) throw new Error("Invalid path");
  return fs.readFile(filePath);
}
