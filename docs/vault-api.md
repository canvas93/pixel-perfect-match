# OpenClaw / NAS Vault API contract

The existing deployment owns storage, authentication, and all REST handlers. No new backend is provisioned by this app.

## Proxy routing

`/vault` is also the app's HTML page. Route **GET requests with `Accept: application/json`**, all `POST /vault`, and file/delete requests under `/vault/` to the NAS/OpenClaw API. Route document navigations (`Accept: text/html`) to the app. Do not rewrite API failures to the app's HTML fallback. Protect every API and download with the deployment's authenticated proxy.

## List

`GET /vault`, `Accept: application/json`, returns an array or `{ "assets": [...] }` (also accepts `files`). All authorized files must be returned; filtering and sorting are client-side.

```json
{
  "assets": [{
    "id": "unique-server-id",
    "name": "background.mp3",
    "mime": "audio/mpeg",
    "size": 1234,
    "createdAt": "2026-10-18T06:09:00Z",
    "url": "/vault/background.mp3",
    "origin": "generated",
    "source": "Campaign music",
    "threadId": "chat-id"
  }]
}
```

Required: stable string ID and name (`filename` also accepted). Optional aliases: `mime_type`, `created_at` / `uploaded_at`, `download_url` / `path`, `thread_id`. Timestamps must be ISO strings or epoch milliseconds; size is bytes. Unknown historical sizes and times remain absent. Download URLs must be same-origin `/vault/…` paths; filenames must be URL-encoded and collision-safe.

## Upload

`POST /vault` receives multipart form data with `file`, plus optional `id`, `source`, `threadId`, `origin`, `createdAt`. Returns the saved file metadata directly or `{ "asset": ... }`, including its stable server ID and download path. The server supplies authoritative size, type, and timestamp. Chat attachment uploads and completed generated replies use the same endpoint. The server must validate names, authorization, size, and content, and avoid path traversal.

Chat collection supplies an `Idempotency-Key` matching its source asset ID. Honor this key across retries, including deleted-file tombstones, so a retry cannot duplicate or resurrect a deleted asset. Direct Vault uploads may omit it. Generated links are fetched only from the existing same-origin OpenClaw server, then uploaded as bytes.

## Delete and download

`DELETE /vault/:id` uses the URL-encoded server ID; any successful 2xx response is accepted, including 204. The app asks for confirmation first.

Downloads navigate directly to the server's asset URL, never a browser-retained blob. Return correct `Content-Type` and `Content-Disposition: attachment` headers. Existing chats are not rescanned on page load and old IndexedDB files are not automatically migrated or deleted; a one-off legacy migration is outside this change.

The Vault refreshes from the server on entry, window focus, and manual refresh. Chat text remains browser-local; multi-device Vault sync does not sync chat histories. A source-chat link only opens an existing conversation on devices that have that local history.