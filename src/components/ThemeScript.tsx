"use client";

import { useSyncExternalStore } from "react";

// Runs before first paint to set data-theme (and mark JS as available), so a
// dark-mode visitor never sees a light flash. Inline on purpose: next/script's
// beforeInteractive queues inline code behind Next's own bootstrap, which is
// after paint.
const THEME_SCRIPT = `(function(){document.documentElement.classList.add('js');try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

const subscribe = () => () => {};

/**
 * The inline theme script, emitted only in server-rendered HTML.
 *
 * The [locale] layout remounts on the client when the locale changes (and on
 * the way back from a 404). React 19 never executes a <script> it creates
 * during a client render and warns about it — and there is nothing for it to
 * do anyway, because ThemeToggle re-applies the theme on every navigation.
 * useSyncExternalStore gives us the "am I hydrating server HTML?" bit: the
 * server snapshot is used during SSR and hydration, the client snapshot for
 * every later render, so a fresh client mount renders nothing.
 */
export function ThemeScript() {
  const serverRendered = useSyncExternalStore(
    subscribe,
    () => false,
    () => true,
  );
  if (!serverRendered) return null;
  return <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />;
}
