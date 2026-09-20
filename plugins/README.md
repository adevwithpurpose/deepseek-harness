# DSH Permanent Plugins (`~/.dsh/plugins`)

Out-of-tree file-URL plugins mounted by `C:\Users\saf08\.dsh\profiles\web\cordis.patch.yml`.
Plain ESM, loaded by Node at web-server boot. **Insert rows are NOT hot-mounted —
restart via `C:\Users\saf08\.dsh\restart-web.ps1` after any change here.**

## Plugins

| Plugin | Registers | Purpose |
|---|---|---|
| `dsh-omniroute-search.mjs` | `WebSearchProvider id=omniroute` | POST to local OmniRoute gateway (`127.0.0.1:20128/v1/search`, Exa backend), cascade fallback to Python `ddgs`. Per-call guard prevents a second DDGS attempt after an inner fallback already failed. |
| `dsh-crawl4ai-fetch.mjs` + `crawl4ai_fetch.py` | `WebFetchProvider id=crawl4ai` | JS-rendered pages → clean Markdown via local Python Crawl4AI. The `.mjs` invokes the companion `.py` as `python.exe crawl4ai_fetch.py "<url>"`; JSON on stdout, banners on stderr. |
| `dsh-git-guardrails.mjs` | `tools/pre-execute` listener | Denies destructive git/filesystem pwsh commands before dispatch: force-push (allows `--force-with-lease`, `--follow-tags`), `reset --hard`, `clean -f*`, `branch -D*`, recursive removal of system/workspace roots. Prefix matcher tolerates `-C <path>`, `-c k=v`, `--no-pager`, `git.exe`. |
| `dsh-youtube-transcript.mjs` | model tool `youtube_transcript` | Transcript for any YouTube URL/ID. Wraps the vault skill's `extract-transcript.py` (captions API → yt-dlp+cookies → faster-whisper). v2: 30-min in-memory cache, optional `offset`/`limit` paging, `finalizeContent` delivers the full paged text to the model (UI render stays compact). Args: `url_or_id` (required), `lang`, `offset`, `limit`. |

## Hard contracts (learned 2026-08-22, do not relearn)

1. **`tools/pre-execute` receives a `ToolExecution`: parsed model arguments live on
   `exec.arguments`** (frozen, JSON-normalized) — there is no `exec.args`.
   Tool name is `exec.name` (`'pwsh'` for shell calls).
2. **Waterfall deny shape:** `return { kind: 'deny', reason }`; every other path
   MUST `return next()`.
3. **Whole-command scanning is fail-closed:** a pwsh call whose text merely
   CONTAINS a blocked pattern is denied. Keep test strings in files
   (e.g. `.trash/guardrail-regex-test.mjs`), never inside inline `node -e "…"`.
4. **Never inline multi-line Python through `python -c` with newline collapsing**
   — it produces guaranteed SyntaxError. Ship a companion script instead.
5. **Restart after patch/plugin changes** (see header). Verify mounts via boot log:
   each plugin prints one registration line into `~/.dsh/web-server.log`.
6. Known limits: static indirection (`& $g reset --hard`, `[System.IO.Directory]::Delete($p,$true)`)
   defeats text matching — this is a guardrail, not a sandbox; quoted mentions of blocked
   patterns are denied by design. Recursive-delete matching is order-insensitive and covers
   pwsh aliases (`rd/del/erase/ri/rm`), but only the exact `E:\Anti-Gravity` root is
   protected there — subpaths stay workable.

## Test procedure

Offline regex matrix: `node E:\Anti-Gravity\.trash\guardrail-regex-test.mjs` (21 cases).
Live probes use nonexistent refs/branches and a disposable scratch repo under
`E:\Anti-Gravity\.trash\`, so an unblocked run stays harmless. The plugins dir is a git
repo — commit here before and after every change; `config-snapshot/cordis.patch.yml`
mirrors the active patch layer for rollback.
