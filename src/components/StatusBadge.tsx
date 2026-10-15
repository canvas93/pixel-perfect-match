import { cn } from "@/lib/utils";

export function StatusBadge({ status }: { status?: string }) {
  const s = (status ?? "unknown").toLowerCase();
  const tone =
    ["ok", "success", "succeeded", "completed", "done"].includes(s)
      ? "bg-success/15 text-success"
      : ["error", "failed", "failure"].includes(s)
        ? "bg-destructive/15 text-destructive"
        : s === "running"
          ? "bg-primary/15 text-primary"
          : "bg-muted text-muted-foreground";
  return (
    <span className={cn("inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", tone)}>
      <span className={cn("size-1.5 rounded-full bg-current", s === "running" && "animate-pulse")} />
      {s}
    </span>
  );
}
