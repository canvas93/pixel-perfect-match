import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChatPanel } from "@/components/ChatPanel";
import { threads } from "@/lib/threads";

export const Route = createFileRoute("/c/$threadId")({
  head: () => ({
    meta: [
      { title: "Chat · OpenClaw" },
      { name: "description", content: "Conversation with an OpenClaw agent." },
      { property: "og:title", content: "Chat · OpenClaw" },
      { property: "og:description", content: "Conversation with an OpenClaw agent." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ThreadPage,
});

function ThreadPage() {
  const { threadId } = Route.useParams();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    threads.ensure(threadId);
    setReady(true);
  }, [threadId]);
  if (!ready) return null;
  return <ChatPanel key={threadId} threadId={threadId} />;
}
