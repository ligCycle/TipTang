"use client";

import { useEffect, useState } from "react";

export type SoundSetSummary = {
  id: string;
  name: string;
  items: { assetId: string; fanPickable: boolean; minAmount: number }[];
};

const CHANGED = "tiptang:sound-sets-changed";

async function fetchSets(): Promise<{ activeSetId: string; sets: SoundSetSummary[] }> {
  const d = await fetch("/api/overlay/sets").then((r) => r.json());
  return { activeSetId: d.activeSetId ?? "", sets: d.sets ?? [] };
}

/**
 * The creator's sound sets and the active one. Every component using this
 * (switchers, the alerts summary and preview) refreshes when any of them
 * switches the set.
 */
export function useSoundSets() {
  const [data, setData] = useState<{ activeSetId: string; sets: SoundSetSummary[] } | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchSets()
        .then((d) => alive && setData(d))
        .catch(() => {});
    load();
    window.addEventListener(CHANGED, load);
    return () => {
      alive = false;
      window.removeEventListener(CHANGED, load);
    };
  }, []);

  async function activate(id: string): Promise<boolean> {
    const prev = data;
    if (data) setData({ ...data, activeSetId: id });
    const res = await fetch(`/api/overlay/sets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activate: true }),
    });
    if (!res.ok) {
      setData(prev);
      return false;
    }
    window.dispatchEvent(new Event(CHANGED));
    return true;
  }

  const active = data?.sets.find((s) => s.id === data.activeSetId) ?? null;
  return { sets: data?.sets ?? null, activeSetId: data?.activeSetId ?? null, active, activate };
}
