"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

type Report = {
  id: string;
  username: string;
  email: string;
  category: string;
  message: string;
  status: "OPEN" | "RESOLVED";
  createdAt: string;
};

export function ReportAdminRow({
  report,
  locale,
}: {
  report: Report;
  locale: string;
}) {
  const t = useTranslations("report");
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function act(action: "resolve" | "reopen") {
    setBusy(true);
    try {
      const res = await fetch(`/api/reports/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const date = new Date(report.createdAt).toLocaleString(
    locale === "th" ? "th-TH" : "en-US",
    { dateStyle: "medium", timeStyle: "short" },
  );

  return (
    <li className="card rounded-2xl p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-700">
          {t(`category_${report.category}`)}
        </span>
        {report.status === "RESOLVED" && (
          <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
            {t("statusResolved")}
          </span>
        )}
        <span className="ml-auto text-xs text-brand-900/45">{date}</span>
      </div>

      <p className="mt-2 whitespace-pre-wrap text-brand-900/80">
        {report.message}
      </p>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-brand-900/10 pt-2">
        <span className="truncate text-xs text-brand-900/55">
          {report.username} · {report.email}
        </span>
        {report.status === "OPEN" ? (
          <button
            onClick={() => act("resolve")}
            disabled={busy}
            className="shrink-0 rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-700"
          >
            {busy ? t("processing") : t("markResolved")}
          </button>
        ) : (
          <button
            onClick={() => act("reopen")}
            disabled={busy}
            className="shrink-0 text-xs font-medium text-brand-900/50 hover:underline"
          >
            {busy ? t("processing") : t("reopen")}
          </button>
        )}
      </div>
    </li>
  );
}
