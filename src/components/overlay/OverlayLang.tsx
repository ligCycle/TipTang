"use client";

import { createContext, useContext, type ReactNode } from "react";
import { OVERLAY_TEXT, type OverlayLang, type OverlayText } from "@/lib/overlay-text";

const OverlayLangContext = createContext<OverlayLang>("th");

/** Each OBS page sets the creator's overlay language (src/lib/overlay-text.ts) once, at the top. */
export function OverlayLangProvider({ lang, children }: { lang: OverlayLang; children: ReactNode }) {
  return <OverlayLangContext.Provider value={lang}>{children}</OverlayLangContext.Provider>;
}

/** The overlay's words in the creator's language (Thai outside a provider). */
export function useOverlayText(): OverlayText {
  return OVERLAY_TEXT[useContext(OverlayLangContext)];
}
