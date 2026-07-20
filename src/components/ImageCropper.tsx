"use client";

import { useCallback, useEffect, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { useTranslations } from "next-intl";

async function getCroppedBlob(src: string, area: Area): Promise<Blob> {
  const img = document.createElement("img");
  img.src = src;
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = rej;
  });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(area.width);
  canvas.height = Math.round(area.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas ctx");
  ctx.drawImage(
    img,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    area.width,
    area.height,
  );
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      0.9,
    ),
  );
}

export function ImageCropper({
  file,
  aspect,
  cropShape,
  onCancel,
  onCropped,
}: {
  file: File;
  aspect: number;
  cropShape: "round" | "rect";
  onCancel: () => void;
  onCropped: (blob: Blob) => void;
}) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [src, setSrc] = useState("");
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onComplete = useCallback((_: Area, px: Area) => setArea(px), []);

  async function save() {
    if (!area) return;
    setBusy(true);
    try {
      onCropped(await getCroppedBlob(src, area));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="card w-full max-w-md rounded-2xl p-4">
        <h3 className="mb-3 text-sm font-bold text-brand-900">
          {t("cropTitle")}
        </h3>
        <div className="relative h-64 w-full overflow-hidden rounded-xl bg-black/80">
          {src && (
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              cropShape={cropShape}
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onComplete}
            />
          )}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="text-sm text-brand-900/70">{t("zoom")}</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-brand-600"
          />
        </div>
        <div className="mt-4 flex gap-3">
          <button onClick={onCancel} className="btn-secondary flex-1">
            {tc("cancel")}
          </button>
          <button onClick={save} disabled={busy} className="btn-primary flex-1">
            {busy ? t("uploading") : tc("save")}
          </button>
        </div>
      </div>
    </div>
  );
}
