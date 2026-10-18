import { useEffect, useRef, useState } from "react";
import { ArrowUp, FileText, Paperclip, RotateCcw, Square, X, AlertTriangle } from "lucide-react";
import { Markdown } from "./Markdown";
import { AgentSelect } from "./AgentSelect";
import { threads, useThread, uid } from "@/lib/threads";
import { AGENTS, fileToDataUrl, streamReply, type Attachment, type ChatMsg } from "@/lib/openclaw";
import { cn } from "@/lib/utils";

export function ChatPanel({
  threadId,
  system,
  compact,
  placeholder = "Message OpenClaw…",
  emptyState,
}: {
  threadId: string;
  system?: string | undefined;
  compact?: boolean;
  placeholder?: string;
  emptyState?: React.ReactNode;
}) {
  const thread = useThread(threadId);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const messages = thread?.messages ?? [];
  const agent = thread?.agent ?? "adin";

  useEffect(() => { taRef.current?.focus(); }, [threadId, busy]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages]);
  useEffect(() => () => abortRef.current?.abort(), [threadId]);

  async function run(history: ChatMsg[]) {
    const assistantId = uid();
    threads.update(threadId, (t) => ({ ...t, messages: [...history, { id: assistantId, role: "assistant", content: "" }] }));
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let acc = "";
    try {
      await streamReply({
        agent,
        sessionId: threadId,
        history,
        system,
        signal: ctrl.signal,
        onDelta: (d) => {
          acc += d;
          threads.update(threadId, (t) => ({
            ...t,
            messages: t.messages.map((m) => (m.id === assistantId ? { ...m, content: acc } : m)),
          }));
        },
      });
    } catch (e) {
      const aborted = (e as Error).name === "AbortError";
      threads.update(threadId, (t) => ({
        ...t,
        messages: t.messages.map((m) =>
          m.id === assistantId ? { ...m, error: aborted ? undefined : (e as Error).message, content: acc || (aborted ? "_Stopped._" : "") } : m,
        ),
      }));
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  function send() {
    const text = input.trim();
    if ((!text && !files.length) || busy || !thread) return;
    const msg: ChatMsg = { id: uid(), role: "user", content: text, attachments: files.length ? files : undefined };
    const history = [...messages.filter((m) => !(m.role === "assistant" && !m.content && m.error)), msg];
    if (thread.title === "New chat" && text) threads.update(threadId, (t) => ({ ...t, title: text.slice(0, 48) }));
    setInput("");
    setFiles([]);
    run(history);
  }

  function retry() {
    const lastUser = messages.map((m) => m.role).lastIndexOf("user");
    if (lastUser >= 0) run(messages.slice(0, lastUser + 1));
  }

  async function addFiles(list: FileList | null) {
    if (!list) return;
    const next = await Promise.all(
      Array.from(list).map(async (f) => ({ name: f.name, mime: f.type || "application/octet-stream", dataUrl: await fileToDataUrl(f) })),
    );
    setFiles((p) => [...p, ...next]);
  }

  const last = messages[messages.length - 1];

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!compact && (
        <div className="flex h-14 shrink-0 items-center gap-2 px-4 pl-14 md:pl-4">
          <AgentSelect value={agent} onChange={(a) => threads.update(threadId, (t) => ({ ...t, agent: a }))} />
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={cn("mx-auto w-full max-w-3xl px-4", compact ? "py-4" : "py-6")}>
          {messages.length === 0 && (emptyState ?? (
            <div className="flex flex-col items-center pt-[18vh] text-center">
              <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-primary text-xl font-bold text-primary-foreground">C</div>
              <h1 className="text-2xl font-bold tracking-tight">What can {AGENTS.find((a) => a.id === agent)?.label} help with?</h1>
            </div>
          ))}
          <div className="space-y-6">
            {messages.map((m) => (
              <div key={m.id} className={cn("flex", m.role === "user" && "justify-end")}>
                {m.role === "user" ? (
                  <div className="max-w-[85%] space-y-2">
                    {m.attachments && (
                      <div className="flex flex-wrap justify-end gap-2">
                        {m.attachments.map((a, i) => <AttachmentChip key={i} a={a} />)}
                      </div>
                    )}
                    {m.content && <div className="whitespace-pre-wrap rounded-2xl bg-bubble px-4 py-2.5 text-bubble-foreground">{m.content}</div>}
                  </div>
                ) : (
                  <div className="w-full min-w-0">
                    {m.content ? <Markdown>{m.content}</Markdown> : !m.error && <Typing />}
                    {m.error && (
                      <div className="mt-2 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                        <span className="flex-1">{m.error}</span>
                        {m === last && !busy && (
                          <button onClick={retry} className="inline-flex items-center gap-1 font-medium hover:underline">
                            <RotateCcw className="size-3.5" /> Retry
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div ref={endRef} />
        </div>
      </div>

      <div className="shrink-0 px-4 pb-4">
        <form
          onSubmit={(e) => { e.preventDefault(); send(); }}
          className="mx-auto w-full max-w-3xl rounded-3xl border bg-card p-2 shadow-lg shadow-background/40 focus-within:border-ring/60"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
        >
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2 px-2 pt-1 pb-2">
              {files.map((a, i) => (
                <AttachmentChip key={i} a={a} onRemove={() => setFiles((p) => p.filter((_, j) => j !== i))} />
              ))}
            </div>
          )}
          <textarea
            ref={taRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={(e) => e.clipboardData.files.length && addFiles(e.clipboardData.files)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
            }}
            placeholder={placeholder}
            className="field-sizing-content max-h-52 min-h-10 w-full resize-none bg-transparent px-3 py-2 outline-none placeholder:text-muted-foreground"
          />
          <div className="flex items-center justify-between px-1">
            <input ref={fileRef} type="file" multiple hidden accept="image/*,.pdf,.txt,.md,.csv,.json,.doc,.docx,.xlsx" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            <button type="button" onClick={() => fileRef.current?.click()} className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Attach files">
              <Paperclip className="size-4" />
            </button>
            {busy ? (
              <button type="button" onClick={() => abortRef.current?.abort()} className="grid size-9 place-items-center rounded-full bg-foreground text-background" aria-label="Stop">
                <Square className="size-3.5 fill-current" />
              </button>
            ) : (
              <button type="submit" disabled={!input.trim() && !files.length} className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground transition disabled:opacity-30" aria-label="Send">
                <ArrowUp className="size-4" />
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function Typing() {
  return (
    <div className="flex gap-1 py-3">
      {[0, 1, 2].map((i) => <span key={i} className="typing-dot size-2 rounded-full bg-muted-foreground" style={{ animationDelay: `${i * 0.2}s` }} />)}
    </div>
  );
}

function AttachmentChip({ a, onRemove }: { a: Attachment; onRemove?: () => void }) {
  const isImg = a.mime.startsWith("image/") && a.dataUrl;
  return (
    <div className="relative flex items-center gap-2 rounded-xl border bg-secondary p-1.5 pr-3 text-xs">
      {isImg ? <img src={a.dataUrl} alt={a.name} className="size-10 rounded-lg object-cover" /> : (
        <div className="grid size-10 place-items-center rounded-lg bg-primary/15 text-primary"><FileText className="size-4" /></div>
      )}
      <span className="max-w-32 truncate">{a.name}</span>
      {onRemove && (
        <button type="button" onClick={onRemove} className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-foreground text-background" aria-label="Remove">
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}
