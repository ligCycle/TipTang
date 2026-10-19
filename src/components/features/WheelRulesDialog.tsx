"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { TEMPLATES, type TemplateKey } from "@/lib/wheel";
import { WheelPreview } from "@/components/features/WheelPreview";

function Modal({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={label}>
      <div className="card max-h-[90vh] w-full max-w-lg overflow-x-hidden overflow-y-auto rounded-2xl p-5 shadow-2xl">{children}</div>
    </div>
  );
}

const RULES = ["rule1", "rule2", "rule3"] as const;

/**
 * First-enable checklist (once per creator): three statements to tick before
 * the wheel turns on. Accepting stores the time and switches the card on.
 */
export function WheelRulesDialog({ onAccepted, onCancel }: { onAccepted: () => void; onCancel: () => void }) {
  const t = useTranslations("wheel");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const all = RULES.every((r) => ticked[r]);

  async function accept() {
    setBusy(true);
    setError(false);
    try {
      const res = await fetch("/api/wheels/rules", { method: "POST" });
      if (!res.ok) throw new Error();
      onAccepted();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal label={t("rulesTitle")}>
      <h2 className="text-lg font-extrabold text-brand-900">{t("rulesTitle")}</h2>
      <p className="mt-1 text-sm text-brand-900/65">{t("rulesIntro")}</p>
      <ul className="mt-4 space-y-2">
        {RULES.map((r) => (
          <li key={r}>
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-brand-200 p-3 text-sm text-brand-900">
              <input
                type="checkbox"
                checked={Boolean(ticked[r])}
                onChange={(e) => setTicked((cur) => ({ ...cur, [r]: e.target.checked }))}
                className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600"
              />
              {t(r)}
            </label>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-brand-900/55">
        {t("rulesTerms")}{" "}
        <Link href={`/${locale}/terms#random-features`} target="_blank" className="font-semibold text-brand-700 hover:underline">
          {t("rulesTermsLink")}
        </Link>
      </p>
      {error && <p className="mt-2 text-sm font-medium text-red-600">{t("saveFailed")}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={busy} className="btn-secondary px-4 py-2 text-sm">
          {tc("cancel")}
        </button>
        <button type="button" onClick={accept} disabled={!all || busy} className="btn-primary px-4 py-2 text-sm">
          {t("rulesAccept")}
        </button>
      </div>
    </Modal>
  );
}

const KEYS: TemplateKey[] = ["task", "reward", "game"];

/** Pick a starter wheel (or an empty one). Creates it and returns its id. */
export function WheelTemplatePicker({ onCreated, onCancel }: { onCreated: (id: string) => void; onCancel?: () => void }) {
  const t = useTranslations("wheel");
  const tc = useTranslations("common");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(template?: TemplateKey) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/wheels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(template ? { template } : {}),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.id) throw new Error(d?.error === "too_many" ? "too_many" : "failed");
      onCreated(d.id);
    } catch (e) {
      setError(e instanceof Error && e.message === "too_many" ? t("tooMany") : t("saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal label={t("pickTitle")}>
      <h2 className="text-lg font-extrabold text-brand-900">{t("pickTitle")}</h2>
      <p className="mt-1 text-sm text-brand-900/65">{t("pickIntro")}</p>
      <div className="mt-4 grid gap-2.5">
        {KEYS.map((k) => {
          const tpl = TEMPLATES[k];
          return (
            <button
              key={k}
              type="button"
              disabled={busy}
              onClick={() => create(k)}
              className="flex min-w-0 items-center gap-3 rounded-xl border border-brand-200 p-3 text-left hover:border-brand-400 hover:bg-brand-50 disabled:opacity-60"
            >
              <WheelPreview
                tasks={tpl.tasks.map((x, i) => ({ id: String(i), text: x.text, noAction: x.noAction === true }))}
                slots={1}
                removed={[]}
                className="h-16 w-16 shrink-0"
              />
              <span className="min-w-0 flex-1">
                <span className="block font-bold text-brand-900">{t(`tpl_${k}`)}</span>
                <span className="block text-xs text-brand-900/60">{t(`tplDesc_${k}`)}</span>
                <span className="mt-0.5 block truncate text-xs text-brand-900/50">
                  {tpl.tasks.map((x) => x.text).join(" · ")}
                </span>
              </span>
            </button>
          );
        })}
        <button
          type="button"
          disabled={busy}
          onClick={() => create()}
          className="rounded-xl border border-dashed border-brand-300 p-3 text-left text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-60"
        >
          {t("tplEmpty")}
        </button>
      </div>
      {error && <p className="mt-2 text-sm font-medium text-red-600">{error}</p>}
      {onCancel && (
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={onCancel} disabled={busy} className="btn-secondary px-4 py-2 text-sm">
            {tc("cancel")}
          </button>
        </div>
      )}
    </Modal>
  );
}
