"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

type Template = "NO_PROMPTPAY" | "NO_OVERLAY";

/**
 * "ส่งเตือน" for a stuck creator (once, ever) or "ทดสอบ" on the admin's own
 * row (preview a template, records nothing). The sent state is derived from
 * the server-provided `sentLabel`, so a refresh shows the truth, not local
 * state; after a successful send we refresh the page for the same reason.
 */
export function NudgeButton({
  userId,
  sentLabel,
  mode,
  template,
}: {
  userId: string;
  /** Server-formatted "ส่งแล้ว 20 ก.ย." or null when never sent. */
  sentLabel: string | null;
  mode: "send" | "test";
  /** Which preview to send; required when mode === "test". */
  template?: Template;
}) {
  const t = useTranslations("admin.activation");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (mode === "send" && sentLabel) {
    return <span className="text-xs text-brand-900/50">{sentLabel}</span>;
  }

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/activation-nudge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "test" ? { userId, test: true, template } : { userId },
        ),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        setDone(true);
        if (mode === "send") router.refresh();
        return;
      }
      if (data.error === "already_sent") {
        router.refresh();
        return;
      }
      setError(t(data.error === "send_failed" ? "sendFailed" : "sendError"));
    } catch {
      setError(t("sendError"));
    } finally {
      setBusy(false);
    }
  }

  const label =
    mode === "test"
      ? done
        ? t("testSent")
        : t(template === "NO_PROMPTPAY" ? "testNoPromptpay" : "testNoOverlay")
      : done
        ? t("sending")
        : t("send");

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={send}
        disabled={busy || (mode === "send" && done)}
        className="rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {busy ? t("sending") : label}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
