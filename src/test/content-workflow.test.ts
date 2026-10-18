import { describe, expect, it, vi, afterEach } from "vitest";
import { agentHistory } from "@/lib/comparison";
import { byteSize, collectAssets, filterAssets } from "@/lib/assets";
import { responseAssets, streamReply, type ChatMsg } from "@/lib/openclaw";
import type { Thread } from "@/lib/threads";
afterEach(() => vi.unstubAllGlobals());
describe("Content workflow", () => {
  const thread: Thread = {
    id: "chat",
    title: "Music",
    agent: "adin",
    updatedAt: 9999,
    messages: [
      {
        id: "upload",
        role: "user",
        content: "",
        attachments: [
          {
            name: "music.mp3",
            mime: "audio/mpeg",
            dataUrl: "data:audio/mpeg;base64,YWJj",
            size: 3,
            createdAt: 1000,
          },
        ],
      },
      {
        id: "reply",
        role: "assistant",
        content: "[Brief](https://example.com/brief.pdf)",
        createdAt: 2000,
      },
    ],
    comparisonMessages: [
      { id: "image", role: "assistant", content: "![Cover](/files/cover.png)", createdAt: 3000 },
    ],
  };
  it("collects audio uploads and generated files across both histories", () => {
    const assets = collectAssets(thread);
    expect(assets.map((a) => a.name)).toEqual(["music.mp3", "brief.pdf", "cover.png"]);
    expect(assets[0]).toMatchObject({
      mime: "audio/mpeg",
      size: 3,
      createdAt: 1000,
      origin: "attached",
    });
    expect(assets[1]).toMatchObject({
      mime: "application/pdf",
      createdAt: 2000,
      origin: "generated",
    });
  });
  it("does not invent historical file timestamps or remote sizes", () => {
    const assets = collectAssets({
      ...thread,
      messages: [
        {
          id: "old",
          role: "user",
          content: "",
          attachments: [{ name: "old.pdf", mime: "application/pdf", dataUrl: "" }],
        },
      ],
      comparisonMessages: [],
    });
    expect(assets[0]?.createdAt).toBeUndefined();
    expect(assets[0]?.size).toBeUndefined();
  });
  it("searches file names and precise dates and sorts timestamps", () => {
    const assets = collectAssets(thread);
    expect(filterAssets(assets, "music", "newest").map((a) => a.name)).toEqual(["music.mp3"]);
    expect(filterAssets(assets, "1970-01-01", "oldest").map((a) => a.createdAt)).toEqual([
      1000, 2000, 3000,
    ]);
    expect(filterAssets(assets, "", "newest")[0]?.createdAt).toBe(3000);
  });
  it("computes exact base64 byte size", () => {
    expect(byteSize("data:text/plain;base64,YQ==")).toBe(1);
  });
  it("isolates assistant context for each selected agent", () => {
    const messages: ChatMsg[] = [
      { id: "p", role: "user", content: "One prompt" },
      { id: "a", role: "assistant", content: "Left", agent: "adin" },
      { id: "b", role: "assistant", content: "Right", agent: "mandarin" },
    ];
    expect(agentHistory(messages, "adin").map((m) => m.id)).toEqual(["p", "a"]);
    expect(agentHistory(messages, "mandarin").map((m) => m.id)).toEqual(["p", "b"]);
  });
  it("sends the same prompt simultaneously to two explicit agent models", async () => {
    const resolvers: ((r: Response) => void)[] = [];
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => resolvers.push(resolve)));
    vi.stubGlobal("fetch", fetchMock);
    const history: ChatMsg[] = [{ id: "p", role: "user", content: "Compare this idea" }];
    const replies = [vi.fn(), vi.fn()];
    const pending = Promise.all(
      ["adin", "mandarin"].map((agent, i) =>
        streamReply({ agent, sessionId: `chat:${agent}`, history, onDelta: replies[i] ?? vi.fn() }),
      ),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const bodies = fetchMock.mock.calls.map((call) =>
      JSON.parse((call as unknown as [string, RequestInit])[1].body as string),
    );
    expect(bodies.map((body) => body.model)).toEqual(["openclaw/adin", "openclaw/mandarin"]);
    expect(bodies[0].messages).toEqual(bodies[1].messages);
    resolvers.forEach((resolve, i) =>
      resolve(Response.json({ choices: [{ message: { content: `Reply ${i}` } }] })),
    );
    await pending;
    expect(replies[0]).toHaveBeenCalledWith("Reply 0");
    expect(replies[1]).toHaveBeenCalledWith("Reply 1");
  });
  it("captures structured generated files and rejects unsafe links", () => {
    expect(
      responseAssets({
        attachments: [
          { filename: "song.mp3", mime_type: "audio/mpeg", url: "/files/song.mp3", size: 123 },
          { url: "javascript:alert(1)" },
        ],
      }),
    ).toEqual([
      { name: "song.mp3", mime: "audio/mpeg", dataUrl: "", url: "/files/song.mp3", size: 123 },
    ]);
  });
});
