"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

export type ChannelVerifyRow = {
  userId: string;
  displayName: string;
  username: string;
  platform: string;
  channelUrl: string;
  /** Pre-formatted on the server so nothing drifts on hydration. */
  dateText: string;
};

/** One request (pending) or one badge holder (verified) in /admin. */
export function ChannelVerifyAdminRow({
  row,
  mode,
  lookFor,
}: {
  row: ChannelVerifyRow;
  mode: "pending" | "verified";
  lookFor: string;
}) {
  const t = useTranslations("channelVerify");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function act(action: "approve" | "reject" | "revoke") {
    if (action === "revoke" && !confirm(t("adminRevokeConfirm", { name: row.displayName }))) return;
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch("/api/admin/channel-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: row.userId, action }),
      });
      if (res.ok) router.refresh();
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="card rounded-2xl p-4">
      <p className="font-semibold text-brand-900">
        {row.displayName} <span className="font-normal text-brand-900/55">@{row.username}</span>
      </p>
      <p className="mt-1 text-sm">
        {row.platform}:{" "}
        <a href={row.channelUrl} target="_blank" rel="noopener noreferrer" className="break-all text-brand-600 underline">
          {row.channelUrl}
        </a>
      </p>
      {mode === "pending" && (
        <p className="mt-1 text-sm text-brand-900/70">
          {t("adminLookFor")} <span className="break-all font-mono text-brand-900">{lookFor}</span>
        </p>
      )}
      <p className="mt-1 text-xs text-brand-900/55">{row.dateText}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {mode === "pending" ? (
          <>
            <button type="button" disabled={busy} onClick={() => act("approve")} className="btn-primary px-4 py-1.5 text-sm">
              {t("adminApprove")}
            </button>
            <button type="button" disabled={busy} onClick={() => act("reject")} className="btn-secondary px-4 py-1.5 text-sm">
              {t("adminReject")}
            </button>
          </>
        ) : (
          <button type="button" disabled={busy} onClick={() => act("revoke")} className="btn-secondary px-4 py-1.5 text-sm">
            {t("adminRevoke")}
          </button>
        )}
      </div>
      {failed && <p className="mt-2 text-xs font-medium text-red-600">{t("adminFailed")}</p>}
    </li>
  );
}
