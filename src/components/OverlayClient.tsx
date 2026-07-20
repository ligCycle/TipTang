"use client";

import { useEffect, useRef, useState } from "react";
import { formatBaht } from "@/lib/format";

type Alert = {
  id: string;
  name: string;
  amount: number;
  message: string | null;
};

export function OverlayClient({
  username,
  apiKey,
  test,
  soundUrl,
  imageUrl,
}: {
  username: string;
  apiKey: string;
  test: boolean;
  soundUrl: string | null;
  imageUrl: string | null;
}) {
  const [current, setCurrent] = useState<Alert | null>(null);
  const queue = useRef<Alert[]>([]);
  const seen = useRef<Set<string>>(new Set());
  const lastSeen = useRef<string>(new Date().toISOString());
  const showing = useRef(false);

  function pump() {
    if (showing.current) return;
    const next = queue.current.shift();
    if (!next) return;
    showing.current = true;
    setCurrent(next);
    if (soundUrl) {
      // OBS browser sources allow autoplay; normal browsers may block until a
      // user gesture (fine — the overlay runs inside OBS in real use).
      try {
        const audio = new Audio(soundUrl);
        audio.play().catch(() => {});
      } catch {
        // ignore
      }
    }
    setTimeout(() => {
      setCurrent(null);
      showing.current = false;
      setTimeout(pump, 600); // small gap before the next alert
    }, 7000);
  }

  function enqueue(a: Alert) {
    if (seen.current.has(a.id)) return;
    seen.current.add(a.id);
    queue.current.push(a);
    pump();
  }

  useEffect(() => {
    if (test) {
      enqueue({
        id: "test",
        name: "ผู้สนับสนุนตัวอย่าง",
        amount: 100,
        message: "ทดสอบ Donation Alert 🎉",
      });
    }
    if (!apiKey) return;

    let active = true;
    async function poll() {
      try {
        const res = await fetch(
          `/api/overlay/${username}?key=${encodeURIComponent(apiKey)}&after=${encodeURIComponent(lastSeen.current)}`,
        );
        if (!res.ok) return;
        const data = await res.json();
        for (const t of data.tips ?? []) {
          if (t.confirmedAt && t.confirmedAt > lastSeen.current) {
            lastSeen.current = t.confirmedAt;
          }
          enqueue({
            id: t.id,
            name: t.supporterName,
            amount: t.amount,
            message: t.message,
          });
        }
      } catch {
        // ignore transient network errors
      }
    }

    const iv = setInterval(() => {
      if (active) poll();
    }, 3000);
    return () => {
      active = false;
      clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-screen items-start justify-center p-6">
      {current && (
        <div
          key={current.id}
          className="alert-pop w-full max-w-md rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 p-5 text-white shadow-2xl ring-1 ring-white/20"
        >
          {imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt=""
              className="mx-auto mb-3 max-h-40 w-auto rounded-xl object-contain"
            />
          )}
          <div className="flex items-center justify-between gap-3">
            <span className="text-lg font-extrabold drop-shadow">
              💸 {current.name || "ผู้ไม่ประสงค์ออกนาม"}
            </span>
            <span className="rounded-full bg-white/25 px-3 py-1 text-lg font-black">
              {formatBaht(current.amount)}
            </span>
          </div>
          {current.message && (
            <p className="mt-2 text-white/95">{current.message}</p>
          )}
        </div>
      )}
    </div>
  );
}
