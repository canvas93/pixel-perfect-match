// Client for the OpenClaw backend. All calls are relative so the local
// reverse proxy handles auth and routing.

export const AGENTS = [
  { id: "adin", label: "adin", note: "Default" },
  { id: "support", label: "support" },
  { id: "sales-operations", label: "sales-operations" },
  { id: "ops", label: "ops" },
  { id: "research-content", label: "research-content" },
  { id: "koko", label: "koko" },
  { id: "mandarin", label: "mandarin" },
] as const;

export type AgentId = (typeof AGENTS)[number]["id"];
export const modelFor = (agent: string) => `openclaw/${agent === "default" ? "adin" : agent}`;

export type Attachment = {
  name: string;
  mime: string;
  dataUrl: string; // base64 data URL
  id?: string;
  size?: number | undefined;
  createdAt?: number | undefined;
  url?: string;
};

export type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: Attachment[] | undefined;
  error?: string | undefined;
  createdAt?: number | undefined;
  agent?: string;
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function readError(res: Response): Promise<ApiError> {
  let detail = "";
  try {
    const text = await res.text();
    try {
      const j = JSON.parse(text);
      detail = j?.error?.message || j?.message || j?.error || text;
    } catch {
      detail = text;
    }
  } catch {}
  const base =
    res.status === 404
      ? "Endpoint not found (404). Is the OpenClaw proxy running?"
      : res.status >= 500
        ? `Server error (${res.status}).`
        : res.status === 401 || res.status === 403
          ? `Not authorized (${res.status}).`
          : `Request failed (${res.status}).`;
  if (/^\s*</.test(String(detail))) detail = "";
  return new ApiError(res.status, detail ? `${base} ${String(detail).slice(0, 300)}` : base);
}

async function* sse(res: Response): AsyncGenerator<{ event?: string | undefined; data: string }> {
  if (!res.body) throw new ApiError(0, "The OpenClaw server returned an empty stream.");
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    let separator;
    while ((separator = /\r?\n\r?\n/.exec(buf)) !== null) {
      idx = separator.index;
      const raw = buf.slice(0, idx);
      buf = buf.slice(idx + separator[0].length);
      let event: string | undefined;
      const data: string[] = [];
      for (const line of raw.split(/\r?\n/)) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
      }
      if (data.length) yield { event, data: data.join("\n") };
    }
  }
}

function toChatCompletionMessages(history: ChatMsg[]) {
  return history.map((m) => {
    const imgs = (m.attachments ?? []).filter((a) => a.mime.startsWith("image/"));
    if (m.role === "user" && imgs.length) {
      return {
        role: "user",
        content: [
          { type: "text", text: m.content },
          ...imgs.map((a) => ({ type: "image_url", image_url: { url: a.dataUrl } })),
        ],
      };
    }
    return { role: m.role, content: m.content };
  });
}

function toResponsesInput(history: ChatMsg[]) {
  return history.map((m) => {
    if (m.role === "assistant") return { role: "assistant", content: m.content };
    const parts: unknown[] = [{ type: "input_text", text: m.content }];
    for (const a of m.attachments ?? []) {
      if (a.mime.startsWith("image/")) parts.push({ type: "input_image", image_url: a.dataUrl });
      else parts.push({ type: "input_file", filename: a.name, file_data: a.dataUrl });
    }
    return { role: "user", content: parts };
  });
}

/**
 * Streams an assistant reply. Uses /v1/responses when any document is attached
 * anywhere in the history, otherwise /v1/chat/completions.
 */
export async function streamReply(opts: {
  agent: string;
  sessionId: string;
  history: ChatMsg[];
  system?: string | undefined;
  signal?: AbortSignal;
  onDelta: (text: string) => void;
  onAssets?: (assets: Attachment[]) => void;
}) {
  const { agent, sessionId, history, signal, onDelta, system } = opts;
  const hasDocs = history.some((m) => m.attachments?.some((a) => !a.mime.startsWith("image/")));
  const user = `conv:${sessionId}`;
  const model = modelFor(agent);

  let res: Response;
  try {
    if (hasDocs) {
      res = await fetch("/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({
          model,
          user,
          stream: true,
          ...(system ? { instructions: system } : {}),
          input: toResponsesInput(history),
        }),
        signal: signal ?? null,
      });
    } else {
      const messages = toChatCompletionMessages(history);
      res = await fetch("/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({
          model,
          user,
          stream: true,
          messages: system ? [{ role: "system", content: system }, ...messages] : messages,
        }),
        signal: signal ?? null,
      });
    }
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, "Network error — could not reach the OpenClaw server.");
  }
  if (!res.ok) throw await readError(res);

  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("event-stream")) {
    // Non-streaming fallback
    const j = await res.json();
    opts.onAssets?.(responseAssets(j));
    const text =
      j?.choices?.[0]?.message?.content ??
      j?.output_text ??
      j?.output
        ?.flatMap((o: any) => o.content ?? [])
        .map((c: any) => c.text ?? "")
        .join("") ??
      "";
    onDelta(text);
    return;
  }

  try {
    for await (const { event, data } of sse(res)) {
      if (data === "[DONE]") break;
      let j: any;
      try {
        j = JSON.parse(data);
      } catch {
        continue;
      }
      if (j.error) throw new ApiError(500, j.error.message ?? String(j.error));
      opts.onAssets?.(responseAssets(j));
      const type = j.type ?? event;
      if (type === "response.output_text.delta" && j.delta) onDelta(j.delta);
      else if (type === "response.failed" || type === "error")
        throw new ApiError(500, j.response?.error?.message ?? j.message ?? "Stream failed");
      else {
        const d = j.choices?.[0]?.delta?.content;
        if (d) onDelta(d);
      }
    }
  } catch (e) {
    if ((e as Error).name === "AbortError" || e instanceof ApiError) throw e;
    throw new ApiError(0, "Connection dropped while streaming the reply.");
  }
}

