"use client";

import { useEffect, useState } from "react";
import { useLinkFeed } from "@/components/overlay/LinkFeed";
import { DEFAULT_COLOR, OVERLAY_CARD_BG, OVERLAY_CHIP_BG } from "@/lib/colors";
import type { TopFeed } from "@/lib/top-board";
import { useOverlayText } from "@/components/overlay/OverlayLang";

/** Its own link sits in OBS all day: ask at the links' slow pace (every request costs on Vercel). */
const POLL_MS = 15_000;

/**
 * The top supporters bar (src/lib/top-board.ts). In the bars link the feed
 * rides on the link's one poll (src/components/overlay/LinkFeed.tsx); on its
 * own link it asks every 15 s. Hidden while off or nobody is ranked yet.
 */
export function TopOverlayClient({
  username,
  apiKey,
  color,
  via = null,
}: {
  username: string;
  apiKey: string;
  color: string | null;
  /** Inside the bars link (doesn't count as this bar's own link). */
  via?: "bars" | null;
}) {
  const [feed, setFeed] = useState<TopFeed | null>(null);
  const linkFeed = useLinkFeed();

  useEffect(() => {
    let active = true;
    if (via === "bars" && linkFeed) {
      return linkFeed.on("feeds", (f) => {
        if (active) setFeed((f as { top?: TopFeed | null } | null)?.top ?? null);
      });
    }
    async function poll() {
      if (document.hidden) return;
      try {
        const res = await fetch(`/api/overlay/${username}/top?key=${encodeURIComponent(apiKey)}`, { cache: "no-store" });
        if (res.ok && active) setFeed((await res.json()) as TopFeed | null);
      } catch {
        // try again next tick
      }
    }
    void poll();
    const iv = setInterval(poll, POLL_MS);
    return () => {
      active = false;
      clearInterval(iv);
    };
  }, [username, apiKey, via, linkFeed]);

  if (!feed || feed.items.length === 0) return null;
  return <TopView feed={feed} color={color} />;
}

/** The ranking card (the OBS link and the settings preview). */
export function TopView({ feed, color }: { feed: TopFeed; color: string | null }) {
  const tx = useOverlayText();
  const base = color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : DEFAULT_COLOR;
  return (
    <div className="p-3">
      <div
        className="mx-auto w-full max-w-[576px] rounded-2xl border-2 px-4 py-3 text-white"
        style={{ borderColor: base, background: OVERLAY_CARD_BG }}
      >
        <p className="text-lg font-extrabold">
          {tx.topTitle} <span className="text-sm font-semibold text-white/60">· {tx.range[feed.range]}</span>
        </p>
        <ol className="mt-2 space-y-1">
          {feed.items.map((s, i) => (
            <li key={`${i}-${s.name}`} className="flex items-center gap-3 text-[17px]">
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-black"
                style={{ background: i === 0 ? base : OVERLAY_CHIP_BG }}
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate font-bold">{s.name}</span>
              <span className="shrink-0 font-extrabold tabular-nums">฿{s.total.toLocaleString("th-TH")}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
