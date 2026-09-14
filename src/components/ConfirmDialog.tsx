"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

/**
 * Themed replacement for window.confirm(). Built on the native <dialog>:
 * showModal() gives us the backdrop, focus trapping and Escape handling for
 * free, so there is no portal, no focus-trap library and no z-index fight.
 *
 * The parent owns `open`. Escape and backdrop clicks call onCancel. The
 * confirm button is focused on open so Enter confirms, like the native box.
 */
export function ConfirmDialog({
  open,
  message,
  confirmLabel,
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  /** The question itself — the existing confirm strings already read as one. */
  message: string;
  confirmLabel: string;
  /** Rose button for destructive actions (delete). Default = brand colour. */
  danger?: boolean;
  /** While the action runs: buttons disabled, Escape/backdrop ignored. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const tc = useTranslations("common");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Mirror the `open` prop onto the native element. React's autoFocus prop
  // only fires on mount (while the dialog is still closed), so focus the
  // confirm button by hand right after showModal().
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      confirmRef.current?.focus();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      // Fires on Escape. Block it while busy so the action can't be orphaned.
      onCancel={(e) => {
        if (busy) e.preventDefault();
      }}
      // Fires after any close. If the parent still thinks we're open, the
      // user closed it (Escape) — tell the parent. If the parent already set
      // open=false, the effect above closed it and there's nothing to do.
      onClose={() => {
        if (open) onCancel();
      }}
      // The dialog itself has no padding, so a click whose target is the
      // dialog element (not the panel inside) is a click on the backdrop.
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
      className="card w-[min(92vw,26rem)] rounded-2xl border-0 p-0 text-brand-900 backdrop:bg-black/50 backdrop:backdrop-blur-sm"
    >
      <div className="p-6">
        <p className="text-base font-semibold leading-relaxed">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="btn-secondary px-4 py-2 text-sm"
          >
            {tc("cancel")}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`${danger ? "btn-danger" : "btn-primary"} px-4 py-2 text-sm`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
