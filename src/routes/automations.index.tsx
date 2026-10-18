import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronRight, Loader2, RefreshCw, Timer } from "lucide-react";
import { fmtTime, listCronJobs, scheduleText, type CronJob } from "@/lib/openclaw";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/automations/")({
  head: () => ({
    meta: [
      { title: "Automations · OpenClaw" },
      { name: "description", content: "Scheduled OpenClaw jobs, their status, last and next runs." },
      { property: "og:title", content: "Automations · OpenClaw" },
      { property: "og:description", content: "Scheduled OpenClaw jobs, their status, last and next runs." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Automations,
});

export const jobStatus = (j: CronJob) =>
  j.state?.running ? "running" : j.enabled === false ? "disabled" : (j.state?.lastStatus ?? j.status ?? "idle");

function Automations() {
  const q = useQuery({
    queryKey: ["cron.list"],
    queryFn: listCronJobs,
    refetchInterval: 30000,
    retry: false,
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-8 pt-14 md:pt-8">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Automations</h1>
            <p className="text-sm text-muted-foreground">Scheduled jobs running on your OpenClaw server.</p>
          </div>
          <Button variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}>
            <RefreshCw className={`size-4 ${q.isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        {q.isLoading ? (
          <div className="flex items-center gap-2 py-16 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading jobs…</div>
        ) : q.isError ? (
          <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div><div className="font-semibold">Couldn't load automations</div><div>{(q.error as Error).message}</div></div>
          </div>
        ) : (q.data ?? []).length === 0 ? (
          <div className="rounded-xl border border-dashed py-16 text-center text-muted-foreground">
            <Timer className="mx-auto mb-2 size-6" /> No scheduled jobs yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="hidden grid-cols-[1.6fr_1.2fr_1fr_1fr_auto_auto] gap-4 border-b px-4 py-2.5 text-xs font-medium text-muted-foreground md:grid">
              <span>Job</span><span>Schedule</span><span>Last run</span><span>Next run</span><span>Status</span><span />
            </div>
            {(q.data ?? []).map((j) => (
              <Link
                key={j.id}
                to="/automations/$jobId"
                params={{ jobId: j.id }}
                className="grid grid-cols-1 gap-1 border-b px-4 py-3.5 text-sm last:border-0 hover:bg-accent/50 md:grid-cols-[1.6fr_1.2fr_1fr_1fr_auto_auto] md:items-center md:gap-4"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{j.name ?? j.id}</div>
                  {j.agentId && <div className="font-mono text-xs text-muted-foreground">{j.agentId}</div>}
                </div>
                <span className="font-mono text-xs text-muted-foreground">{scheduleText(j.schedule)}</span>
                <span className="text-muted-foreground">{fmtTime(j.state?.lastRunAtMs ?? j.lastRunAt)}</span>
                <span className="text-muted-foreground">{fmtTime(j.state?.nextRunAtMs ?? j.nextRunAt)}</span>
                <StatusBadge status={jobStatus(j)} />
                <ChevronRight className="hidden size-4 text-muted-foreground md:block" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
