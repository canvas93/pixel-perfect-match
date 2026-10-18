import { useEffect, useState } from "react";
import { Check, ChevronDown, Bot, Cpu } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { AGENTS, isRawModel, labelFor, listModels, modelFor } from "@/lib/openclaw";
import { Button } from "@/components/ui/button";

// Shared across pickers so /v1/models is fetched once per page load.
let modelsPromise: Promise<string[]> | null = null;
const loadModels = () => (modelsPromise ??= listModels().catch((e) => {
  modelsPromise = null;
  throw e;
}));

export function AgentSelect({
  value,
  onChange,
  disabled,
  label = "Select agent or model",
}: {
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean | undefined;
  label?: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [error, setError] = useState("");
  const raw = isRawModel(value);

  useEffect(() => {
    if (!open) return;
    let live = true;
    loadModels()
      .then((m) => live && (setModels(m), setError("")))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [open]);

  const pick = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery("");
  };
  const custom = query.trim();
  const showCustom = custom.includes("/") && !models.includes(custom);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          disabled={disabled}
          aria-label={label}
          variant="ghost"
          className="min-w-0 max-w-[16rem] gap-1.5 px-2 text-sm font-semibold"
        >
          {raw ? <Cpu className="size-4 text-primary" /> : <Bot className="size-4 text-primary" />}
          <span className="truncate">{labelFor(value)}</span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <Command>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search agents or type provider/model…"
          />
          <CommandList className="max-h-80">
            <CommandEmpty>
              {custom ? "No match. Type a full id like openai/gpt-4o." : "No models found."}
            </CommandEmpty>
            {showCustom && (
              <CommandGroup heading="Custom model">
                <CommandItem value={`custom ${custom}`} onSelect={() => pick(custom)}>
                  <Cpu className="size-4" />
                  <span className="truncate font-mono text-xs">Use “{custom}”</span>
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup heading="OpenClaw agents">
              {AGENTS.map((a) => (
                <CommandItem key={a.id} value={`${a.id} ${modelFor(a.id)}`} onSelect={() => pick(a.id)}>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">
                      {a.label}
                      {"note" in a && a.note ? (
                        <span className="ml-2 text-xs text-muted-foreground">{a.note}</span>
                      ) : null}
                    </div>
                    <div className="font-mono text-[11px] text-muted-foreground">{modelFor(a.id)}</div>
                  </div>
                  {a.id === value && <Check className="size-4 text-primary" />}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Models (OpenRouter / raw)">
              {error && <p className="px-2 py-1.5 text-xs text-destructive">{error}</p>}
              {!error && models.length === 0 && (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">
                  Loading… or type any provider/model id above.
                </p>
              )}
              {models.map((m) => (
                <CommandItem key={m} value={m} onSelect={() => pick(m)}>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">{m}</span>
                  {m === value && <Check className="size-4 text-primary" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
