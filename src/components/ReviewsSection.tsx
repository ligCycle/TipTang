"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

export type PublicReview = {
  id: string;
  name: string;
  rating: number;
  comment: string;
};

function Stars({
  value,
  onChange,
  size = "text-xl",
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: string;
}) {
  return (
    <div className={`flex ${size}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(n)}
          className={`${onChange ? "cursor-pointer" : "cursor-default"} leading-none ${
            n <= value ? "text-amber-400" : "text-brand-900/20"
          }`}
          aria-label={`${n} star`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export function ReviewsSection({
  reviews,
  average,
  count,
}: {
  reviews: PublicReview[];
  average: number;
  count: number;
}) {
  const t = useTranslations("reviews");
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (rating < 1) {
      setError(t("ratingRequired"));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, rating, comment }),
      });
      if (!res.ok) {
        setError(t("error"));
        return;
      }
      setDone(true);
    } catch {
      setError(t("error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-brand-900">{t("title")}</h2>
          {count > 0 && (
            <div className="mt-1 flex items-center gap-2">
              <Stars value={Math.round(average)} size="text-base" />
              <span className="text-sm text-brand-900/60">
                {t("ratingSummary", { rating: average.toFixed(1), count })}
              </span>
            </div>
          )}
        </div>
        {!open && !done && (
          <button onClick={() => setOpen(true)} className="btn-secondary">
            {t("writeButton")}
          </button>
        )}
      </div>

      {/* Submit form */}
      {done ? (
        <div className="card mb-6 rounded-2xl p-6 text-center">
          <p className="text-lg font-bold text-brand-900">{t("successTitle")}</p>
          <p className="mt-1 text-brand-900/70">{t("successMessage")}</p>
        </div>
      ) : (
        open && (
          <form onSubmit={submit} className="card mb-6 space-y-4 rounded-2xl p-6">
            <h3 className="font-bold text-brand-900">{t("formTitle")}</h3>
            <div>
              <span className="mb-1 block text-sm font-medium text-brand-900/80">
                {t("ratingLabel")}
              </span>
              <Stars value={rating} onChange={setRating} />
            </div>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-brand-900/80">
                {t("nameLabel")}
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("namePlaceholder")}
                maxLength={60}
                className="input"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-brand-900/80">
                {t("commentLabel")}
              </span>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={t("commentPlaceholder")}
                maxLength={500}
                rows={3}
                required
                className="input resize-none"
              />
            </label>
            {error && <p className="text-sm font-medium text-red-600">{error}</p>}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="btn-secondary flex-1"
              >
                {t("cancel")}
              </button>
              <button type="submit" disabled={loading} className="btn-primary flex-1">
                {loading ? t("submitting") : t("submit")}
              </button>
            </div>
          </form>
        )
      )}

      {/* Approved reviews */}
      {reviews.length === 0 ? (
        <p className="card rounded-2xl p-6 text-center text-brand-900/60">
          {t("empty")}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {reviews.map((r) => (
            <div key={r.id} className="card rounded-2xl p-5">
              <Stars value={r.rating} size="text-base" />
              <p className="mt-2 text-brand-900/80">{r.comment}</p>
              <p className="mt-2 text-sm font-semibold text-brand-700">
                — {r.name || t("namePlaceholder")}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
