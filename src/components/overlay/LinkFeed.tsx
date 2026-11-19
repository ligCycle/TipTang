"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { pollDelayMs } from "@/lib/poll-pace";
import { watchObsLive } from "@/components/overlay/obsStatus";

/**
 * One poll per OBS link. Every request is billed on Vercel, so the main and
 * bars links ask /stage once per tick and hand each client its part
 * (src/lib/link-feed-server.ts) instead of every client polling its own feed.
 * Without a provider (a feature on its own link) clients poll as before.
 */
export type LinkFeed = {
  /** Calls `fn` with this key of every answer (and the latest one right away). */
  on(key: string, fn: (data: unknown) => void): () => void;
  /** Adds query parameters to the poll, e.g. the alerts cursor. */
  addQuery(fn: () => string): () => void;
};

const LinkFeedContext = createContext<LinkFeed | null>(null);
export const LinkFeedProvider = LinkFeedContext.Provider;

export function useLinkFeed(): LinkFeed | null {
  return useContext(LinkFeedContext);
}

/** Main-link popup clients ask on their own this often; "hot" asks sooner. */
export const IDLE_POLL_MS = 60_000;

class Bus implements LinkFeed {
  private listeners = new Map<string, Set<(data: unknown) => void>>();
  private last = new Map<string, unknown>();
  private queries = new Set<() => string>();

  on(key: string, fn: (data: unknown) => void) {
    let set = this.listeners.get(key);
    if (!set) this.listeners.set(key, (set = new Set()));
    set.add(fn);
    if (this.last.has(key)) fn(this.last.get(key));
    return () => {
      set.delete(fn);
    };
  }
  addQuery(fn: () => string) {
    this.queries.add(fn);
    return () => {
      this.queries.delete(fn);
    };
  }
  query(): string {
    return [...this.queries].map((q) => q()).filter(Boolean).map((q) => `&${q}`).join("");
  }
  emit(data: Record<string, unknown>) {
    for (const [key, value] of Object.entries(data)) {
      this.last.set(key, value);
      for (const fn of this.listeners.get(key) ?? []) fn(value);
    }
  }
}

/**
 * Polls `url` (plus clients' queries) every `everyMs`, slower while OBS says
 * the source isn't on air or the tab is hidden; null = don't poll.
 */
export function useLinkFeedPoll(url: string | null, everyMs: number): LinkFeed {
  const [bus] = useState(() => new Bus());
  useEffect(() => {
    if (!url) return;
    let active = true;
    async function poll() {
      try {
        const res = await fetch(url + bus.query(), { cache: "no-store" });
        if (res.ok && active) bus.emit((await res.json()) as Record<string, unknown>);
      } catch {
        // try again next tick
      }
    }
    const stop = pacedLoop(poll, everyMs, { now: true });
    return () => {
      active = false;
      stop();
    };
  }, [url, everyMs, bus]);
  return bus;
}

/**
 * Like setInterval(poll, everyMs), but paced by src/lib/poll-pace.ts: slower
 * while OBS isn't streaming or recording, the source isn't on screen or the
 * tab is hidden, and right away when that ends. One request at a time.
 * `now` also asks once at the start. Returns a stop function.
 */
export function pacedLoop(poll: () => unknown, everyMs: number, opts: { now?: boolean } = {}): () => void {
  let active = true;
  let onAir = true; // the source is on screen (OBS tells us when it changes)
  let streaming = true;
  let inFlight = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const live = () => onAir && !document.hidden && streaming;
  function schedule() {
    if (timer) clearTimeout(timer);
    timer = active ? setTimeout(run, pollDelayMs(everyMs, { shown: onAir && !document.hidden, streaming })) : null;
  }
  async function run() {
    if (timer) clearTimeout(timer);
    timer = null;
    if (inFlight) return; // the request in flight schedules the next one
    inFlight = true;
    try {
      await poll();
    } catch {
      // try again next tick
    } finally {
      inFlight = false;
    }
    schedule();
  }
  // Back on air, on screen or visible: ask now instead of waiting out the slow tick.
  const wake = () => {
    if (live()) void run();
  };
  const onActive = (e: Event) => {
    onAir = Boolean((e as CustomEvent<{ active?: boolean }>).detail?.active);
    wake();
  };
  window.addEventListener("obsSourceActiveChanged", onActive);
  document.addEventListener("visibilitychange", wake);
  const stopWatch = watchObsLive((v) => {
    const was = streaming;
    streaming = v;
    if (v && !was) wake();
  });
  if (opts.now) void run();
  else schedule();
  return () => {
    active = false;
    if (timer) clearTimeout(timer);
    timer = null;
    stopWatch();
    window.removeEventListener("obsSourceActiveChanged", onActive);
    document.removeEventListener("visibilitychange", wake);
  };
}
