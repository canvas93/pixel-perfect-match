import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  MessageSquarePlus,
  PanelLeft,
  Timer,
  Trash2,
  Moon,
  Sun,
  MessageSquare,
  Archive,
} from "lucide-react";
import { useEffect, useState } from "react";
import { FOCUS_COMPOSER_EVENT, threads, useThreads } from "@/lib/threads";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function useTheme() {
  const [dark, setDark] = useState(true);
  useEffect(() => {
    const saved = localStorage.getItem("openclaw.theme");
    setDark(saved ? saved === "dark" : true);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("openclaw.theme", dark ? "dark" : "light");
  }, [dark]);
  return { dark, toggle: () => setDark((d) => !d) };
}

export function AppSidebar() {
  const [open, setOpen] = useState(true);
  const list = useThreads().filter((t) => !t.jobId);
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { dark, toggle } = useTheme();

  useEffect(() => {
    if (window.innerWidth < 768) setOpen(false);
  }, []);
  const closeOnMobile = () => window.innerWidth < 768 && setOpen(false);

  const newChat = () => {
    const activeId = path.startsWith("/c/") ? decodeURIComponent(path.slice(3)) : undefined;
    const t = threads.newChat(activeId);
    closeOnMobile();
    if (t.id === activeId) {
      window.dispatchEvent(new Event(FOCUS_COMPOSER_EVENT));
      return;
    }
    navigate({ to: "/c/$threadId", params: { threadId: t.id } });
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed left-3 top-3 z-40 grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-accent"
          aria-label="Open sidebar"
        >
          <PanelLeft className="size-5" />
        </button>
      )}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-background/60 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-sidebar text-sidebar-foreground transition-[margin] duration-200 md:relative",
          !open && "-ml-64",
        )}
      >
        <div className="flex h-14 items-center justify-between px-3">
          <Link to="/" className="flex items-center gap-2 px-1 font-bold tracking-tight">
            <span className="grid size-7 place-items-center rounded-lg bg-sidebar-primary text-sm">
              C
            </span>{" "}
            OpenClaw
          </Link>
          <button
            onClick={() => setOpen(false)}
            className="grid size-8 place-items-center rounded-lg hover:bg-sidebar-accent"
            aria-label="Close sidebar"
          >
            <PanelLeft className="size-4" />
          </button>
        </div>
        <nav className="space-y-0.5 px-2">
          <button
            onClick={newChat}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-sidebar-accent"
          >
            <MessageSquarePlus className="size-4" /> New chat
          </button>
          <Link
            to="/automations"
            onClick={closeOnMobile}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-sidebar-accent",
              path.startsWith("/automations") && "bg-sidebar-accent font-medium",
            )}
          >
            <Timer className="size-4" /> Automations
          </Link>
          <Button
            asChild
            variant="ghost"
            className={cn(
              "w-full justify-start px-2.5 font-normal",
              path === "/vault" && "bg-sidebar-accent font-medium",
            )}
          >
            <Link to="/vault" onClick={closeOnMobile}>
              <Archive className="size-4" /> Vault
            </Link>
          </Button>
        </nav>
        <div className="mt-5 px-4 pb-1 text-xs font-medium text-muted-foreground">Chats</div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {list.length === 0 && (
            <p className="px-2.5 py-2 text-xs text-muted-foreground">No conversations yet.</p>
          )}
          {list.map((t) => {
            const active = path === `/c/${t.id}`;
            return (
              <div
                key={t.id}
                className={cn(
                  "group flex items-center rounded-lg hover:bg-sidebar-accent",
                  active && "bg-sidebar-accent",
                )}
              >
                <Link
                  to="/c/$threadId"
                  params={{ threadId: t.id }}
                  onClick={closeOnMobile}
                  className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-sm"
                >
                  <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{t.title}</span>
                </Link>
                <button
                  onClick={() => {
                    threads.remove(t.id);
                    if (active) navigate({ to: "/" });
                  }}
                  className="mr-1 hidden size-7 place-items-center rounded-md text-muted-foreground hover:text-destructive group-hover:grid"
                  aria-label="Delete chat"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>
        <div className="border-t border-sidebar-border p-2">
          <button
            onClick={toggle}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-sidebar-accent"
          >
            {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}{" "}
            {dark ? "Light mode" : "Dark mode"}
          </button>
        </div>
      </aside>
    </>
  );
}
