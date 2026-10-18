import type { Attachment } from "./openclaw";

export type VaultAsset = Attachment & {
  id: string;
  source: string;
  threadId: string;
  origin: "attached" | "generated";
};

/** The deployment proxy distinguishes JSON API requests from the /vault document. */
const ENDPOINT = "/vault";
export function serverAssetPath(value: string) {
  const url = new URL(value, window.location.origin);
  if (url.origin !== window.location.origin || !url.pathname.startsWith(`${ENDPOINT}/`))
    throw new Error("The Vault server returned an invalid file path.");
  return `${url.pathname}${url.search}`;
}

function normalizeAsset(value: unknown): VaultAsset {
  if (!value || typeof value !== "object") throw new Error("Invalid Vault file metadata.");
  const a = value as Record<string, unknown>;
  const name = a.name ?? a.filename;
  if (typeof a.id !== "string" || !a.id || typeof name !== "string" || !name)
    throw new Error("The Vault server returned a file without an ID or filename.");
  const rawDate = a.createdAt ?? a.created_at ?? a.uploaded_at;
  const date = typeof rawDate === "number" ? rawDate : typeof rawDate === "string" ? Date.parse(rawDate) : undefined;
  const rawUrl = a.url ?? a.download_url ?? a.path;
  return {
    id: a.id,
    name,
    mime: typeof (a.mime ?? a.mime_type) === "string" ? String(a.mime ?? a.mime_type) : "application/octet-stream",
    size: typeof a.size === "number" && Number.isFinite(a.size) && a.size >= 0 ? a.size : undefined,
    createdAt: date !== undefined && Number.isFinite(date) && Math.abs(date) <= 8640000000000000 ? date : undefined,
    url: serverAssetPath(typeof rawUrl === "string" ? rawUrl : `${ENDPOINT}/${encodeURIComponent(name)}`),
    dataUrl: "",
    source: typeof a.source === "string" ? a.source : "Vault upload",
    threadId: typeof (a.threadId ?? a.thread_id) === "string" ? String(a.threadId ?? a.thread_id) : "",
    origin: a.origin === "generated" ? "generated" : "attached",
  };
}

async function request(path: string, init: RequestInit = {}) {
  const res = await fetch(path, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json", ...init.headers },
  });
  if (!res.ok) {
    let detail = "";
    if (res.headers.get("content-type")?.includes("application/json")) {
      const body = await res.json().catch(() => null);
      if (typeof body?.message === "string") detail = ` ${body.message.slice(0, 200)}`;
    }
    throw new Error(`Vault request failed (${res.status}).${detail}`);
  }
  return res;
}

async function json(res: Response): Promise<unknown> {
  if (!res.headers.get("content-type")?.includes("application/json"))
    throw new Error("The Vault server returned a page instead of file data. Check the deployment’s Vault API routing.");
  return res.json();
}

export async function listVaultAssets() {
  const body = await json(await request(ENDPOINT));
  const list = Array.isArray(body) ? body : body && typeof body === "object" ? (body as Record<string, unknown>).assets ?? (body as Record<string, unknown>).files : undefined;
  if (!Array.isArray(list)) throw new Error("The Vault server returned an invalid file list.");
  return list.map(normalizeAsset);
}

export async function uploadVaultAsset(file: Blob, name: string, metadata: Partial<VaultAsset> = {}) {
  const form = new FormData();
  form.append("file", file, name);
  for (const key of ["id", "source", "threadId", "origin", "createdAt"] as const) {
    const value = metadata[key];
    if (value !== undefined) form.append(key, String(value));
  }
  const body = await json(await request(ENDPOINT, {
    method: "POST",
    body: form,
    headers: metadata.id ? { "Idempotency-Key": metadata.id } : {},
  }));
  const value = body && typeof body === "object" && "asset" in body ? body.asset : body;
  return normalizeAsset(value);
}

export async function deleteVaultAsset(id: string) {
  await request(`${ENDPOINT}/${encodeURIComponent(id)}`, { method: "DELETE" });
}