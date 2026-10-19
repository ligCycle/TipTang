import { formatBaht } from "@/lib/format";
import { isAlertStyle, DEFAULT_ALERT_STYLE } from "@/lib/alertStyles";
import { darkCardGlow } from "@/lib/alertThemes";
import { DEFAULT_COLOR } from "@/lib/colors";
import { Icon } from "@/components/Icon";

// Darken a #rrggbb color by mixing toward black (amount 0..1).
function darken(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * (1 - amount));
  const g = Math.round(((n >> 8) & 255) * (1 - amount));
  const b = Math.round((n & 255) * (1 - amount));
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * The donation alert card itself — no positioning, no sound, no confetti.
 * Used by the OBS overlays and by the dashboard preview.
 */
export function AlertCard({
  name,
  amount,
  message,
  timerDelta,
  color,
  alertStyle,
  alertTheme,
  isBig,
  imageUrl,
  videoUrl,
  videoMuted = false,
  loop = false,
}: {
  name: string;
  amount: number;
  message: string | null;
  timerDelta?: number | null;
  color: string | null;
  alertStyle: string;
  alertTheme: string;
  isBig: boolean;
  imageUrl: string | null;
  videoUrl: string | null;
  /** Mute the video (a fan's picked sound plays instead). */
  videoMuted?: boolean;
  /** Dashboard preview: replay the in/out animation forever instead of once. */
  loop?: boolean;
}) {
  const useCustom = Boolean(color && /^#[0-9a-fA-F]{6}$/.test(color));
  const dark = alertTheme === "dark";
  const glow = darkCardGlow(useCustom ? color! : DEFAULT_COLOR);
  const cardStyle = dark
    ? {
        borderColor: glow,
        boxShadow: `0 0 0 1px ${glow}66, 0 0 32px ${glow}80, 0 24px 48px -16px rgba(0,0,0,0.7)`,
      }
    : useCustom
      ? {
          backgroundImage: `linear-gradient(to bottom right, ${color}, ${darken(color!, 0.3)})`,
        }
      : undefined;

  return (
    <div
      style={loop ? { ...cardStyle, animationIterationCount: "infinite" } : cardStyle}
      className={`alert-${
        isAlertStyle(alertStyle) ? alertStyle : DEFAULT_ALERT_STYLE
      } ${
        isBig ? "alert-big" : ""
      } w-full rounded-2xl p-5 text-white shadow-2xl ${
        dark
          ? "border-[1.5px] bg-[#120c16]/90 backdrop-blur-md"
          : `ring-1 ring-white/20 ${useCustom ? "" : "bg-gradient-to-br from-brand-500 to-brand-700"}`
      }`}
    >
      {isBig && (
        <p className="mb-2 flex items-center justify-center gap-2 text-sm font-black uppercase tracking-widest drop-shadow">
          <Icon name="sparkles" className="h-4 w-4" />
          SUPER TIP!
          <Icon name="sparkles" className="h-4 w-4" />
        </p>
      )}
      {dark && !isBig && (
        <p
          className="mb-2 text-xs font-bold uppercase tracking-widest"
          style={{ color: glow }}
        >
          ทิปใหม่!
        </p>
      )}
      {videoUrl ? (
        <video
          src={videoUrl}
          autoPlay
          muted={videoMuted}
          playsInline
          className="mx-auto mb-3 max-h-48 w-auto rounded-xl"
        />
      ) : (
        imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            className="mx-auto mb-3 max-h-40 w-auto rounded-xl object-contain"
          />
        )
      )}
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex min-w-0 items-center gap-2 text-lg font-extrabold drop-shadow">
          <Icon name="heart" className="h-5 w-5 shrink-0" />
          <span className="truncate">{name || "ผู้ไม่ประสงค์ออกนาม"}</span>
        </span>
        <span
          className={`rounded-full px-3 py-1 text-lg font-black ${dark ? "bg-tip-400 text-tip-900" : "bg-white/25"}`}
        >
          {formatBaht(amount)}
        </span>
      </div>
      {timerDelta != null && timerDelta !== 0 && (
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-black/25 px-3 py-0.5 text-sm font-bold">
          <Icon name="clock" className="h-3.5 w-3.5" />
          {timerDelta < 0 ? "−" : "+"}
          {Math.max(1, Math.round(Math.abs(timerDelta) / 60))} นาที
        </p>
      )}
      {message && <p className="mt-2 text-white/95">{message}</p>}
    </div>
  );
}
