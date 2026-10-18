import { useSyncExternalStore } from "react";
import type { Attachment, ChatMsg } from "./openclaw";
import type { Thread } from "./threads";
import { deleteVaultAsset, listVaultAssets, serverAssetPath, uploadVaultAsset, type VaultAsset } from "./vault-api";
export type { VaultAsset } from "./vault-api";

const EMPTY: VaultAsset[] = [];
let cache: VaultAsset[] = EMPTY;
let queue = Promise.resolve();
const collected = new Set<string>();
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
  await queue.catch(() => {});
  cache = await listVaultAssets();
  emit();
}
export function saveAssets(entries: VaultAsset[]) {
  queue = queue
    .catch(() => {})
    .then(async () => {
      for (const asset of entries) {
        if (collected.has(asset.id)) continue;
        const source = assetUrl(asset);
        if (!source) continue;
        const url = new URL(source, window.location.origin);
        if (url.protocol !== "data:" && url.origin !== window.location.origin)
          throw new Error("Only files from your OpenClaw server can be collected into the Vault.");
        if (!asset.dataUrl && url.pathname.startsWith("/vault/")) {
          collected.add(asset.id);
          continue; // Already owned by the server Vault; never re-upload deleted files.
        }
        const res = await fetch(source, { credentials: "same-origin" });
        if (!res.ok) throw new Error(`The generated file could not be collected (${res.status}).`);
        const blob = await res.blob();
        if (blob.type.includes("text/html") && !asset.mime.includes("text/html"))
          throw new Error("The generated file link returned a page instead of a file.");
        const saved = await uploadVaultAsset(blob, asset.name, asset);
        collected.add(asset.id);
        cache = mergeAssets(cache, [saved]);
        emit();
      }
    });
  return queue;
}
export async function uploadFile(file: File, metadata: Partial<VaultAsset> = {}) {
  const saved = await uploadVaultAsset(file, file.name, metadata);
  if (metadata.id) collected.add(metadata.id);
  collected.add(saved.id);
  cache = mergeAssets(cache, [saved]);
  emit();
  return saved;
}
export async function deleteAsset(asset: VaultAsset) {
  await queue.catch(() => {});
  await deleteVaultAsset(asset.id);
  collected.add(asset.id);
  cache = cache.filter((a) => a.id !== asset.id);
  emit();
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
export function downloadAssetPath(a: VaultAsset) {
  return serverAssetPath(a.url || `/vault/${encodeURIComponent(a.name)}`);
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
