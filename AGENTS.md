<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep OpenClaw requests browser-side and same-origin behind the deployment's authenticated reverse proxy; this preserves the existing backend rather than substituting another AI service.
- Centralize cron request parameters and response normalization in the OpenClaw client so listing, history, and execution share consistent error handling.
- Keep chat text in deployment-owned browser storage, but centralize Vault REST calls in the browser-side vault-api client against the existing authenticated OpenClaw/NAS proxy; server-owned files enable multi-device access without substituting another backend.
- Collect files on attachment upload and reply completion, never by rescanning saved chats; this avoids repeated streaming uploads and resurrecting deleted server files.
- Keep comparison histories separate and tag assistant replies with their agent; use independent session IDs to prevent cross-agent context leakage.
- Compose chat transcripts and input with AI Elements, retaining domain-specific attachment collection and chart rendering around those primitives.
- Picker values containing "/" are raw model ids sent unchanged; bare ids are OpenClaw agents mapped to openclaw/<id> — one field drives both without a schema change.
