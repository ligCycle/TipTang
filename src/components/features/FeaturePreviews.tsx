"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/Icon";
import { DEFAULT_COLOR } from "@/lib/colors";
import { DEFAULT_SIDES } from "@/lib/pk";
import type { PkFeed } from "@/lib/pk-server";
import type { ComboFeed, LevelRow } from "@/lib/combo";
import type { Rarity } from "@/lib/gacha";
import { ComboView } from "@/components/overlay/ComboOverlayClient";
import { PkView } from "@/components/overlay/PkOverlayClient";
import { GachaReveal } from "@/components/overlay/GachaOverlayClient";
import { BossView } from "@/components/overlay/BossOverlayClient";
import { MediaInfoCard } from "@/components/overlay/MediaOverlayClient";
import { PREVIEW_WIDTH, PreviewStage, SampleButton } from "@/components/features/PreviewPanel";

/*
 * Each feature's settings preview: the real overlay view drawn with sample
 * data and the creator's own settings (colours, rewards, prizes, bosses), so
 * what they see here is what OBS shows. Nothing here talks to the server.
 */

const okColor = (c: string | null | undefined) => (c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : null);

/** "คอมโบทิป": running, a level-up, the end summary. */
export function ComboPreview({ rows, sizes, color }: { rows: LevelRow[]; sizes: number[]; color: string | null }) {
  const t = useTranslations("featureHub");
  const [sample, setSample] = useState<"running" | "level" | "summary">("running");
  const [now] = useState(() => Date.now());
  const level = Math.min(2, Math.max(1, rows.length));
  const size = sizes[level - 1] ?? 100;
  const unlocked = rows
    .slice(1, level)
    .map((r, i) => ({ level: i + 2, text: r.reward }))
    .filter((r) => r.text);
  const top = Math.min(3, rows.length);
  const feed: Exclude<ComboFeed, { phase: "idle" }> =
    sample === "summary"
      ? {
          phase: "summary",
          id: "preview",
          level: top,
          total: sizes.slice(0, top).reduce((s, n) => s + n, 0),
          fans: 6,
          won: rows.slice(1, top).map((r, i) => ({ level: i + 2, text: r.reward })).filter((r) => r.text),
          almost: rows[top]?.reward ? { level: top + 1, text: rows[top].reward } : null,
          until: new Date(now + 60_000).toISOString(),
        }
      : {
          phase: "running",
          id: "preview",
          level,
          progress: Math.round(size * 0.6),
          size,
          nextReward: rows[level]?.reward || null,
          unlocked,
          endsAt: new Date(now + 45_000).toISOString(),
        };
  const celebrate = sample === "level" ? { key: "preview", level, text: rows[level - 1]?.reward || null } : null;
  return (
    <PreviewStage
      width={PREVIEW_WIDTH}
      controls={
        <>
          <SampleButton on={sample === "running"} onClick={() => setSample("running")}>{t("pvComboRunning")}</SampleButton>
          <SampleButton on={sample === "level"} onClick={() => setSample("level")}>{t("pvComboLevel")}</SampleButton>
          <SampleButton on={sample === "summary"} onClick={() => setSample("summary")}>{t("pvComboSummary")}</SampleButton>
        </>
      }
      note={t("pvNote")}
    >
      <ComboView key={sample} feed={feed} now={now} celebrate={celebrate} color={color} />
    </PreviewStage>
  );
}

/** "ขอคลิป/เพลง" and "ฝากเสียง": a clip playing, or a voice message. */
export function MediaPreview({ color }: { color: string | null }) {
  const t = useTranslations("featureHub");
  const [sample, setSample] = useState<"clip" | "voice">("clip");
  const c = okColor(color) ?? DEFAULT_COLOR;
  return (
    <PreviewStage
      width={PREVIEW_WIDTH}
      controls={
        <>
          <SampleButton on={sample === "clip"} onClick={() => setSample("clip")}>{t("pvClip")}</SampleButton>
          <SampleButton on={sample === "voice"} onClick={() => setSample("voice")}>{t("pvVoice")}</SampleButton>
        </>
      }
      note={t("pvMediaNote")}
    >
      <div className="w-full">
        {sample === "clip" ? (
          <div className="grid aspect-video w-full place-items-center rounded-2xl bg-black">
            <span className="grid h-20 w-28 place-items-center rounded-2xl bg-white/15 text-white">
              <Icon name="play" className="h-10 w-10" />
            </span>
          </div>
        ) : (
          <div className="flex h-[120px] w-full items-center gap-4 rounded-2xl bg-[#120c16]/90 px-6">
            <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full text-white" style={{ background: c }}>
              <Icon name="mic" className="h-8 w-8" />
            </span>
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/15">
              <div className="h-full w-2/5 rounded-full" style={{ background: c }} />
            </div>
          </div>
        )}
        <MediaInfoCard
          current={{
            test: false,
            kind: sample,
            fan: t("sampleName"),
            amount: sample === "clip" ? 50 : 30,
            title: sample === "clip" ? t("pvClipTitle") : null,
          }}
          color={c}
        />
      </div>
    </PreviewStage>
  );
}

