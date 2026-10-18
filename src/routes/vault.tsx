import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Archive, Download, FileText, Image, Music, Search, Loader2, Film, Upload, Trash2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  deleteAsset,
  downloadAssetPath,
  filterAssets,
  formatBytes,
  loadVault,
  uploadFile,
  useVault,
  type AssetSort,
  type VaultAsset,
} from "@/lib/assets";

export const Route = createFileRoute("/vault")({
  head: () => ({
    meta: [
      { title: "Asset Vault · OpenClaw" },
      {
        name: "description",
        content: "Find and download images, music, and documents from your OpenClaw conversations.",
      },
      { property: "og:title", content: "Asset Vault · OpenClaw" },
      {
        property: "og:description",
        content: "Your collected OpenClaw chat files, images, audio, and documents.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VaultPage,
});

function VaultPage() {
  const assets = useVault();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<AssetSort>("newest");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  async function refresh() {
    setReady(false);
    setError("");
    try {
      await loadVault();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your server files could not be loaded.");
    } finally {
      setReady(true);
    }
  }
  useEffect(() => {
    let active = true;
    void loadVault()
      .catch((e: unknown) => {
        if (active)
          setError(e instanceof Error ? e.message : "Your server files could not be loaded.");
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
    const onFocus = () => {
      void loadVault().then(() => { if (active) setError(""); }).catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : "Your server files could not be refreshed.");
      });
    };
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      window.removeEventListener("focus", onFocus);
    };
  }, []);
  const filtered = filterAssets(assets, query, sort);
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="border-b px-6 py-5 pl-14 md:pl-8">
        <div className="flex items-center gap-3">
          <Archive className="size-6 text-primary" />
          <h1 className="text-2xl font-bold">Asset Vault</h1>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {assets.length} files · Chats, images, audio & documents
        </p>
      </header>
      <div className="px-4 py-6 md:px-8">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="relative min-w-48 flex-1">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              aria-label="Search assets"
              placeholder="Search by file name or date…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={sort} onValueChange={(value) => setSort(value as AssetSort)}>
            <SelectTrigger aria-label="Sort assets" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="name">File name A–Z</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" title="Refresh files" aria-label="Refresh files" disabled={!ready || uploading} onClick={() => void refresh()}>
            <RotateCcw className="size-4" />
          </Button>
          <Button disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Upload
          </Button>
          <input ref={fileRef} type="file" multiple className="hidden" aria-label="Upload files to Vault" onChange={async (e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (!files.length) return;
            setUploading(true);
            try {
              for (const file of files) await uploadFile(file, { origin: "attached" });
              await refresh();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Upload failed.");
            } finally {
              setUploading(false);
            }
          }} />
        </div>
        {error && (
          <p role="alert" className="mb-4 text-sm text-destructive">
            {error}
          </p>
        )}
        {!ready ? (
          <div className="py-16 text-center text-muted-foreground">
            <Loader2 className="mx-auto size-6 animate-spin" />
          </div>
        ) : error && assets.length === 0 ? null : filtered.length === 0 ? (
          <div className="py-20 text-center">
            <Archive className="mx-auto mb-4 size-10 text-muted-foreground" />
            <h2 className="text-lg font-semibold">
              {query ? "No matching files" : "No assets yet"}
            </h2>
          </div>
        ) : (
          <>
            <div className="hidden grid-cols-[minmax(0,2fr)_1fr_1fr_minmax(180px,1.5fr)_88px] gap-4 border-b px-3 pb-3 text-xs font-medium uppercase text-muted-foreground lg:grid">
              <span>File / conversation</span>
              <span>Type</span>
              <span>Size</span>
              <span>Created / uploaded</span>
              <span />
            </div>
            {filtered.map((asset) => (
              <AssetRow key={asset.id} asset={asset} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function AssetRow({ asset }: { asset: VaultAsset }) {
  const [busy, setBusy] = useState(false);
  const Icon = asset.mime.startsWith("image/")
    ? Image
    : asset.mime.startsWith("audio/")
      ? Music
      : asset.mime.startsWith("video/")
        ? Film
        : FileText;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_88px] items-center gap-3 border-b px-3 py-4 lg:grid-cols-[minmax(0,2fr)_1fr_1fr_minmax(180px,1.5fr)_88px] lg:gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-md bg-secondary text-primary">
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="break-all text-sm font-medium">{asset.name}</p>
          {asset.threadId ? <Link
            to="/c/$threadId"
            params={{ threadId: asset.threadId }}
            className="block truncate text-xs text-muted-foreground hover:text-primary"
          >
            {asset.source}
          </Link> : <p className="truncate text-xs text-muted-foreground">{asset.source}</p>}
        </div>
      </div>
      <span className="col-start-1 text-xs text-muted-foreground lg:col-auto">
        {asset.mime} · {asset.origin}
      </span>
      <span className="col-start-1 font-mono text-xs text-muted-foreground lg:col-auto">
        {formatBytes(asset.size)}
      </span>
      <span className="col-start-1 font-mono text-xs text-muted-foreground lg:col-auto">
        {asset.createdAt ? (
          <time
            dateTime={new Date(asset.createdAt).toISOString()}
            title={new Date(asset.createdAt).toISOString()}
          >
            {new Date(asset.createdAt).toLocaleString(undefined, {
              year: "numeric",
              month: "short",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              timeZoneName: "short",
            })}
          </time>
        ) : (
          "Timestamp unavailable (older file)"
        )}
      </span>
      <div className="col-start-2 row-start-1 flex items-center gap-2 lg:col-auto lg:row-auto">
      <Button
        asChild
        variant="ghost"
        size="icon"
        title={`Download ${asset.name}`}
        aria-label={`Download ${asset.name}`}
      >
        <a href={downloadAssetPath(asset)} download={asset.name}><Download /></a>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        disabled={busy}
        title={`Delete ${asset.name}`}
        aria-label={`Delete ${asset.name}`}
        onClick={async () => {
          if (!window.confirm(`Delete ${asset.name} from the Vault?`)) return;
          setBusy(true);
          try {
            await deleteAsset(asset);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Delete failed.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <Loader2 className="animate-spin" /> : <Trash2 className="text-destructive" />}
      </Button>
      </div>
    </div>
  );
}
