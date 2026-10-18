import { get, set } from "idb-keyval";
import { useSyncExternalStore } from "react";
import type { Attachment, ChatMsg } from "./openclaw";
import type { Thread } from "./threads";

export type VaultAsset = Attachment & {
  id: string;
  source: string;
  threadId: string;
  origin: "attached" | "generated";
};
const KEY = "openclaw.vault.v1";
const EMPTY: VaultAsset[] = [];
let cache: VaultAsset[] = EMPTY;
let loaded = false;
let queue = Promise.resolve();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
export function mergeAssets(existing: VaultAsset[], entries: VaultAsset[]) {
  const byId = new Map(existing.map((a) => [a.id, a]));
  entries.forEach((a) => {
    const previous = byId.get(a.id);
    byId.set(a.id, {
      ...previous,
      ...a,
      size: a.size ?? previous?.size,
      createdAt: a.createdAt ?? previous?.createdAt,
      dataUrl: a.dataUrl || previous?.dataUrl || "",
    });
  });
  return [...byId.values()];
}
export async function loadVault() {
  if (loaded) return;
  const saved = await get<VaultAsset[]>(KEY);
  cache = Array.isArray(saved) ? saved : [];
  loaded = true;
  emit();
}
export function saveAssets(entries: VaultAsset[]) {
  queue = queue
    .catch(() => {})
    .then(async () => {
      await loadVault();
      const next = mergeAssets(cache, entries);
      await set(KEY, next);
      cache = next;
      emit();
    });
  return queue;
}
/** Retain generated files exposed through the authenticated same-origin proxy. */
export async function retainGeneratedFiles() {
  await queue.catch(() => {});
  await loadVault();
  const updates: VaultAsset[] = [];
  for (const asset of cache) {
    if (asset.origin !== "generated" || asset.dataUrl || !asset.url) continue;
    const url = new URL(asset.url, window.location.origin);
    if (url.origin !== window.location.origin) continue;
    try {
      const res = await fetch(url.href);
      if (!res.ok) continue;
      const blob = await res.blob();
      if (blob.type.includes("text/html") && !asset.mime.includes("text/html")) continue;
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      updates.push({
        ...asset,
        dataUrl,
        size: blob.size,
        mime: asset.mime === "application/octet-stream" ? blob.type || asset.mime : asset.mime,
      });
    } catch {
      /* Preserve the link when the proxy file is not available yet. */
    }
  }
  if (updates.length) await saveAssets(updates);
}
export const assetUrl = (a: Attachment) => a.dataUrl || a.url || "";
export function byteSize(data: string): number | undefined {
  if (!data.startsWith("data:")) return undefined;
  const [header, body = ""] = data.split(",", 2);
  if (header?.includes(";base64"))
    return (
      Math.floor((body.length * 3) / 4) - (body.endsWith("==") ? 2 : body.endsWith("=") ? 1 : 0)
    );
  try {
    return new TextEncoder().encode(decodeURIComponent(body)).length;
  } catch {
    return undefined;
  }
}
export function mimeFor(name: string) {
  const ext = name.split(".").at(-1)?.toLowerCase();
  return (
    (
      {
        mp3: "audio/mpeg",
        wav: "audio/wav",
        m4a: "audio/mp4",
        ogg: "audio/ogg",
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        webp: "image/webp",
        pdf: "application/pdf",
        txt: "text/plain",
        md: "text/markdown",
        csv: "text/csv",
        json: "application/json",
        mp4: "video/mp4",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        zip: "application/zip",
      } as Record<string, string>
    )[ext ?? ""] ?? "application/octet-stream"
  );
}
export function collectAssets(
  thread: Thread,
  messages: ChatMsg[] = [...thread.messages, ...(thread.comparisonMessages ?? [])],
): VaultAsset[] {
  return messages.flatMap((m) => {
    const attached = (m.attachments ?? []).map((a, i) => ({
      ...a,
      id: a.id ?? `${thread.id}:${m.id}:${i}`,
      size: a.size ?? byteSize(a.dataUrl),
      createdAt: a.createdAt ?? m.createdAt,
      source: thread.title,
      threadId: thread.id,
      origin: m.role === "user" ? ("attached" as const) : ("generated" as const),
    }));
    if (m.role !== "assistant") return attached;
    const links = [...m.content.matchAll(/!?\[([^\]]*)\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)].flatMap(
      (match): VaultAsset[] => {
        const url = match[2] ?? "";
        if (!/^(https?:\/\/|\/(?!\/)|data:)/i.test(url)) return [];
        const filename = decodeName(url.split(/[?#]/)[0]?.split("/").at(-1) ?? "");
        const mime = mimeFor(filename);
        if (mime === "application/octet-stream" && !match[0].startsWith("!")) return [];
        if (attached.some((a) => assetUrl(a) === url)) return [];
        return [
          {
            id: `${thread.id}:${m.id}:${url}`,
            name: filename || match[1] || "Generated image",
            mime,
            dataUrl: url.startsWith("data:") ? url : "",
            url,
            size: byteSize(url),
            createdAt: m.createdAt,
            source: thread.title,
            threadId: thread.id,
            origin: "generated",
          },
        ];
      },
    );
    return [...attached, ...links];
  });
}
function decodeName(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
export type AssetSort = "newest" | "oldest" | "name";
export function filterAssets(assets: VaultAsset[], query: string, sort: AssetSort) {
  const q = query.trim().toLowerCase();
  return assets
    .filter((a) =>
      `${a.name} ${a.mime} ${a.createdAt ? new Date(a.createdAt).toISOString() + " " + new Date(a.createdAt).toLocaleString() : ""}`
        .toLowerCase()
        .includes(q),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "oldest"
          ? (a.createdAt ?? Infinity) - (b.createdAt ?? Infinity)
          : (b.createdAt ?? 0) - (a.createdAt ?? 0),
    );
}
export function formatBytes(size?: number) {
  return size === undefined
    ? "Size unavailable"
    : size < 1024
      ? `${size} B`
      : size < 1048576
        ? `${(size / 1024).toFixed(1)} KB`
        : `${(size / 1048576).toFixed(1)} MB`;
}
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function downloadAsset(a: VaultAsset) {
  const url = assetUrl(a);
  if (!url) throw new Error("This older attachment has no retained file. Please attach it again.");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}).`);
  const blob = await res.blob();
  if (blob.type.includes("text/html") && !a.mime.includes("text/html"))
    throw new Error("The file link returned a page instead of a file.");
  downloadBlob(blob, a.name);
  await saveAssets([{ ...a, size: blob.size }]);
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export function useVault() {
  return useSyncExternalStore(
    subscribe,
    () => cache,
    () => EMPTY,
  );
}
