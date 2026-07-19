"use client";

import { useState } from "react";

export function CopyLink({
  path,
  label,
  copiedLabel,
}: {
  path: string;
  label: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url =
      typeof window !== "undefined" ? window.location.origin + path : path;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore clipboard errors
    }
  }

  return (
    <button
      onClick={copy}
      className="rounded-full bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700"
    >
      {copied ? copiedLabel : label}
    </button>
  );
}
