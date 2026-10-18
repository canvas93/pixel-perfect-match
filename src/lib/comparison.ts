import type { ChatMsg } from "./openclaw";
export function agentHistory(messages: ChatMsg[], agent: string) {
  return messages.filter((m) => m.role === "user" || ((!m.agent || m.agent === agent) && !(m.error && !m.content)));
}