/** File parts emitted by OpenClaw's chat or Responses API. */
export function responseAssets(payload: any): Attachment[] {
  const message = payload?.choices?.[0]?.message ?? payload?.choices?.[0]?.delta;
  const parts = [
    ...(payload?.attachments ?? []),
    ...(message?.attachments ?? []),
    ...(message?.images ?? []),
    ...(payload?.output ?? []).flatMap((o: any) => [o, ...(o.content ?? [])]),
    ...(payload?.item ? [payload.item, ...(payload.item.content ?? [])] : []),
  ];
  return parts.flatMap((part: any): Attachment[] => {
    const url = part.url ?? part.file_url ?? part.image_url?.url;
    if (typeof url !== "string" || !/^(https?:\/\/|\/(?!\/)|data:)/i.test(url)) return [];
    return [
      {
        name:
          part.filename ??
          part.name ??
          url.split(/[/?#]/).filter(Boolean).at(-1) ??
          "Generated file",
        mime: part.mime_type ?? part.mime ?? "application/octet-stream",
        dataUrl: url.startsWith("data:") ? url : "",
        url,
        ...(typeof part.size === "number" ? { size: part.size } : {}),
      },
    ];
  });
}

/** Admin RPC call (/api/v1/admin/rpc). */
export async function rpc<T = any>(
  method: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch("/api/v1/admin/rpc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
    });
  } catch {
    throw new ApiError(0, "Network error — could not reach the OpenClaw admin API.");
  }
  if (!res.ok) throw await readError(res);
  let j;
  try {
    j = await res.json();
  } catch {
    throw new ApiError(
      res.status,
      "OpenClaw admin API returned an invalid response. Check that /api/v1/admin/rpc is routed to your OpenClaw server.",
    );
  }
  if (j?.error) throw new ApiError(res.status, j.error.message ?? String(j.error));
  return (j && Object.hasOwn(j, "result") ? j.result : j) as T;
}

function rpcArray<T>(result: unknown, keys: string[]): T[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object") {
    const record = result as Record<string, unknown>;
    for (const key of keys) {
      if (Array.isArray(record[key])) return record[key] as T[];
    }
  }
  throw new ApiError(200, "OpenClaw returned an unexpected list response.");
}

export async function listCronJobs(): Promise<CronJob[]> {
  return rpcArray<CronJob>(await rpc("cron.list", {}), ["jobs", "items"]);
}

export async function listCronRuns(jobId: string): Promise<CronRun[]> {
  return rpcArray<CronRun>(await rpc("cron.runs", { id: jobId, limit: 50 }), [
    "entries",
    "runs",
    "items",
  ]);
}

export function runCronJob(jobId: string) {
  return rpc("cron.run", { id: jobId, mode: "force" });
}

export type CronJob = {
  id: string;
  name?: string;
  agentId?: string;
  enabled?: boolean;
  schedule?: any;
  state?: { lastRunAtMs?: number; nextRunAtMs?: number; lastStatus?: string; running?: boolean };
  lastRunAt?: string | number;
  nextRunAt?: string | number;
  status?: string | undefined;
  [k: string]: any;
};

export type CronRun = {
  id?: string;
  runId?: string;
  ts?: number;
  startedAt?: string | number;
  finishedAt?: string | number;
  status?: string | undefined;
  summary?: string;
  output?: string;
  error?: string | undefined;
  durationMs?: number;
  [k: string]: any;
};

export const asArray = <T>(r: any, key: string): T[] =>
  Array.isArray(r) ? r : Array.isArray(r?.[key]) ? r[key] : Array.isArray(r?.items) ? r.items : [];

export function scheduleText(s: any): string {
  if (!s) return "—";
  if (typeof s === "string") return s;
  if (s.expr) return `${s.expr}${s.tz ? ` (${s.tz})` : ""}`;
  if (s.everyMs) return `every ${Math.round(s.everyMs / 60000)} min`;
  if (s.at) return `at ${fmtTime(s.at)}`;
  return s.kind ?? JSON.stringify(s);
}

export function fmtTime(v: unknown): string {
  if (v === undefined || v === null || v === "") return "—";
  const d = new Date(typeof v === "number" ? v : String(v));
  return isNaN(d.getTime()) ? String(v) : d.toLocaleString();
}

export const fileToDataUrl = (f: File) =>
  new Promise<string>((ok, bad) => {
    const r = new FileReader();
    r.onload = () => ok(r.result as string);
    r.onerror = bad;
    r.readAsDataURL(f);
  });
