"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { ChannelVerifyStatus, VerifiableLink } from "@/lib/channel-verify";
import { BadgeStar } from "@/components/VerifiedBadge";

/**
 * Profile page card: ask for the channel-owner badge on one saved channel
 * link, see where the request stands, cancel it or drop the badge.
 * `status` is null when there is no request, or the stored one no longer
 * matches the saved link (the server checks that before passing it in).
 */
export function ChannelVerifyCard({
  links,
  linkToPaste,
  status,
  platform,
}: {
  links: VerifiableLink[];
  /** e.g. "tiptang.com/slowmojichannel" */
  linkToPaste: string;
  status: ChannelVerifyStatus | null;
  /** Label of the platform the current request is for. */
  platform: string | null;
}) {
  const t = useTranslations("channelVerify");
  const router = useRouter();
  const [key, setKey] = useState<string>(links[0]?.key ?? "");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  async function send(method: "POST" | "DELETE") {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch("/api/channel-verify", {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "POST" ? JSON.stringify({ key }) : undefined,
      });
      if (res.ok) router.refresh();
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(`https://${linkToPaste}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked: the link is on screen to copy by hand
    }
  }

  const showForm = status === null || status === "REJECTED";

  return (
    <section className="card mt-6 rounded-3xl p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-lg font-bold text-brand-900">
        <BadgeStar className="text-xl" />
        {t("cardTitle")}
      </h2>
      <p className="mt-1 text-sm text-brand-900/70">{t("cardIntro")}</p>

      {status === "PENDING" && (
        <div className="mt-4">
          <p className="font-semibold text-brand-900">{t("cardPending", { platform: platform ?? "" })}</p>
          <p className="mt-1 text-sm text-brand-900/70">{t("cardPendingHint")}</p>
          <button type="button" disabled={busy} onClick={() => send("DELETE")} className="btn-secondary mt-3 px-4 py-1.5 text-sm">
            {t("cardCancel")}
          </button>
        </div>
      )}

      {status === "VERIFIED" && (
        <div className="mt-4">
          <p className="flex items-center gap-1.5 font-semibold text-brand-900">
            <BadgeStar />
            {t("cardVerified", { platform: platform ?? "" })}
          </p>
          <p className="mt-1 text-sm text-brand-900/70">{t("cardVerifiedHint")}</p>
          <button type="button" disabled={busy} onClick={() => send("DELETE")} className="btn-secondary mt-3 px-4 py-1.5 text-sm">
            {t("cardRemove")}
          </button>
        </div>
      )}

      {status === "REJECTED" && <p className="mt-4 text-sm font-medium text-red-600">{t("cardRejected")}</p>}

      {showForm &&
        (links.length === 0 ? (
          <p className="mt-4 text-sm text-brand-900/70">{t("cardNoLinks")}</p>
        ) : (
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-brand-900/80">{t("cardPick")}</span>
              <select value={key} onChange={(e) => setKey(e.target.value)} className="input">
                {links.map((l) => (
                  <option key={l.key} value={l.key}>
                    {l.label}: {l.url}
                  </option>
                ))}
              </select>
            </label>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-brand-900/80">
              <li>
                {t("cardStep1")}
                <span className="mt-1 flex flex-wrap items-center gap-2">
                  <code className="rounded-lg bg-brand-50 px-2 py-1 text-brand-900">{linkToPaste}</code>
                  <button type="button" onClick={copy} className="btn-secondary px-3 py-1 text-xs">
                    {copied ? t("cardCopied") : t("cardCopy")}
                  </button>
                </span>
              </li>
              <li>{t("cardStep2")}</li>
            </ol>
            <button type="button" disabled={busy || !key} onClick={() => send("POST")} className="btn-primary px-5 py-2 text-sm">
              {t("cardRequest")}
            </button>
          </div>
        ))}

      {failed && <p className="mt-2 text-xs font-medium text-red-600">{t("cardFailed")}</p>}
    </section>
  );
}
