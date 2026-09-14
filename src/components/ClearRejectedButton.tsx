"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/Icon";
import { ConfirmDialog } from "@/components/ConfirmDialog";

export function ClearRejectedButton({ count }: { count: number }) {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  // Runs after the creator confirms in the dialog.
  async function clearAll() {
    setLoading(true);
    try {
      const res = await fetch("/api/tips", { method: "DELETE" });
      if (res.ok) {
        router.refresh();
        return;
      }
      setLoading(false);
      setOpen(false);
    } catch {
      setLoading(false);
      setOpen(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 px-3 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
      >
        <Icon name="trash" className="h-3.5 w-3.5" />
        {t("clearRejected")}
      </button>
      <ConfirmDialog
        open={open}
        message={t("clearRejectedConfirm", { count })}
        confirmLabel={t("clearRejected")}
        danger
        busy={loading}
        onConfirm={clearAll}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