/** "กาชา": the reveal for each rarity, with the creator's own prizes. */
export function GachaPreview({
  prizes,
  color,
}: {
  prizes: { rarity: Rarity; text: string; imageUrl: string | null }[];
  color: string | null;
}) {
  const t = useTranslations("featureHub");
  const tg = useTranslations("gachaPage");
  const [rarity, setRarity] = useState<Rarity>("epic");
  const [round, setRound] = useState(0);
  const prize = prizes.find((p) => p.rarity === rarity);
  return (
    <PreviewStage
      width={440}
      controls={(["common", "rare", "epic"] as const).map((r) => (
        <SampleButton
          key={r}
          on={rarity === r}
          onClick={() => {
            setRarity(r);
            setRound((n) => n + 1);
          }}
        >
          {tg(`r_${r}`)}
        </SampleButton>
      ))}
      note={t("pvNote")}
    >
      <div className="h-[440px] w-[440px]">
        <GachaReveal
          key={`${rarity}-${round}`}
          pull={{ id: "preview", rarity, fan: t("sampleName"), prizeText: prize?.text ?? t("pvPrize"), imageUrl: prize?.imageUrl ?? null }}
          open
          color={okColor(color) ?? DEFAULT_COLOR}
          embedded
        />
      </div>
    </PreviewStage>
  );
}

/** "PK": the running match if there is one, else a sample with the default sides. */
export function PkPreview({ match, now }: { match: PkFeed | null; now: number }) {
  const t = useTranslations("featureHub");
  const [sample, setSample] = useState<"live" | "ended">("live");
  const shown = match ?? {
    kind: "solo" as const,
    phase: sample,
    ...DEFAULT_SIDES,
    totalA: 1250,
    totalB: 830,
    winner: sample === "ended" ? ("A" as const) : null,
  };
  const left = match ? Math.max(0, Math.round((Date.parse(match.endsAt) - now) / 1000)) : 272;
  return (
    <PreviewStage
      width={PREVIEW_WIDTH}
      controls={
        match ? undefined : (
          <>
            <SampleButton on={sample === "live"} onClick={() => setSample("live")}>{t("pvPkLive")}</SampleButton>
            <SampleButton on={sample === "ended"} onClick={() => setSample("ended")}>{t("pvPkEnded")}</SampleButton>
          </>
        )
      }
      note={match ? t("pvPkReal") : t("pvNote")}
    >
      <PkView match={shown} left={left} />
    </PreviewStage>
  );
}

/** "ตีบอส": the current boss card, or its kill banner. */
export function BossPreview({
  boss,
  damage,
  index,
  total,
  color,
}: {
  boss: { id: string; name: string; hp: number; reward: string; imageUrl: string | null } | null;
  damage: number;
  index: number;
  total: number;
  color: string | null;
}) {
  const t = useTranslations("featureHub");
  const [sample, setSample] = useState<"card" | "kill">("card");
  const b = boss ?? { id: "preview", name: t("pvBoss"), hp: 500, reward: t("pvPrize"), imageUrl: null };
  const feed = {
    phase: "live" as const,
    run: 0,
    life: 0,
    bossDefId: b.id,
    boss: { id: b.id, name: b.name, imageUrl: b.imageUrl, hp: b.hp, damage: boss ? damage : 200, index: boss ? index : 1, total: boss ? total : 1 },
    kill: null,
    chain: null,
    pending: 0,
  };
  const banner =
    sample === "kill"
      ? {
          key: "preview",
          kill: {
            id: "preview",
            bossName: b.name,
            hp: b.hp,
            reward: b.reward,
            imageUrl: b.imageUrl,
            killer: t("sampleName"),
            topFan: t("sampleName"),
            topAmount: b.hp,
          },
        }
      : null;
  return (
    <PreviewStage
      width={PREVIEW_WIDTH}
      controls={
        <>
          <SampleButton on={sample === "card"} onClick={() => setSample("card")}>{t("pvBossCard")}</SampleButton>
          <SampleButton on={sample === "kill"} onClick={() => setSample("kill")}>{t("pvBossKill")}</SampleButton>
        </>
      }
      note={t("pvNote")}
    >
      <BossView banner={banner} feed={feed} color={color} hit={null} />
    </PreviewStage>
  );
}
