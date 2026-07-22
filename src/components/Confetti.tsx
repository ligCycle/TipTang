"use client";

// Lightweight dependency-free confetti burst for big-tip alerts.
// Rendered as a full-screen SIBLING of the alert card (never inside it — the
// card clips overflow), fixed + high z-index so pieces spread across the whole
// OBS canvas. Positions/colors/timing are derived from the piece index (no
// Math.random needed), and each piece animates with a GPU-accelerated
// translate3d keyframe (see .confetti-piece / confettiFall in globals.css).

const COLORS = [
  "#ec4899",
  "#f59e0b",
  "#22c55e",
  "#3b82f6",
  "#a855f7",
  "#ef4444",
  "#14b8a6",
  "#eab308",
];

const COUNT = 34;

export function Confetti() {
  return (
    <div className="pointer-events-none fixed inset-0 z-[100] overflow-hidden">
      {Array.from({ length: COUNT }).map((_, i) => {
        const left = (i * 97) % 100; // spread across the width, deterministic
        const delay = (i % 10) * 0.12; // staggered start
        const duration = 2.2 + (i % 5) * 0.35; // 2.2s–3.6s
        const size = 8 + (i % 3) * 3; // 8–14px
        const color = COLORS[i % COLORS.length];
        const rounded = i % 4 === 0; // mix squares + dots
        return (
          <span
            key={i}
            className="confetti-piece absolute top-[-24px]"
            style={{
              left: `${left}%`,
              width: `${size}px`,
              height: `${size}px`,
              backgroundColor: color,
              borderRadius: rounded ? "9999px" : "2px",
              animationDelay: `${delay}s`,
              animationDuration: `${duration}s`,
            }}
          />
        );
      })}
    </div>
  );
}
