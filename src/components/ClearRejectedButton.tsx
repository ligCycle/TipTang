"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export function ClearRejectedButton({ count }: { count: number }) {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function clearAll() {
    if (!window.confirm(t("clearRejectedConfirm", { count }))) return;
    setLoading(true);
    try {
      const res = await fetch("/api/tips", { method: "DELETE" });
      if (res.ok) {
        router.refresh();
        return;
      }
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={clearAll}
      disabled={loading}
      className="rounded-full border border-rose-200 px-3 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
    >
      🗑 {t("clearRejected")}
    </button>
  );
}
