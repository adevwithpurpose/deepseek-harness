# DSH Permanent Plugins (`<dsh-home>/plugins`)

Out-of-tree file-URL plugins mounted by `~/.dsh/profiles/web/cordis.patch.yml`
(Windows: `C:/Users/<user>/.dsh/profiles/web/cordis.patch.yml`). Plain ESM,
loaded by Node at web-server boot. **Insert rows are NOT hot-mounted — restart
the web server after any change here** (`dsh web` again, or the profile's
restart script).

`<dsh-home>` is the DSH profile dir — `~/.dsh` on Linux/macOS,
`C:/Users/<user>/.dsh` on Windows.

## One-shot install (POSIX shell)

```bash
DST="${HOME}/.dsh/plugins" && mkdir -p "$DST" "${HOME}/.dsh/profiles/web" \
  && cp plugins/dsh-git-guardrails.mjs plugins/dsh-omniroute-search.mjs \
     plugins/dsh-crawl4ai-fetch.mjs plugins/crawl4ai_fetch.py \
     plugins/dsh-youtube-transcript.mjs plugins/youtube_fetch_transcript.py \
     "$DST/"
cp plugins/cordis.patch.example.yml "${HOME}/.dsh/profiles/web/cordis.patch.yml"
sed -i "s|file:///<path-to-dsh-home>|file://${HOME}/.dsh|g" "${HOME}/.dsh/profiles/web/cordis.patch.yml"
```

The sed -i step is the portability trick: the patch file ships with the
`<path-to-dsh-home>` placeholder, and every plugin resolves its companion
script relative to its own location — nothing is hardcoded to an absolute
Windows path anymore (v3).

## Environment overrides (all optional)

| Env var | Used by | Default |
|---|---|---|
| `DSH_PYTHON` | crawl4ai + youtube plugins | `python3` (POSIX) / `python.exe` (Windows) |
| `DSH_CRAWL_SCRIPT` | crawl4ai plugin | `<plugin-dir>/crawl4ai_fetch.py` |
| `DSH_YT_SCRIPT` | youtube plugin | `<plugin-dir>/youtube_fetch_transcript.py` |
| `OMNIROUTE_API_KEY` | omniroute plugin | — (required only for that provider) |

## Hard contracts (learned 2026-08-22, do not relearn)

1. **`tools/pre-execute` receives a `ToolExecution`: parsed model arguments live on
   `exec.arguments`** (frozen, JSON-normalized) — there is no `exec.args`.
   Tool name is `exec.name` (`'pwsh'` / `'bash'` for shell calls).
2. **Waterfall deny shape:** `return { kind: 'deny', reason }`; every other path
   MUST `return next()`.
3. **Whole-command scanning is fail-closed:** a shell call whose text merely
   CONTAINS a blocked pattern is denied. Keep test strings in files
   (e.g. `.trash/guardrail-regex-test.mjs`), never inside inline `node -e "…"`.
4. **Never inline multi-line Python through `python -c` with newline collapsing**
   — it produces guaranteed SyntaxError. Ship a companion script instead.
5. **Restart after patch/plugin changes** (see header). Verify mounts via boot log:
   each plugin prints one registration line into `~/.dsh/web-server.log`.
6. Known limits: static indirection and alias invocation defeat text matching —
   this is a guardrail, not a sandbox; quoted mentions of blocked patterns are
   denied by design.

## Test procedure

The bundle lives inside the DSH repo under `plugins/`; commit here before and
after every change. Offline checks: `node --check` on each `.mjs`,
`python3 -m py_compile` on each `.py`, import smoke (`import()` on each `.mjs`).
Runtime verification: boot `dsh web` with the profile's `cordis.patch.yml` and
confirm each plugin's registration line in `~/.dsh/web-server.log` —
`[git-guardrails] Active …`, `[youtube-transcript] tool registered …`,
`[crawl4ai-fetch] fetchProvider "crawl4ai" registered`,
`[omniroute-search] provider registered …`. Live probes use nonexistent
refs/branches and a disposable scratch repo under `.trash/`, so an unblocked
run stays harmless. The 21-case regex matrix and `config-snapshot/` mirror
were Windows reference-machine artifacts and were NOT ported (the guard uses
`node --check` + the boot registration line instead).

## Follow-ups (tracked, not yet implemented)

- **CDG re-import** (memory: "CDG re-import + documented") — the referenced CDG
  files could not be located at last attempt (no source found); re-import once a
  copy of the original CDG distribution is available. Not required for the
  Linux port; nothing currently references it.

## Plugins

| Plugin | Registers | Purpose |
|---|---|---|
| `dsh-omniroute-search.mjs` | WebSearchProvider id=`omniroute` | POST to local OmniRoute gateway (`127.0.0.1:20128/v1/search`, Exa backend), cascade fallback to DDGS. Per-call guard prevents a second fallback attempt after an inner one already failed. |
| `dsh-crawl4ai-fetch.mjs` + `crawl4ai_fetch.py` | WebFetchProvider id=`crawl4ai` | JS-rendered pages → clean Markdown via local Python crawl4ai. The .mjs runs the companion .py with the resolved interpreter (`DSH_PYTHON` or platform default); the py must be installed in that env (`pip install crawl4ai` + `playwright install chromium`). |
| `dsh-git-guardrails.mjs` | `tools/pre-execute` listener | Denies destructive git/filesystem commands before dispatch: force-push (allows `--force-with-lease`, `--follow-tags`), `reset --hard`, `clean -f*`, `branch -D*`, recursive removal of system/workspace roots. Prefix matcher tolerates `-C <path>`, `-c k=v`, `--no-pager`, `git.exe`. |
| `dsh-youtube-transcript.mjs` + `youtube_fetch_transcript.py` | model tool `youtube_transcript` | Full transcript for any YouTube URL/ID in one call (30-min cache, optional `offset`/`limit` paging, `finalizeContent` delivers the complete paged text to the model). Extraction tiers: (1) InnerTube player API via stdlib urllib — no third-party deps, but bot-gated on some networks; (2) yt-dlp fallback — covers gated networks, recommended install. Source tier (manual captions vs auto-generated) is reported in the tool result and the model-visible header. Args: `url_or_id` (required), `lang`, `offset`, `limit`. |
