import { afterEach, describe, expect, it, vi } from "vitest";
import { AGENTS, listCronJobs, listCronRuns, modelFor, runCronJob, streamReply } from "@/lib/openclaw";

afterEach(() => vi.unstubAllGlobals());

describe("OpenClaw requests", () => {
  it.each(["adin", "mandarin", "support"])("targets selected agent %s in chat completions", async (agent) => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: "Reply" } }] }));
    vi.stubGlobal("fetch", fetchMock);
    await streamReply({ agent, sessionId: "conversation", history: [{ id: "1", role: "user", content: "Hello" }], onDelta: vi.fn() });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body).model).toBe(`openclaw/${agent}`);
  });

  it("maps saved legacy default agents to adin", () => {
    expect(modelFor("default")).toBe("openclaw/adin");
    expect(AGENTS[0].id).toBe("adin");
  });

  it("lists jobs with cron.list and empty params", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ jsonrpc: "2.0", result: { jobs: [{ id: "daily" }] } }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await listCronJobs()).toEqual([{ id: "daily" }]);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/api/v1/admin/rpc");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toMatchObject({ jsonrpc: "2.0", method: "cron.list", params: {} });
    expect(JSON.parse(init.body).params).toEqual({});
  });

  it("requests cron.runs for the selected job", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ result: { entries: [{ status: "ok" }] } }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await listCronRuns("daily")).toEqual([{ status: "ok" }]);
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body)).toMatchObject({ method: "cron.runs", params: { id: "daily", limit: 50 } });
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body).params).not.toHaveProperty("jobId");
  });

  it("executes the selected job using cron.run", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ result: { ok: true } }));
    vi.stubGlobal("fetch", fetchMock);
    await runCronJob("daily");
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body)).toMatchObject({ method: "cron.run", params: { id: "daily", mode: "force" } });
  });

  it("surfaces JSON-RPC error messages even with HTTP success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: { code: -32601, message: "Unknown method cron.list" } })));
    await expect(listCronJobs()).rejects.toThrow("Unknown method cron.list");
  });

  it("does not show an invalid successful response as an empty job list", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ result: { unexpected: true } })));
    await expect(listCronJobs()).rejects.toThrow("unexpected list response");
  });

  it("handles HTML from a misrouted admin endpoint", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>Documentation</html>")));
    await expect(listCronJobs()).rejects.toThrow("invalid response");
  });
});