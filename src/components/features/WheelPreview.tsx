import { clampSlots, landingRotation, layoutSegments, type WheelTask } from "@/lib/wheel";

/** Fixed palette by task (copies of one task share a colour); "ไม่ต้องทำอะไร" tasks are grey. */
const PALETTE = ["#ec4899", "#f97316", "#8b5cf6", "#06b6d4", "#22c55e", "#eab308", "#ef4444", "#3b82f6"];
const NO_ACTION = "#64748b";
export const SPIN_MS = 5000;

const R = 100;

function point(deg: number, r: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [r * Math.cos(rad), r * Math.sin(rad)] as const;
}

function slicePath(from: number, to: number) {
  if (to - from >= 359.999) return `M ${-R} 0 A ${R} ${R} 0 1 1 ${R} 0 A ${R} ${R} 0 1 1 ${-R} 0 Z`;
  const [x1, y1] = point(from, R);
  const [x2, y2] = point(to, R);
  return `M 0 0 L ${x1} ${y1} A ${R} ${R} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2} Z`;
}

/** Small deterministic offset inside the landing segment so stops don't look identical. */
function jitter(key: string, span: number) {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return ((h % 1000) / 1000 - 0.5) * span * 0.6;
}

/**
 * The wheel as drawn on stream: tasks × slots segments (minus removed ones),
 * labels along each segment, a pointer at the top. With `spinTo` (a segment
 * key) it spins for SPIN_MS and stops on that segment.
 */
export function WheelPreview({
  tasks,
  slots,
  removed,
  spinTo,
  className = "",
}: {
  tasks: WheelTask[];
  slots: number;
  removed: string[];
  spinTo?: string;
  className?: string;
}) {
  const segs = layoutSegments(tasks, clampSlots(tasks.length, slots), removed);
  const n = segs.length;
  const span = n > 0 ? 360 / n : 360;
  const colour = new Map(tasks.map((t, i) => [t.id, t.noAction ? NO_ACTION : PALETTE[i % PALETTE.length]]));
  const text = new Map(tasks.map((t) => [t.id, t.text]));
  const maxChars = n > 24 ? 9 : n > 12 ? 12 : 16;
  const fontSize = n > 24 ? 5.5 : n > 12 ? 7 : 8.5;
  const target = spinTo ? segs.findIndex((s) => s.key === spinTo) : -1;
  const rotation = target >= 0 ? landingRotation(n, target, 6) + jitter(spinTo!, span) : 0;

  return (
    <svg viewBox="-110 -118 220 228" className={className} role="img" aria-label={tasks.map((t) => t.text).join(", ")}>
      {target >= 0 && (
        <style>{`@keyframes tt-wheel-spin { from { transform: rotate(0deg); } to { transform: rotate(${rotation}deg); } }`}</style>
      )}
      <g
        style={
          target >= 0
            ? { animation: `tt-wheel-spin ${SPIN_MS}ms cubic-bezier(0.12, 0.7, 0.12, 1) forwards` }
            : undefined
        }
      >
        <circle r={R + 4} fill="#ffffff" />
        {n === 0 ? (
          <circle r={R} fill="#cbd5e1" />
        ) : (
          segs.map((s, i) => {
            const from = i * span;
            const mid = from + span / 2;
            const label = text.get(s.taskId) ?? "";
            const [lx, ly] = point(mid, R * 0.6);
            return (
              <g key={s.key}>
                <path d={slicePath(from, from + span)} fill={colour.get(s.taskId)} stroke="#ffffff" strokeWidth={0.8} />
                <text
                  x={lx}
                  y={ly}
                  fill="#ffffff"
                  fontSize={fontSize}
                  fontWeight={700}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  transform={`rotate(${mid > 180 ? mid + 90 : mid - 90} ${lx} ${ly})`}
                >
                  {label.length > maxChars ? `${label.slice(0, maxChars - 1)}…` : label}
                </text>
              </g>
            );
          })
        )}
        <circle r={9} fill="#ffffff" stroke="#be185d" strokeWidth={2} />
      </g>
      <path d="M -9 -116 L 9 -116 L 0 -96 Z" fill="#ffffff" stroke="#be185d" strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}
