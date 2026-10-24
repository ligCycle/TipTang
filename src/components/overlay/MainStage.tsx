"use client";

import { useEffect, useState, type ComponentProps } from "react";
import { OverlayClient } from "@/components/OverlayClient";
import { MediaOverlayClient } from "@/components/overlay/MediaOverlayClient";
import { WheelOverlayClient } from "@/components/overlay/WheelOverlayClient";
import { GachaOverlayClient } from "@/components/overlay/GachaOverlayClient";
import { BossOverlayClient } from "@/components/overlay/BossOverlayClient";
import { FitBox, StageProvider } from "@/components/overlay/Stage";
import type { MainCard } from "@/lib/obs-stage";

const STAGE_POLL_MS = 5000;
const NONE: Record<MainCard, boolean> = { alerts: true, media: false, wheel: false, gacha: false, boss: false };

/**
 * The main OBS link (the alerts link): every popup on one stage — alerts,
 * clips and voice messages, wheel spins, gacha reveals and boss kills — one
 * at a time, each scaled to fit the creator's own source. Which feature
 * clients run comes from the stage poll (cards that are on, minus any whose
 * own link is in use). `?test=1` is the alerts-only preview: nothing else
 * runs, so a preview tab never claims anything (C5).
 */
export function MainStage({
  alerts,
  bossColor,
}: {
  alerts: ComponentProps<typeof OverlayClient>;
  bossColor: string | null;
}) {
  const { username, apiKey, test } = alerts;
  const [cards, setCards] = useState(NONE);

  useEffect(() => {
    if (test || !apiKey) return;
    let active = true;
    async function poll() {
      try {
        const res = await fetch(`/api/overlay/${username}/stage?key=${encodeURIComponent(apiKey)}&link=main`, { cache: "no-store" });
        if (!res.ok) return;
        const d = (await res.json()) as { cards: Record<MainCard, boolean> | null };
        if (active && d.cards) {
          const next = d.cards;
          // Same answer as last time: keep the object so nothing re-renders.
          setCards((cur) => ((Object.keys(next) as MainCard[]).every((k) => cur[k] === next[k]) ? cur : next));
        }
      } catch {
        // try again next tick
      }
    }
    void poll();
    const id = setInterval(poll, STAGE_POLL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [username, apiKey, test]);

  if (test) return <OverlayClient {...alerts} />;

  return (
    <StageProvider>
      {cards.media && (
        <FitBox w={640} h={480} z={5}>
          <MediaOverlayClient username={username} apiKey={apiKey} via="main" />
        </FitBox>
      )}
      {cards.wheel && (
        <FitBox w={600} h={600} z={20}>
          <WheelOverlayClient username={username} apiKey={apiKey} />
        </FitBox>
      )}
      {cards.gacha && (
        <FitBox w={500} h={500} z={20}>
          <GachaOverlayClient username={username} apiKey={apiKey} />
        </FitBox>
      )}
      {cards.boss && (
        <FitBox w={600} h={260} z={20}>
          <BossOverlayClient username={username} apiKey={apiKey} color={bossColor} via="main" />
        </FitBox>
      )}
      <OverlayClient {...alerts} />
    </StageProvider>
  );
}
