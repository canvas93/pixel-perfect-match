import { useSyncExternalStore } from "react";
import type { ChatMsg } from "./openclaw";

export type Thread = {
  id: string;
  title: string;
  agent: string;
  updatedAt: number;
  messages: ChatMsg[];
  /** Set for follow-up chats about an automation job */
  jobId?: string;
};

const KEY = "openclaw.threads.v1";
let cache: Thread[] | null = null;
const listeners = new Set<() => void>();
const EMPTY: Thread[] = [];

function load(): Thread[] {
  if (cache) return cache;
  if (typeof window === "undefined") return EMPTY;
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    cache = Array.isArray(stored) ? stored.map((t: Thread) => ({ ...t, agent: t.agent === "default" ? "adin" : t.agent })) : [];
  } catch {
    cache = [];
  }
  return cache ?? EMPTY;
}

function save(next: Thread[]) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // quota exceeded (large attachments) — strip attachment data and retry
    const slim = next.map((t) => ({
      ...t,
      messages: t.messages.map((m) => ({
        ...m,
        attachments: m.attachments?.map((a) => ({ ...a, dataUrl: "" })),
      })),
    }));
    try { localStorage.setItem(KEY, JSON.stringify(slim)); } catch {}
  }
  listeners.forEach((l) => l());
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const threads = {
  all: load,
  get: (id: string) => load().find((t) => t.id === id),
  create(partial: Partial<Thread> = {}): Thread {
    const t: Thread = { id: uid(), title: "New chat", agent: "adin", updatedAt: Date.now(), messages: [], ...partial };
    save([t, ...load()]);
    return t;
  },
  ensure(id: string, partial: Partial<Thread> = {}): Thread {
    const existing = threads.get(id);
    if (existing) return existing;
    return threads.create({ ...partial, id });
  },
  update(id: string, fn: (t: Thread) => Thread) {
    save(load().map((t) => (t.id === id ? { ...fn(t), updatedAt: Date.now() } : t)));
  },
  remove(id: string) {
    save(load().filter((t) => t.id !== id));
  },
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) { cache = null; l(); }
  };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(l); window.removeEventListener("storage", onStorage); };
};

export function useThreads(): Thread[] {
  return useSyncExternalStore(subscribe, load, () => EMPTY);
}
export function useThread(id: string): Thread | undefined {
  const all = useThreads();
  return all.find((t) => t.id === id);
}
