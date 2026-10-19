"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Icon } from "@/components/Icon";
import type { TodoItem } from "@/lib/wheel-server";

const REFRESH_MS = 15_000;

async function fetchTodo(status: "open" | "done"): Promise<TodoItem[] | null> {
  const res = await fetch(`/api/wheels/spins?status=${status}`).catch(() => null);
  const d = res?.ok ? await res.json().catch(() => null) : null;
  return d?.items ?? null;
}
const COMPACT_ROWS = 3;

/**
 * "ภารกิจค้างทำ": wheel results the creator still has to do, ticked off with
 * "ทำแล้ว"; the done tab (last 30 days) can undo. `compact` is the short block
 * on the dashboard home — hidden when nothing is open.
 */
export function SpinTodo({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("wheel");
  const locale = useLocale();
  const [tab, setTab] = useState<"open" | "done">("open");
  const [items, setItems] = useState<TodoItem[] | null>(null);
  const [openCount, setOpenCount] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  const apply = useCallback(
    (list: TodoItem[] | null) => {
      if (!list) return;
      setItems(list);
      if (tab === "open") setOpenCount(list.length);
    },
    [tab],
  );

  useEffect(() => {
    fetchTodo(tab).then(apply);
    const id = setInterval(() => fetchTodo(tab).then(apply), REFRESH_MS);
    return () => clearInterval(id);
  }, [tab, apply]);

  async function mark(item: TodoItem, done: boolean) {
    setBusy(item.id);
    try {
      const res = await fetch("/api/wheels/spins", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, done }),
      });
      if (res.ok) {
        setItems((cur) => cur?.filter((i) => i.id !== item.id) ?? cur);
        setOpenCount((c) => c + (done ? -1 : 1));
      }
    } finally {
      setBusy(null);
    }
  }

  const time = (iso: string) =>
    new Date(iso).toLocaleString(locale === "th" ? "th-TH" : "en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  if (compact && (!items || openCount === 0)) return null;
  const rows = compact ? (items ?? []).slice(0, COMPACT_ROWS) : (items ?? []);

  return (
    <section className="rounded-2xl border border-brand-200 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold text-brand-900">{t("todoTitle", { count: openCount })}</h2>
        {compact ? (
          <Link
            href={`/${locale}/dashboard/features/wheel`}
            className="text-sm font-semibold text-brand-700 hover:underline"
          >
            {t("todoSeeAll")}
          </Link>
        ) : (
          <div className="flex gap-1.5">
            {(["open", "done"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setItems(null);
                  setTab(k);
                }}
                aria-pressed={tab === k}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  tab === k ? "bg-brand-600 text-white" : "bg-brand-100 text-brand-800 hover:bg-brand-200"
                }`}
              >
                {k === "open" ? t("todoTabOpen") : t("todoTabDone")}
              </button>
            ))}
          </div>
        )}
      </div>
      {items === null ? null : rows.length === 0 ? (
        <p className="text-sm text-brand-900/60">{tab === "open" ? t("todoEmpty") : t("todoDoneEmpty")}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((i) => (
            <li
              key={i.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-brand-200 bg-brand-50/40 px-3 py-2"
            >
              <span className="min-w-0 flex-1 font-semibold text-brand-900">{i.taskText}</span>
              <span className="text-xs text-brand-900/60">
                {i.fan} · ฿{i.amount.toLocaleString()} · {time(tab === "open" ? i.confirmedAt : (i.doneAt ?? i.confirmedAt))}
              </span>
              {tab === "open" ? (
                <button
                  type="button"
                  onClick={() => mark(i, true)}
                  disabled={busy === i.id}
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  <Icon name="check" className="h-3.5 w-3.5" />
                  {t("todoDone")}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => mark(i, false)}
                  disabled={busy === i.id}
                  className="rounded-full border border-brand-300 px-3 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100 disabled:opacity-60"
                >
                  {t("todoUndo")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {compact && openCount > COMPACT_ROWS && (
        <p className="mt-2 text-xs text-brand-900/55">{t("todoMore", { count: openCount - COMPACT_ROWS })}</p>
      )}
    </section>
  );
}
