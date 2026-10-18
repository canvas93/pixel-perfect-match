import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Columns2,
  Download,
  FileText,
  Paperclip,
  RotateCcw,
  Square,
  X,
  AlertTriangle,
} from "lucide-react";
import { AgentSelect } from "./AgentSelect";
import { ChartBlock, parseChartSpec } from "./ChartBlock";
import { threads, useThread, uid } from "@/lib/threads";
import { AGENTS, fileToDataUrl, streamReply, type Attachment, type ChatMsg } from "@/lib/openclaw";
import { agentHistory } from "@/lib/comparison";
import { collectAssets, downloadBlob, saveAssets, uploadFile } from "@/lib/assets";
import { Button } from "@/components/ui/button";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { toast } from "sonner";
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
  const [uploading, setUploading] = useState(false);
  const controllers = useRef<AbortController[]>([]);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const messages = thread?.messages ?? [];
  const agent = thread?.agent ?? "adin";
  const split = thread?.splitEnabled ?? false;
  const secondAgent = thread?.comparisonAgent ?? (agent === "mandarin" ? "support" : "mandarin");
  const rightMessages = thread?.comparisonMessages ?? [];
  useEffect(() => {
    taRef.current?.focus();
  }, [threadId, busy]);
  useEffect(() => () => controllers.current.forEach((c) => c.abort()), [threadId]);

  async function runLane(history: ChatMsg[], selected: string, lane: "left" | "right") {
    const assistantId = uid();
    const key = lane === "left" ? "messages" : "comparisonMessages";
    const assistant: ChatMsg = {
      id: assistantId,
      role: "assistant",
      content: "",
      agent: selected,
      createdAt: Date.now(),
    };
    threads.update(threadId, (t) => ({ ...t, [key]: [...history, assistant] }));
    const ctrl = new AbortController();
    controllers.current.push(ctrl);
    let acc = "";
    const patch = (fn: (m: ChatMsg) => ChatMsg) =>
      threads.update(threadId, (t) => ({
        ...t,
        [key]: (t[key] ?? []).map((m) => (m.id === assistantId ? fn(m) : m)),
      }));
    try {
      // Rehydrate prior attachments from the server only while composing an API request.
      const requestHistory = await Promise.all(agentHistory(history, selected).map(async (m) => ({
        ...m,
        attachments: m.attachments ? await Promise.all(m.attachments.map(async (a) => {
          if (a.dataUrl || !a.url) return a;
          const url = new URL(a.url, window.location.origin);
          if (url.origin !== window.location.origin) throw new Error("Chat attachments must come from your OpenClaw server.");
          const res = await fetch(url.href, { credentials: "same-origin", signal: ctrl.signal });
          if (!res.ok) throw new Error(`The attachment ${a.name} is no longer available (${res.status}).`);
          const blob = await res.blob();
          if (blob.type.includes("text/html") && !a.mime.includes("text/html")) throw new Error("The attachment server returned a page instead of a file.");
          return { ...a, dataUrl: await fileToDataUrl(new File([blob], a.name, { type: a.mime })) };
        })) : undefined,
      })));
      await streamReply({
        agent: selected,
        sessionId: `${threadId}:${lane}:${selected}`,
        history: requestHistory,
        system,
        signal: ctrl.signal,
        onDelta: (delta) => {
          acc += delta;
          patch((m) => ({ ...m, content: acc }));
        },
        onAssets: (assets) => {
          if (!assets.length) return;
          patch((m) => {
            const existing = m.attachments ?? [];
            const added = assets
              .filter((a) => !existing.some((e) => (e.url || e.dataUrl) === (a.url || a.dataUrl)))
              .map((a) => ({ ...a, id: uid(), createdAt: Date.now() }));
            return { ...m, attachments: [...existing, ...added] };
          });
        },
      });
    } catch (e) {
      const aborted = e instanceof Error && e.name === "AbortError";
      patch((m) => ({
        ...m,
        error: aborted ? undefined : e instanceof Error ? e.message : "Request failed.",
        content: acc || (aborted ? "_Stopped._" : ""),
      }));
    } finally {
      const current = threads.get(threadId);
      const reply = current?.[key]?.find((m) => m.id === assistantId);
      if (current && reply) {
        try {
          await saveAssets(collectAssets(current, [reply]));
        } catch (e) {
          toast.error(
            e instanceof Error ? e.message : "Generated files could not be uploaded to the Vault.",
          );
        }
      }
    }
  }

  async function run(left: ChatMsg[], right?: ChatMsg[]) {
    setBusy(true);
    controllers.current = [];
    try {
      await Promise.all([
        runLane(left, agent, "left"),
        ...(right ? [runLane(right, secondAgent, "right")] : []),
      ]);
    } finally {
      setBusy(false);
      controllers.current = [];
    }
  }
  function send() {
    const text = input.trim();
    if ((!text && !files.length) || busy || uploading || !thread) return;
    const msg: ChatMsg = {
      id: uid(),
      role: "user",
      content: text,
      createdAt: Date.now(),
      attachments: files.length ? files : undefined,
    };
    if (thread.title === "New chat" && text)
      threads.update(threadId, (t) => ({ ...t, title: text.slice(0, 48) }));
    setInput("");
    setFiles([]);
    const clean = (history: ChatMsg[]) =>
      history.filter((m) => !(m.role === "assistant" && !m.content && m.error));
    void run([...clean(messages), msg], split ? [...clean(rightMessages), msg] : undefined);
  }
  async function retry(lane: "left" | "right") {
    if (busy) return;
    const history = lane === "left" ? messages : rightMessages;
    const lastUser = history.map((m) => m.role).lastIndexOf("user");
    if (lastUser < 0) return;
    setBusy(true);
    controllers.current = [];
    try {
      await runLane(history.slice(0, lastUser + 1), lane === "left" ? agent : secondAgent, lane);
    } finally {
      setBusy(false);
      controllers.current = [];
    }
  }
  async function addFiles(list: FileList | null) {
    if (!list || !thread) return;
    setUploading(true);
    try {
      const next = await Promise.all(
        Array.from(list).map(async (f): Promise<Attachment> => {
          const dataUrl = await fileToDataUrl(f);
          const saved = await uploadFile(f, {
            id: uid(),
            source: thread.title,
            threadId,
            origin: "attached",
            createdAt: Date.now(),
          });
          return { ...saved, dataUrl };
        }),
      );
      setFiles((p) => [...p, ...next]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The files could not be uploaded to the Vault.");
    } finally {
      setUploading(false);
    }
  }
  const exportLane = (history: ChatMsg[], selected: string) =>
    downloadBlob(
      new Blob(
        [
          history
            .map((m) => `## ${m.role === "user" ? "You" : (m.agent ?? selected)}\n\n${m.content}`)
            .join("\n\n---\n\n"),
        ],
        { type: "text/markdown" },
      ),
      `${selected}-${threadId}.md`,
    );

  function lane(history: ChatMsg[], selected: string, side: "left" | "right") {
    return (
      <section
        aria-label={`${side === "left" ? "Primary" : "Comparison"} conversation`}
        className="flex min-h-0 min-w-0 flex-1 flex-col"
      >
        {split && (
          <div className="flex min-h-14 shrink-0 items-center justify-between gap-2 border-b px-3">
            <AgentSelect
              value={selected}
              disabled={busy}
              label={side === "left" ? "Primary agent" : "Comparison agent"}
              onChange={(value) =>
                threads.update(threadId, (t) => ({
                  ...t,
                  ...(side === "left" ? { agent: value } : { comparisonAgent: value }),
                }))
              }
            />
            <Button
              size="icon"
              variant="ghost"
              disabled={!history.length || busy}
              title={`Export ${selected} conversation`}
              aria-label={`Export ${selected} conversation`}
              onClick={() => exportLane(history, selected)}
            >
              <Download />
            </Button>
          </div>
        )}
        <Conversation className="min-h-0">
          <ConversationContent
            className={cn("mx-auto w-full gap-6 px-4 py-6", !split && "max-w-3xl")}
          >
            {!history.length &&
              (emptyState ?? (
                <div className="flex flex-col items-center pt-[18vh] text-center">
                  <div className="mb-4 grid size-12 place-items-center rounded-lg bg-primary text-xl font-bold text-primary-foreground">
                    C
                  </div>
                  <h1 className={cn("font-bold", split ? "text-xl" : "text-2xl")}>
                    {split
                      ? selected
                      : `What can ${AGENTS.find((a) => a.id === selected)?.label} help with?`}
                  </h1>
                </div>
              ))}
            {history.map((m, i) => (
              <Message key={m.id} from={m.role} className="max-w-full">
                <MessageContent
                  className={cn(
                    m.role === "assistant"
                      ? "w-full overflow-visible"
                      : "group-[.is-user]:bg-bubble group-[.is-user]:text-bubble-foreground",
                  )}
                >
                  {m.attachments?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {m.attachments.map((a, index) => (
                        <AttachmentChip key={a.id ?? index} a={a} />
                      ))}
                    </div>
                  ) : null}
                  {m.role === "user" ? (
                    <div className="whitespace-pre-wrap break-words">{m.content}</div>
                  ) : (
                    <>
                      {m.agent && (
                        <div className="text-xs font-medium text-muted-foreground">{m.agent}</div>
                      )}
                      {m.content ? (
                        <Reply content={m.content} streaming={busy && i === history.length - 1} />
                      ) : (
                        !m.error && <Shimmer>Thinking…</Shimmer>
                      )}
                      {m.error && (
                        <div
                          role="alert"
                          className="flex flex-wrap items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                        >
                          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                          <span className="min-w-0 flex-1 break-words">{m.error}</span>
                          {i === history.length - 1 && !busy && (
                            <Button size="sm" variant="ghost" onClick={() => void retry(side)}>
                              <RotateCcw /> Retry
                            </Button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </MessageContent>
              </Message>
            ))}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      </section>
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className={cn(
          "flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4",
          !compact && "pl-14 md:pl-4",
        )}
      >
        {split ? (
          <span className="text-sm font-semibold">Compare agents</span>
        ) : (
          <AgentSelect
            value={agent}
            disabled={busy}
            onChange={(value) => threads.update(threadId, (t) => ({ ...t, agent: value }))}
          />
        )}
        <div className="flex gap-2">
          {!split && (
            <Button
              size="icon"
              variant="ghost"
              title="Export conversation"
              aria-label="Export conversation"
              disabled={!messages.length || busy}
              onClick={() => exportLane(messages, agent)}
            >
              <Download />
            </Button>
          )}
          <Button
            variant={split ? "secondary" : "ghost"}
            size="sm"
            aria-pressed={split}
            disabled={busy}
            onClick={() => threads.update(threadId, (t) => ({ ...t, splitEnabled: !split }))}
          >
            <Columns2 /> Split View
          </Button>
        </div>
      </div>
      <div className={cn("flex min-h-0 flex-1", split && "overflow-x-auto")}>
        <div className={cn("flex min-h-0 flex-1", split && "min-w-[600px] divide-x")}>
          {lane(messages, agent, "left")}
          {split && lane(rightMessages, secondAgent, "right")}
        </div>
      </div>
      <div className="shrink-0 px-4 pb-4 pt-3">
        <PromptInput
          onSubmit={() => send()}
          className="mx-auto w-full max-w-3xl"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void addFiles(e.dataTransfer.files);
          }}
        >
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2 p-3">
              {files.map((a, i) => (
                <AttachmentChip
                  key={a.id ?? i}
                  a={a}
                  onRemove={() => setFiles((p) => p.filter((_, index) => i !== index))}
                />
              ))}
            </div>
          )}
          <PromptInputTextarea
            ref={taRef}
            aria-label="Message OpenClaw"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={(e) => {
              if (e.clipboardData.files.length) {
                e.preventDefault();
                void addFiles(e.clipboardData.files);
              }
            }}
            placeholder={split ? "Message both agents…" : placeholder}
          />
          <PromptInputFooter className="justify-between">
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                void addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={uploading}
              title="Attach files"
              aria-label="Attach files"
              onClick={() => fileRef.current?.click()}
            >
              <Paperclip />
            </Button>
            <PromptInputSubmit
              className="size-9 shrink-0"
              aria-label={busy ? "Stop" : "Send"}
              status={busy ? "streaming" : "ready"}
              disabled={!busy && ((!input.trim() && !files.length) || uploading)}
              onStop={() => controllers.current.forEach((c) => c.abort())}
            >
              {busy ? <Square className="size-3.5 fill-current" /> : <ArrowUp />}
            </PromptInputSubmit>
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
function Reply({ content, streaming }: { content: string; streaming: boolean }) {
  const chunks = content.split(/(```(?:chart|graph|json)\n[\s\S]*?```)/g);
  return (
    <>
      {chunks.map((chunk, i) => {
        const match = /^```(chart|graph|json)\n([\s\S]*?)```$/.exec(chunk);
        const spec = match ? parseChartSpec(match[2] ?? "", match[1] !== "json") : null;
        return spec ? (
          <ChartBlock key={i} spec={spec} />
        ) : (
          <MessageResponse key={i} isAnimating={streaming} className="prose-chat break-words">
            {chunk}
          </MessageResponse>
        );
      })}
    </>
  );
}
function AttachmentChip({ a, onRemove }: { a: Attachment; onRemove?: () => void }) {
  return (
    <div className="relative flex min-w-0 items-center gap-2 rounded-md border bg-secondary p-1.5 pr-3 text-xs">
      {a.mime.startsWith("image/") && (a.dataUrl || a.url) ? (
        <img src={a.dataUrl || a.url} alt={a.name} className="size-10 rounded-md object-cover" />
      ) : (
        <div className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/15 text-primary">
          <FileText className="size-4" />
        </div>
      )}
      <span className="max-w-32 truncate">{a.name}</span>
      {onRemove && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`Remove ${a.name}`}
          title="Remove attachment"
          onClick={onRemove}
        >
          <X />
        </Button>
      )}
    </div>
  );
}
