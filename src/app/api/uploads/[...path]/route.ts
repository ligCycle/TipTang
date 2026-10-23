import { NextResponse } from "next/server";
import { readLocalUpload } from "@/lib/storage";

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  weba: "audio/webm",
  m4a: "audio/mp4",
  mp4: "video/mp4",
  webm: "video/webm",
};

// Serves files stored by the "local" storage driver (dev only).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  // Local storage is for development only: never serve stored files
  // (slips, voice messages) from a production build.
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const { path } = await params;
  try {
    const file = await readLocalUpload(path);
    const ext = path[path.length - 1]?.split(".").pop()?.toLowerCase() ?? "";
    const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
