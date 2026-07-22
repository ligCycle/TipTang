"use client";

import { useEffect, useRef, useState } from "react";
import { formatBaht } from "@/lib/format";
import { isAlertStyle, DEFAULT_ALERT_STYLE } from "@/lib/alertStyles";

type Alert = {
  id: string;
  name: string;
  amount: number;
  message: string | null;
};

// Darken a #rrggbb color by mixing toward black (amount 0..1).
function darken(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * (1 - amount));
  const g = Math.round(((n >> 8) & 255) * (1 - amount));
  const b = Math.round((n & 255) * (1 - amount));
  return `rgb(${r}, ${g}, ${b})`;
}

export function OverlayClient({
  username,
  apiKey,
  test,
  soundUrl,
  imageUrl,
  videoUrl,
  color,
  ttsEnabled,
  librarySounds,
  libraryStickers,
  alertStyle,
}: {
  username: string;
  apiKey: string;
  test: boolean;
  soundUrl: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  color: string | null;
  ttsEnabled: boolean;
  librarySounds: string[];
  libraryStickers: string[];
  alertStyle: string;
}) {
  const [current, setCurrent] = useState<Alert | null>(null);
  // Sticker shown with the current alert (randomised per alert from the library).
  const [sticker, setSticker] = useState<string | null>(null);
  const queue = useRef<Alert[]>([]);
  const seen = useRef<Set<string>>(new Set());
  const lastSeen = useRef<string>(new Date().toISOString());
  const showing = useRef(false);

  function pickRandom(arr: string[]): string | null {
    return arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;
  }

  // Sequentially preload library assets so a randomly-picked one plays instantly
  // (one at a time to avoid a network/RAM spike when OBS opens the overlay).
  useEffect(() => {
    const items = [
      ...libraryStickers.map((u) => ({ u, img: true })),
      ...librarySounds.map((u) => ({ u, img: false })),
    ];
    let i = 0;
    let cancelled = false;
    function loadNext() {
      if (cancelled || i >= items.length) return;
      const { u, img } = items[i++];
      if (img) {
        const el = new Image();
        el.onload = el.onerror = loadNext;
        el.src = u;
      } else {
        const a = new Audio();
        a.preload = "auto";
        a.oncanplaythrough = a.onerror = loadNext;
        a.src = u;
        a.load();
      }
    }
    loadNext();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Read the supporter's name + amount + message aloud via the TTS proxy.
  function speak(a: Alert) {
    if (!ttsEnabled) return;
    const parts = [a.name || "ผู้ไม่ประสงค์ออกนาม", "ทิป", String(a.amount), "บาท"];
    if (a.message) parts.push(a.message);
    const text = parts.join(" ").slice(0, 200);
    try {
      const tts = new Audio(`/api/tts?lang=th&text=${encodeURIComponent(text)}`);
      tts.play().catch(() => {});
    } catch {
      // ignore
    }
  }

  function pump() {
    if (showing.current) return;
    const next = queue.current.shift();
    if (!next) return;
    showing.current = true;
    setCurrent(next);
    // Random pick from the library each alert; fall back to the single asset.
    const chosenSound = pickRandom(librarySounds) ?? soundUrl;
    const chosenSticker = pickRandom(libraryStickers) ?? imageUrl;
    setSticker(videoUrl ? null : chosenSticker);
    // Video carries its own audio; only play the separate sound / TTS when no
    // video. TTS follows the alert sound so they don't overlap.
    if (chosenSound && !videoUrl) {
      // OBS browser sources allow autoplay; normal browsers may block until a
      // user gesture (fine — the overlay runs inside OBS in real use).
      try {
        const audio = new Audio(chosenSound);
        if (ttsEnabled) {
          audio.addEventListener("ended", () => speak(next), { once: true });
        }
        audio.play().catch(() => {
          if (ttsEnabled) speak(next);
        });
      } catch {
        if (ttsEnabled) speak(next);
      }
    } else if (!videoUrl) {
      speak(next);
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

  const useCustom = Boolean(color && /^#[0-9a-fA-F]{6}$/.test(color));
  const cardStyle = useCustom
    ? {
        backgroundImage: `linear-gradient(to bottom right, ${color}, ${darken(
          color!,
          0.3,
        )})`,
      }
    : undefined;

  return (
    <div className="flex min-h-screen items-start justify-center p-6">
      {current && (
        <div
          key={current.id}
          style={cardStyle}
          className={`alert-${
            isAlertStyle(alertStyle) ? alertStyle : DEFAULT_ALERT_STYLE
          } w-full max-w-md rounded-2xl p-5 text-white shadow-2xl ring-1 ring-white/20 ${
            useCustom ? "" : "bg-gradient-to-br from-brand-500 to-brand-700"
          }`}
        >
          {videoUrl ? (
            <video
              src={videoUrl}
              autoPlay
              playsInline
              className="mx-auto mb-3 max-h-48 w-auto rounded-xl"
            />
          ) : (
            sticker && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={sticker}
                alt=""
                className="mx-auto mb-3 max-h-40 w-auto rounded-xl object-contain"
              />
            )
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
