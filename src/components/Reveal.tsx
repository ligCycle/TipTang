"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Fade-and-rise a block the first time it scrolls into view. Pure class
 * toggling through a ref — no state — so it never re-renders its children
 * and stays clear of the set-state-in-effect lint rule. The hidden start
 * state lives in CSS under `html.js`, so without JS nothing is hidden.
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        el.classList.add("is-in");
        observer.disconnect(); // once is enough
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
