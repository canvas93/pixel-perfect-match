import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteVaultAsset, listVaultAssets, uploadVaultAsset } from "@/lib/vault-api";
import { downloadAssetPath, loadVault, saveAssets } from "@/lib/assets";
import { threads } from "@/lib/threads";

afterEach(() => vi.unstubAllGlobals());
const asset = {
  id: "song 1",
  filename: "background music.mp3",
  mime_type: "audio/mpeg",
  size: 1234,
  created_at: "2026-10-18T06:09:00Z",
  path: "/vault/background%20music.mp3",
};
describe("Server Vault", () => {
  it("lists through same-origin GET /vault with JSON negotiation and no browser persistence", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ assets: [asset] }));
    vi.stubGlobal("fetch", fetcher);
    const files = await listVaultAssets();
    expect(fetcher).toHaveBeenCalledWith(
      "/vault",
      expect.objectContaining({
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
      }),
    );
    expect(files[0]).toMatchObject({
      id: "song 1",
      name: "background music.mp3",
      mime: "audio/mpeg",
      size: 1234,
      createdAt: Date.parse("2026-10-18T06:09:00Z"),
      dataUrl: "",
    });
    expect(downloadAssetPath(files[0] as NonNullable<(typeof files)[0]>)).toBe(
      "/vault/background%20music.mp3",
    );
  });
  it("uploads multipart bytes and source metadata to POST /vault", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ asset }));
    vi.stubGlobal("fetch", fetcher);
    await uploadVaultAsset(new Blob(["music"], { type: "audio/mpeg" }), "background music.mp3", {
      id: "upload-1",
      threadId: "chat-1",
      createdAt: 1792303740000,
    });
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/vault");
    expect(init.method).toBe("POST");
    const form = init.body as FormData;
    expect(form.get("file")).toBeInstanceOf(Blob);
    expect(form.get("threadId")).toBe("chat-1");
    expect(form.get("createdAt")).toBe("1792303740000");
    expect(init.headers).toMatchObject({ "Idempotency-Key": "upload-1" });
  });
  it("deletes via encoded server ID and accepts an empty success response", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetcher);
    await deleteVaultAsset("song 1");
    expect(fetcher).toHaveBeenCalledWith(
      "/vault/song%201",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
  it("refetches server data rather than keeping a browser-local list", async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(Response.json([])));
    vi.stubGlobal("fetch", fetcher);
    await loadVault();
    await loadVault();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("rejects HTML API misrouting, failed requests and unsafe download paths", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response("<html>Vault page</html>", { headers: { "content-type": "text/html" } }),
      );
    vi.stubGlobal("fetch", fetcher);
    await expect(listVaultAssets()).rejects.toThrow("returned a page");
    fetcher.mockResolvedValue(new Response(null, { status: 403 }));
    await expect(deleteVaultAsset("1")).rejects.toThrow("403");
    fetcher.mockResolvedValue(
      Response.json([{ ...asset, path: "https://outside.example/file.mp3" }]),
    );
    await expect(listVaultAssets()).rejects.toThrow("invalid file path");
  });
  it("does not invent missing file sizes or timestamps", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json([{ id: "1", name: "song.mp3" }])),
    );
    const files = await listVaultAssets();
    expect(files[0]?.size).toBeUndefined();
    expect(files[0]?.createdAt).toBeUndefined();
    expect(files[0]?.url).toBe("/vault/song.mp3");
  });
  it("uploads generated files once and never reuploads server-owned Vault links", async () => {
    const fetcher = vi
      .fn()
      .mockImplementation((url: string) =>
        Promise.resolve(
          url === "/files/new.mp3"
            ? { ok: true, blob: async () => new Blob(["music"], { type: "audio/mpeg" }) }
            : Response.json({ ...asset, id: "generated-once" }),
        ),
      );
    vi.stubGlobal("fetch", fetcher);
    const generated = {
      id: "generated-once",
      name: "new.mp3",
      mime: "audio/mpeg",
      dataUrl: "",
      url: "/files/new.mp3",
      origin: "generated" as const,
      source: "Chat",
      threadId: "chat",
    };
    await saveAssets([generated]);
    await saveAssets([generated, { ...generated, id: "server-file", url: "/vault/new.mp3" }]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1]?.[0]).toBe("/vault");
  });
  it("does not persist file bytes in either chat lane", () => {
    const message = {
      id: "upload",
      role: "user" as const,
      content: "",
      attachments: [
        {
          name: "song.mp3",
          mime: "audio/mpeg",
          dataUrl: "data:audio/mpeg;base64,YWJj",
          url: "/vault/song.mp3",
        },
      ],
    };
    const thread = threads.create({ messages: [message], comparisonMessages: [message] });
    const saved = JSON.parse(localStorage.getItem("openclaw.threads.v1") ?? "[]").find(
      (t: { id: string }) => t.id === thread.id,
    );
    expect(saved.messages[0].attachments[0].dataUrl).toBe("");
    expect(saved.comparisonMessages[0].attachments[0].dataUrl).toBe("");
    expect(saved.messages[0].attachments[0].url).toBe("/vault/song.mp3");
  });
});
