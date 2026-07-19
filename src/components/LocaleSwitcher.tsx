"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { useTransition } from "react";

export function LocaleSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function switchTo(next: string) {
    if (next === locale) return;
    startTransition(() => {
      // usePathname() from next-intl is locale-agnostic; router keeps the path.
      router.replace(pathname, { locale: next as (typeof routing.locales)[number] });
    });
  }

  return (
    <div className="flex items-center rounded-full border border-brand-900/15 bg-brand-50/60 p-0.5 text-xs font-semibold">
      {routing.locales.map((l) => (
        <button
          key={l}
          onClick={() => switchTo(l)}
          disabled={isPending}
          className={`rounded-full px-2.5 py-1 uppercase transition ${
            l === locale
              ? "bg-brand-600 text-white"
              : "text-brand-800 hover:bg-brand-100"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
