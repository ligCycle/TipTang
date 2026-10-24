"use client";

import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";

/**
 * The main OBS link plays every popup on one stage (spec
 * docs/superpowers/specs/2026-10-24-obs-two-links-design.md): one turn at a
 * time, alerts before other popups (C8). Media (clips, voice) isn't a turn:
 * it plays while the stage is free and pauses while anything holds it (C1).
 * Without a provider — a client on its own link — the stage is always free,
 * so every per-feature link behaves exactly as before.
 */
export type TurnKind = "alert" | "popup";

export type StageApi = {
  /** Inside the main link (clients fill their box and hide when idle). */
  embedded: boolean;
  /** Something holds the stage or waits for it (media pauses, nothing is claimed). */
  busy: boolean;
  /** No turn held or waiting right now: a claim-on-fetch client may fetch. */
  canClaim(): boolean;
  /** Resolves when it's this caller's turn. */
  acquire(kind: TurnKind): Promise<void>;
  release(): void;
};

const FREE: StageApi = {
  embedded: false,
  busy: false,
  canClaim: () => true,
  acquire: () => Promise.resolve(),
  release: () => {},
};

const StageContext = createContext<StageApi>(FREE);

export function useStage(): StageApi {
  return useContext(StageContext);
}

/** A non-alert popup waits this long after its claim, so the tip's own alert goes first (C8). */
export const POPUP_DELAY_MS = 3500;
/** "Free again" is reported only after this gap, so media doesn't flicker between queued alerts. */
const FREE_AFTER_MS = 1000;

class StageStore {
  private holder: TurnKind | null = null;
  private waiting: { kind: TurnKind; go: () => void }[] = [];
  private listeners = new Set<() => void>();
  private freeTimer: ReturnType<typeof setTimeout> | null = null;
  /** OBS tells a browser source when it is (not) in the program output. */
  onAir = true;
  busy = false;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getBusy = () => this.busy;

  private changed() {
    const busy = this.holder !== null || this.waiting.length > 0;
    if (this.freeTimer) {
      clearTimeout(this.freeTimer);
      this.freeTimer = null;
    }
    if (busy === this.busy) return;
    if (!busy) {
      this.freeTimer = setTimeout(() => {
        this.freeTimer = null;
        this.busy = false;
        for (const fn of this.listeners) fn();
      }, FREE_AFTER_MS);
      return;
    }
    this.busy = true;
    for (const fn of this.listeners) fn();
  }

  // A copy of the main link in a scene that isn't on air (or several copies)
  // must not take spins, pulls or kills the stream would never show (I-4).
  canClaim = () => this.onAir && this.holder === null && this.waiting.length === 0;

  acquire = (kind: TurnKind) =>
    new Promise<void>((go) => {
      if (this.holder === null && this.waiting.length === 0) {
        this.holder = kind;
        this.changed();
        go();
        return;
      }
      // Alerts go ahead of waiting popups; otherwise first come, first served.
      const entry = { kind, go };
      const at = kind === "alert" ? this.waiting.findIndex((w) => w.kind !== "alert") : -1;
      if (at >= 0) this.waiting.splice(at, 0, entry);
      else this.waiting.push(entry);
      this.changed();
    });

  release = () => {
    const next = this.waiting.shift();
    this.holder = next ? next.kind : null;
    this.changed();
    next?.go();
  };
}

export function StageProvider({ children }: { children: ReactNode }) {
  const [s] = useState(() => new StageStore());
  useEffect(() => {
    const onActive = (e: Event) => {
      s.onAir = Boolean((e as CustomEvent<{ active?: boolean }>).detail?.active);
    };
    window.addEventListener("obsSourceActiveChanged", onActive);
    return () => window.removeEventListener("obsSourceActiveChanged", onActive);
  }, [s]);
  const busy = useSyncExternalStore(s.subscribe, s.getBusy, () => false);
  const api = useMemo<StageApi>(
    () => ({ embedded: true, busy, canClaim: s.canClaim, acquire: s.acquire, release: s.release }),
    [busy, s],
  );
  return <StageContext.Provider value={api}>{children}</StageContext.Provider>;
}

function subscribeResize(fn: () => void) {
  window.addEventListener("resize", fn);
  return () => window.removeEventListener("resize", fn);
}
const windowSize = () => `${window.innerWidth}x${window.innerHeight}`;

/**
 * Shows a popup at its natural size, centred, scaled down (never up) to fit
 * whatever size the creator gave the OBS source (S3). Alerts don't use it.
 */
export function FitBox({ w, h, children, z = 10 }: { w: number; h: number; children: ReactNode; z?: number }) {
  const size = useSyncExternalStore(subscribeResize, windowSize, () => "0x0");
  const [vw, vh] = size.split("x").map(Number);
  const scale = vw > 0 && vh > 0 ? Math.min(1, vw / w, vh / h) : 1;
  return (
    <div className="pointer-events-none fixed inset-0 flex items-center justify-center" style={{ zIndex: z }}>
      <div className="pointer-events-auto shrink-0" style={{ width: w, height: h, transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}
