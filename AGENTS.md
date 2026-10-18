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
