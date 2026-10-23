import { formatBaht } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { mainItem, pctOf, type GoalFeed, type GoalFeedItem, type GoalStyle } from "@/lib/wishlist";

/** Legacy single-goal shape (kept for callers that only know the old feed). */
export type GoalState = {
  enabled: boolean;
  title: string;
  goal: number;
  raised: number;
  pct: number;
};

// Darken a #rrggbb color by mixing toward black (amount 0..1).
function darken(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * (1 - amount));
  const g = Math.round(((n >> 8) & 255) * (1 - amount));
  const b = Math.round((n & 255) * (1 - amount));
  return `rgb(${r}, ${g}, ${b})`;
}

const DEFAULT_A = "#ec4899";
const DEFAULT_B = "#be185d";
/** "ทุกชิ้น" shows this many rows, then "+N ชิ้น". */
export const LIST_ROWS = 4;

type Bar = { title: string; raised: number; goal: number; pct: number; imageUrl: string | null };

function colors(color: string | null) {
  const valid = Boolean(color && /^#[0-9a-fA-F]{6}$/.test(color));
  return { from: valid ? color! : DEFAULT_A, to: valid ? darken(color!, 0.28) : DEFAULT_B };
}

function Thumb({ url, className }: { url: string | null; className: string }) {
  if (!url) return <Icon name="target" className="h-5 w-5 shrink-0" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className={`shrink-0 rounded-md object-cover ${className}`} />;
}

/** One goal bar in the creator's chosen style. `classic` is today's bar, unchanged. */
export function GoalCard({ bar, style, color }: { bar: Bar; style: GoalStyle; color: string | null }) {
  const { from, to } = colors(color);
  const fill = `${Math.min(100, Math.max(bar.pct, 4))}%`;
  const gradient = `linear-gradient(to right, ${from}, ${to})`;

  if (style === "big") {
    return (
      <div className="w-full max-w-xl text-center text-white">
        <p className="flex items-center justify-center gap-2 text-2xl font-black drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]">
          {bar.imageUrl && <Thumb url={bar.imageUrl} className="h-8 w-8" />}
          {bar.title}
        </p>
        <div className="relative mt-2 h-10 w-full overflow-hidden rounded-xl bg-black/60 ring-2 ring-white/25">
          <div className="h-full transition-all duration-700 ease-out" style={{ width: fill, backgroundImage: gradient }} />
          <span className="absolute inset-0 flex items-center justify-center text-lg font-black drop-shadow">
            {formatBaht(bar.raised)} / {formatBaht(bar.goal)} ({bar.pct}%)
          </span>
        </div>
      </div>
    );
  }

  if (style === "glass") {
    return (
      <div className="w-full max-w-xl rounded-3xl border border-white/40 bg-gradient-to-br from-white/30 to-white/10 p-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_10px_30px_rgba(0,0,0,0.4)] backdrop-blur-md">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex min-w-0 items-center gap-2 text-lg font-extrabold drop-shadow">
            <Thumb url={bar.imageUrl} className="h-7 w-7" />
            <span className="truncate">{bar.title}</span>
          </span>
          <span className="shrink-0 text-sm font-bold drop-shadow">
            {formatBaht(bar.raised)} / {formatBaht(bar.goal)}
          </span>
        </div>
        <div className="mt-3 h-4 w-full overflow-hidden rounded-full bg-white/20 shadow-[inset_0_1px_3px_rgba(0,0,0,0.35)]">
          <div
            className="h-full rounded-full shadow-[inset_0_2px_0_rgba(255,255,255,0.55)] transition-all duration-700 ease-out"
            style={{ width: fill, backgroundImage: `linear-gradient(to bottom, ${from}, ${to})` }}
          />
        </div>
      </div>
    );
  }

  if (style === "ring") {
    const pct = Math.min(100, Math.max(0, bar.pct));
    return (
      <div className="flex w-full max-w-xl items-center gap-4 text-white">
        <div
          className="grid h-24 w-24 shrink-0 place-items-center rounded-full"
          style={{ background: `conic-gradient(${from} 0 ${pct}%, rgba(255,255,255,0.2) 0)`, boxShadow: `0 0 22px ${from}66` }}
        >
          <div className="grid h-[76px] w-[76px] place-items-center rounded-full bg-[#120c16] text-xl font-black">{bar.pct}%</div>
        </div>
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-lg font-extrabold drop-shadow">
            {bar.imageUrl && <Thumb url={bar.imageUrl} className="h-7 w-7" />}
            <span className="truncate">{bar.title}</span>
          </p>
          <p className="text-sm font-semibold text-white/90 drop-shadow">
            {formatBaht(bar.raised)} / {formatBaht(bar.goal)}
          </p>
        </div>
      </div>
    );
  }

  // classic — exactly the bar creators already have.
  return (
    <div className="w-full max-w-xl rounded-2xl bg-black/55 p-4 text-white shadow-2xl ring-1 ring-white/15 backdrop-blur">
      <div className="mb-2 flex items-end justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-lg font-extrabold drop-shadow">
          {bar.imageUrl ? <Thumb url={bar.imageUrl} className="h-6 w-6" /> : <Icon name="target" className="h-5 w-5 shrink-0" />}
          {bar.title}
        </span>
        <span className="text-lg font-black drop-shadow">{bar.pct}%</span>
      </div>
      <div className="h-6 w-full overflow-hidden rounded-full bg-white/20">
        <div
          className="flex h-full items-center justify-end rounded-full pr-2 transition-all duration-700 ease-out"
          style={{ width: fill, backgroundImage: gradient }}
        >
          {/* Only once the fill is wide enough to hold it — at 0% the 4%
              sliver cut "฿0.00" down to "00". The total is shown below anyway. */}
          {bar.pct >= 20 && <span className="text-xs font-bold drop-shadow">{formatBaht(bar.raised)}</span>}
        </div>
      </div>
      <p className="mt-1.5 text-right text-sm font-semibold text-white/90 drop-shadow">
        {formatBaht(bar.raised)} / {formatBaht(bar.goal)}
      </p>
    </div>
  );
}

const barOf = (i: GoalFeedItem): Bar => ({
  title: i.name,
  raised: i.raised,
  goal: i.price,
  pct: pctOf(i.raised, i.price),
  imageUrl: i.imageUrl,
});

/** "ทุกชิ้น": a compact row per item, in the chosen style's look. */
function ItemRow({ item, style, color }: { item: GoalFeedItem; style: GoalStyle; color: string | null }) {
  const { from, to } = colors(color);
  const pct = Math.min(100, pctOf(item.raised, item.price));
  return (
    <li className="flex items-center gap-2.5 py-1.5">
      {style === "ring" ? (
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
          style={{ background: `conic-gradient(${item.full ? "#4ade80" : from} 0 ${pct}%, rgba(255,255,255,0.2) 0)` }}
        >
          <span className="grid h-7 w-7 place-items-center rounded-full bg-[#120c16] text-[10px] font-bold">{pct}%</span>
        </span>
      ) : (
        <Thumb url={item.imageUrl} className="h-8 w-8" />
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2 text-sm font-bold">
          <span className="truncate">{item.name}</span>
          <span className={`shrink-0 text-xs ${item.full ? "text-emerald-300" : "text-white/80"}`}>
            {item.full ? "ครบแล้ว!" : `${formatBaht(item.raised)} / ${formatBaht(item.price)}`}
          </span>
        </span>
        {style !== "ring" && (
          <span className={`mt-1 block overflow-hidden rounded-full bg-white/20 ${style === "big" ? "h-3" : "h-2"}`}>
            <span
              className="block h-full rounded-full transition-all duration-700"
              style={{ width: `${Math.max(pct, 3)}%`, backgroundImage: item.full ? "linear-gradient(90deg,#4ade80,#22c55e)" : `linear-gradient(90deg, ${from}, ${to})` }}
            />
          </span>
        )}
      </span>
    </li>
  );
}

/**
 * The goal on stream. Single goal: one bar. "หลายชิ้น": the chosen display —
 * ชิ้นหลัก (top unfilled item + "ถัดไป" line), ทุกชิ้น (rows), or สลับทีละชิ้น
 * (the item at `rotateIndex`, advanced by the overlay client).
 */
export function GoalView({
  goal,
  color,
  rotateIndex = 0,
}: {
  goal: GoalFeed | GoalState | null;
  color: string | null;
  rotateIndex?: number;
}) {
  if (!goal || !goal.enabled) return null;
  // Old single-goal shape.
  if (!("type" in goal)) {
    if (goal.goal <= 0) return null;
    return <GoalCard bar={{ ...goal, imageUrl: null, title: goal.title || "เป้าหมาย" }} style="classic" color={color} />;
  }
  if (goal.type === "single") {
    if (goal.single.goal <= 0) return null;
    return <GoalCard bar={{ ...goal.single, imageUrl: null, title: goal.single.title || "เป้าหมาย" }} style={goal.style} color={color} />;
  }
  const items = goal.items;
  if (items.length === 0) return null;

  if (goal.display === "all") {
    const shown = items.slice(0, LIST_ROWS);
    const panel =
      goal.style === "glass"
        ? "rounded-3xl border border-white/40 bg-gradient-to-br from-white/30 to-white/10 backdrop-blur-md"
        : "rounded-2xl bg-black/55 ring-1 ring-white/15 backdrop-blur";
    return (
      <div className={`w-full max-w-xl p-3.5 text-white shadow-2xl ${panel}`}>
        <ul className="divide-y divide-white/10">
          {shown.map((i) => (
            <ItemRow key={i.id} item={i} style={goal.style} color={color} />
          ))}
        </ul>
        {items.length > LIST_ROWS && <p className="pt-1 text-right text-xs text-white/70">+{items.length - LIST_ROWS} ชิ้น</p>}
      </div>
    );
  }

  const item = goal.display === "rotate" ? items[((rotateIndex % items.length) + items.length) % items.length] : mainItem(items)!;
  const next = goal.display === "main" ? items.filter((i) => i.id !== item.id && !i.full).slice(0, 3) : [];
  return (
    <div className="w-full max-w-xl">
      <GoalCard bar={barOf(item)} style={goal.style} color={color} />
      {next.length > 0 && (
        <p className="mt-1.5 truncate text-sm font-semibold text-white/85 drop-shadow">
          ถัดไป: {next.map((i) => `${i.name} ${formatBaht(i.price)}`).join(" · ")}
        </p>
      )}
      {goal.display === "rotate" && items.length > 1 && (
        <p className="mt-1 text-center text-xs tracking-[0.3em] text-white/70" aria-hidden>
          {items.map((i) => (i.id === item.id ? "●" : "○")).join(" ")}
        </p>
      )}
    </div>
  );
}

/** "<item> ครบแล้ว! ขอบคุณทุกคน" for a few seconds when an item fills up. */
export function GoalFullMoment({ item }: { item: GoalFeedItem }) {
  return (
    <div className="w-full max-w-xl animate-[ttpop_0.4s_ease-out] rounded-2xl border-2 border-emerald-400 bg-[#120c16]/90 p-4 text-center text-white shadow-[0_0_28px_rgba(74,222,128,0.5)]">
      <p className="text-lg font-extrabold">{item.name}</p>
      <p className="text-2xl font-black text-emerald-300">ครบแล้ว! ขอบคุณทุกคน</p>
      <p className="text-sm text-white/80">
        {formatBaht(item.raised)} จาก {item.fans} คน
      </p>
      <style>{`@keyframes ttpop { from { transform: scale(0.85); opacity: 0; } to { transform: scale(1); opacity: 1; } }`}</style>
    </div>
  );
}
