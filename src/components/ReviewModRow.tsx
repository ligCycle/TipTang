"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

type Review = {
  id: string;
  name: string;
  rating: number;
  comment: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
};

const STATUS_STYLES: Record<Review["status"], string> = {
  PENDING: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-gray-200 text-gray-600",
};

export function ReviewModRow({ review }: { review: Review }) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const statusLabel = {
    PENDING: t("statusPending"),
    APPROVED: t("statusApproved"),
    REJECTED: t("statusRejected"),
  }[review.status];

  async function act(action: "approve" | "reject") {
    setLoading(true);
    try {
      const res = await fetch(`/api/reviews/${review.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <li className="card rounded-2xl p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-amber-400">
          {"★".repeat(review.rating)}
          <span className="text-brand-900/20">{"★".repeat(5 - review.rating)}</span>
        </span>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[review.status]}`}
        >
          {statusLabel}
        </span>
      </div>
      <p className="mt-2 text-brand-900/80">{review.comment}</p>
      <p className="mt-1 text-sm font-semibold text-brand-700">
        — {review.name || "—"}
      </p>
      {review.status === "PENDING" && (
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => act("reject")}
            disabled={loading}
            className="rounded-full border border-gray-300 px-3 py-1 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
          >
            {t("reject")}
          </button>
          <button
            onClick={() => act("approve")}
            disabled={loading}
            className="rounded-full bg-emerald-600 px-3 py-1 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {t("approve")}
          </button>
        </div>
      )}
    </li>
  );
}
