"use client";

import { useEffect, useState } from "react";

const POLL_MS = 4000;

type Todo = { items: { id: string; taskText: string; fan: string }[]; more: number };

/** The to-do OBS link: open wheel results (newest last), hidden when empty. */
export function TodoOverlayClient({ username, apiKey }: { username: string; apiKey: string }) {
  const [todo, setTodo] = useState<Todo | null>(null);

  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const res = await fetch(`/api/overlay/${username}/todo?key=${encodeURIComponent(apiKey)}`);
        if (!res.ok) return;
        const data: Todo = await res.json();
        if (active) setTodo(data);
      } catch {
        // ignore transient network errors
      }
    }
    poll();
    const iv = setInterval(poll, POLL_MS);
    return () => {
      active = false;
      clearInterval(iv);
    };
  }, [username, apiKey]);

  if (!todo || todo.items.length === 0) return null;
  const total = todo.items.length + todo.more;

  return (
    <div className="p-3">
      <div className="w-full max-w-[400px] rounded-2xl border-2 border-brand-500 bg-[#120c16]/85 p-3.5 text-white shadow-2xl">
        <p className="mb-2 text-base font-extrabold">ภารกิจค้างทำ ({total})</p>
        {todo.more > 0 && <p className="mb-1 text-xs text-white/55">+{todo.more} รายการก่อนหน้า</p>}
        <ul>
          {todo.items.map((i) => (
            <li key={i.id} className="flex items-baseline justify-between gap-3 border-b border-white/10 py-1.5 last:border-0">
              <span className="min-w-0 truncate text-[15px] font-semibold">{i.taskText}</span>
              <span className="shrink-0 truncate text-xs text-pink-200">{i.fan}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
