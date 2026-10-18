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
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  useEffect(() => {
    const existing = threads.all().filter((t) => !t.jobId).sort((a, b) => b.updatedAt - a.updatedAt)[0];
    const t = existing ?? threads.create();
    navigate({ to: "/c/$threadId", params: { threadId: t.id }, replace: true });
  }, [navigate]);
  return null;
}
