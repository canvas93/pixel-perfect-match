import { afterEach, describe, expect, it, vi } from "vitest";
import { listModels, modelFor, streamReply } from "@/lib/openclaw";
import { threads } from "@/lib/threads";

afterEach(() => vi.unstubAllGlobals());

describe("raw models", () => {
  it("sends raw model strings unchanged", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: "ok" } }] }));
    vi.stubGlobal("fetch", fetchMock);
    await streamReply({ agent: "openai/gpt-4o", sessionId: "s", history: [{ id: "1", role: "user", content: "hi" }], onDelta: vi.fn() });
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body).model).toBe("openai/gpt-4o");
    expect(modelFor("mandarin")).toBe("openclaw/mandarin");
  });

  it("lists /v1/models excluding openclaw agents", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ data: [{ id: "openclaw/adin" }, { id: "qwen/qwen-2.5" }, { id: "anthropic/claude-3.5-sonnet" }] })));
    expect(await listModels()).toEqual(["anthropic/claude-3.5-sonnet", "qwen/qwen-2.5"]);
  });
});

describe("new chat deduplication", () => {
  it("reuses the active empty chat", () => {
    const t = threads.create();
    expect(threads.newChat(t.id).id).toBe(t.id);
  });
  it("creates a new chat when the active one has messages", () => {
    const t = threads.create({ messages: [{ id: "m", role: "user", content: "hi" }] });
    expect(threads.newChat(t.id).id).not.toBe(t.id);
  });
});
