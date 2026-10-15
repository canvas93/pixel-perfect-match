import { Check, ChevronDown, Bot } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AGENTS, modelFor } from "@/lib/openclaw";

export function AgentSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const current = AGENTS.find((a) => a.id === value) ?? AGENTS[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-base font-semibold hover:bg-accent">
        <Bot className="size-4 text-primary" />
        {current.label}
        <ChevronDown className="size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground">OpenClaw agents</DropdownMenuLabel>
        {AGENTS.map((a) => (
          <DropdownMenuItem key={a.id} onSelect={() => onChange(a.id)} className="flex items-center justify-between">
            <div>
              <div className="font-medium">{a.label}{"note" in a && a.note ? <span className="ml-2 text-xs text-muted-foreground">{a.note}</span> : null}</div>
              <div className="font-mono text-[11px] text-muted-foreground">{modelFor(a.id)}</div>
            </div>
            {a.id === current.id && <Check className="size-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
