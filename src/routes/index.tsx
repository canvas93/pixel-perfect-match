import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { threads } from "@/lib/threads";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OpenClaw — Chat with your agents" },
      { name: "description", content: "ChatGPT-style workspace for OpenClaw agents and automations." },
      { property: "og:title", content: "OpenClaw — Chat with your agents" },
      { property: "og:description", content: "ChatGPT-style workspace for OpenClaw agents and automations." },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  useEffect(() => {
    const existing = threads.all().find((t) => !t.jobId && t.messages.length === 0);
    const t = existing ?? threads.create();
    navigate({ to: "/c/$threadId", params: { threadId: t.id }, replace: true });
  }, [navigate]);
  return null;
}
