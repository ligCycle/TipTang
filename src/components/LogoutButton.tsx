"use client";

import { signOut } from "next-auth/react";
import { useTransition } from "react";

export function LogoutButton({ label }: { label: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      onClick={() =>
        startTransition(async () => {
          await signOut({ redirectTo: "/" });
        })
      }
      disabled={isPending}
      className="rounded-full px-3 py-1.5 text-sm font-medium text-brand-800 hover:bg-brand-100 disabled:opacity-50"
    >
      {label}
    </button>
  );
}
