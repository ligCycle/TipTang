"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";

// Reusable color control: preset swatches + native picker + hex field.
// Used by both the alert-card color and the goal-bar color so they match.
export function ColorField({
  value,
  fallback,
  presets,
  label,
  codeLabel,
  resetLabel,
  defaultLabel,
  onSave,
  onReset,
}: {
  value: string | null; // stored color (null = using the fallback/default)
  fallback: string; // color shown when value is null
  presets: string[];
  label: string;
  codeLabel: string;
  resetLabel: string;
  defaultLabel: string;
  onSave: (hex: string) => void;
  onReset: () => void;
}) {
  const active = value ?? fallback;
  const [hexInput, setHexInput] = useState(active);

  useEffect(() => {
    setHexInput(active);
  }, [active]);

  function onHexChange(raw: string) {
    let v = raw.trim();
    if (v && !v.startsWith("#")) v = "#" + v;
    v = v.slice(0, 7);
    setHexInput(v);
    if (/^#[0-9a-fA-F]{6}$/.test(v)) onSave(v.toLowerCase());
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-medium text-brand-900/80">
          <Icon name="palette" />
          {label}
        </span>
        {value ? (
          <button
            onClick={onReset}
            className="text-xs font-medium text-brand-900/50 hover:text-red-600 hover:underline"
          >
            ↺ {resetLabel}
          </button>
        ) : (
          <span className="text-xs text-brand-900/45">{defaultLabel}</span>
        )}
      </div>

      {/* Preset swatches */}
      <div className="mb-3 flex flex-wrap gap-2">
        {presets.map((c) => {
          const selected = active.toLowerCase() === c;
          return (
            <button
              key={c}
              type="button"
              onClick={() => onSave(c)}
              aria-label={c}
              title={c}
              className={`h-7 w-7 rounded-full ring-offset-2 ring-offset-brand-50 transition hover:scale-110 ${
                selected ? "ring-2 ring-brand-900/60" : "ring-1 ring-black/10"
              }`}
              style={{ backgroundColor: c }}
            />
          );
        })}
      </div>

      {/* Custom picker + hex code */}
      <div className="flex items-center gap-2">
        <label className="relative h-9 w-9 shrink-0 cursor-pointer overflow-hidden rounded-full ring-1 ring-black/10">
          <span
            className="block h-full w-full"
            style={{ backgroundColor: active }}
          />
          <input
            type="color"
            value={active}
            onChange={(e) => onSave(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label={label}
          />
        </label>
        <div className="flex items-center rounded-lg border border-brand-200 bg-white pl-2.5 focus-within:ring-2 focus-within:ring-brand-400 dark:bg-[#241019]">
          <span className="font-mono text-sm text-brand-900/40">#</span>
          <input
            type="text"
            value={hexInput.replace(/^#/, "")}
            onChange={(e) => onHexChange(e.target.value)}
            placeholder={fallback.replace(/^#/, "")}
            spellCheck={false}
            maxLength={7}
            className="w-24 bg-transparent py-1.5 pl-1 pr-2.5 font-mono text-sm uppercase text-brand-900 outline-none"
            aria-label={codeLabel}
          />
        </div>
      </div>
    </div>
  );
}
