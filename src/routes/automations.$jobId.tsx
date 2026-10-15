import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Loader2, MessagesSquare, Play } from "lucide-react";
import { toast } from "sonner";
import { asArray, fmtTime, rpc, scheduleText, type CronJob, type CronRun } from "@/lib/openclaw";
import { StatusBadge } from "@/components/StatusBadge";
import { Markdown } from "@/components/Markdown";
import { ChatPanel } from "@/components/ChatPanel";
import { threads } from "@/lib/threads";
import { cn } from "@/lib/utils";
import { jobStatus } from "./automations.index";

export const Route = createFileRoute("/automations/$jobId")({
  head: () => ({
    meta: [
      { title: "Job workspace · OpenClaw" },
      { name: "description", content: "Run history, output and follow-up Q&A for an OpenClaw automation." },
      { property: "og:title", content: "Job workspace · OpenClaw" },
      { property: "og:description", content: "Run history, output and follow-up Q&A for an OpenClaw automation." },
    ],
  }),
  component: JobPage,
});

const runKey = (r: CronRun, i: number) => String(r.runId ?? r.id ?? r.ts ?? r.startedAt ?? i);
const runOutput = (r: CronRun) => r.output ?? r.summary ?? r.result ?? r.text ?? (r.error ? `**Error:** ${r.error}` : "");

function JobPage() {
  const { jobId } = Route.useParams();
  const qc = useQueryClient();
  const [sel, setSel] = useState<string | null>(null);

  const jobs = useQuery({
    queryKey: ["cron.list"],
    queryFn: async () => asArray<CronJob>(await rpc("cron.list", { includeDisabled: true }), "jobs"),
    retry: 1,
  });
  const job = jobs.data?.find((j) => j.id === jobId);

  const runs = useQuery({
    queryKey: ["cron.runs", jobId],
    queryFn: async () => {
      const list = asArray<CronRun>(await rpc("cron.runs", { id: jobId, jobId, limit: 50 }), "entries");
      const fallback = list.length ? list : [];
      return [...fallback].sort((a, b) => Number(b.ts ?? new Date(b.startedAt ?? 0).getTime()) - Number(a.ts ?? new Date(a.startedAt ?? 0).getTime()));
    },
    refetchInterval: 20000,
    retry: 1,
  });

  const trigger = useMutation({
    mutationFn: () => rpc("cron.run", { id: jobId, jobId, mode: "force" }),
    onSuccess: () => {
      toast.success("Job triggered");
      setTimeout(() => { qc.invalidateQueries({ queryKey: ["cron.runs", jobId] }); qc.invalidateQueries({ queryKey: ["cron.list"] }); }, 1500);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const selected = useMemo(() => {
    const list = runs.data ?? [];
    return list.find((r, i) => runKey(r, i) === sel) ?? list[0];
  }, [runs.data, sel]);

  // One follow-up Q&A thread per job
  const qaId = `job-${jobId}`;
  useEffect(() => {
    threads.ensure(qaId, { jobId, title: `Q&A: ${jobId}`, agent: job?.agentId ?? "default" });
  }, [qaId, jobId, job?.agentId]);

  const system = selected
    ? `You are answering follow-up questions about the automation job "${job?.name ?? jobId}". Its latest selected run (${fmtTime(selected.ts ?? selected.startedAt)}, status ${selected.status ?? "unknown"}) produced this output:\n\n${runOutput(selected).slice(0, 12000)}`
    : `You are answering follow-up questions about the automation job "${job?.name ?? jobId}".`;

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-6 py-6 pt-14 md:pt-6">
          <Link to="/automations" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Automations
          </Link>
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{job?.name ?? jobId}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {job && <StatusBadge status={jobStatus(job)} />}
                <span className="font-mono text-xs">{scheduleText(job?.schedule)}</span>
                <span>Next: {fmtTime(job?.state?.nextRunAtMs ?? job?.nextRunAt)}</span>
              </div>
            </div>
            <button
              onClick={() => trigger.mutate()}
              disabled={trigger.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {trigger.isPending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4 fill-current" />} Run now
            </button>
          </div>

          {runs.isError && (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {(runs.error as Error).message}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-[220px_1fr]">
            <div>
              <div className="mb-2 text-xs font-medium text-muted-foreground">Run history</div>
              <div className="max-h-[60vh] space-y-1 overflow-y-auto">
                {runs.isLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading…</div>}
                {runs.data?.length === 0 && <p className="text-sm text-muted-foreground">No runs yet.</p>}
                {runs.data?.map((r, i) => {
                  const k = runKey(r, i);
                  const active = selected === r;
                  return (
                    <button key={k} onClick={() => setSel(k)} className={cn("w-full rounded-lg border px-3 py-2 text-left text-xs hover:bg-accent", active ? "border-primary/50 bg-accent" : "border-transparent")}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{fmtTime(r.ts ?? r.startedAt)}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <StatusBadge status={r.status ?? r['action']} />
                        {r.durationMs != null && <span className="text-muted-foreground">{(r.durationMs / 1000).toFixed(1)}s</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="min-w-0 rounded-xl border bg-card p-5">
              {selected ? (
                <>
                  <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Output · {fmtTime(selected.ts ?? selected.startedAt)}</span>
                    <StatusBadge status={selected.status} />
                  </div>
                  {runOutput(selected) ? <Markdown>{String(runOutput(selected))}</Markdown> : (
                    <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs">{JSON.stringify(selected, null, 2)}</pre>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Select a run to see its output.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex h-[55vh] min-h-0 flex-col border-t lg:h-auto lg:w-[420px] lg:border-l lg:border-t-0">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b px-4 text-sm font-semibold">
          <MessagesSquare className="size-4 text-primary" /> Ask about this run
        </div>
        <div className="min-h-0 flex-1">
          <ChatPanel
            threadId={qaId}
            compact
            system={system}
            placeholder="Ask a follow-up about this result…"
            emptyState={<p className="pt-8 text-center text-sm text-muted-foreground">Ask questions about the selected run's output.</p>}
          />
        </div>
      </div>
    </div>
  );
}
