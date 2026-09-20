# DeepSeek Harness Setup & Plugin Guide

This guide contains end-to-end instructions for installing, configuring, and extending **DeepSeek Harness (DSH)**. It is formatted with exact commands and structured rules so an **AI agent** (e.g. OpenCode, Claude Code, Antigravity) or a developer can perform the setup automatically.

---

## 1. Quickstart: Building and Installing DSH

### Prerequisites
- **Node.js**: v22.0.0 or higher (v24 LTS recommended)
- **pnpm**: v9 or higher (`npm install -g pnpm`)
- **Python** (optional, for web fetch & transcript tools): Python 3.10+

### Step 1: Install Dependencies
```bash
cd deepseek-harness
pnpm install
```

### Step 2: Build the Monorepo
```bash
pnpm run build
```
*(This builds all 252 packages, client UI libraries, and the Vite web frontend).*

### Step 3: Link the Global `dsh` CLI
```bash
cd apps/cli
npm link
```

### Step 4: Verify Installation
```bash
dsh --version
```
Expected output: `0.1.1-rc.2` (or current release version).

---

## 2. Directory & Configuration Structure

DeepSeek Harness stores its configuration and profile state under `~/.dsh` (e.g. `C:\Users\<username>\.dsh` on Windows, `~/.dsh` on macOS/Linux).

```
~/.dsh/
├── settings.yaml                  # Model providers, API keys, and timeouts
├── profiles/
│   └── web/
│       └── cordis.patch.yml       # Active plugins, policies, and system rules
└── plugins/                       # Custom out-of-tree plugins (.mjs)
    ├── dsh-git-guardrails.mjs
    ├── dsh-omniroute-search.mjs
    ├── dsh-crawl4ai-fetch.mjs
    ├── crawl4ai_fetch.py
    └── dsh-youtube-transcript.mjs
```

---

## 3. Initial Configuration (`settings.yaml`)

Create or edit `~/.dsh/settings.yaml` with your model provider definitions.

You can copy the provided template:
```bash
cp plugins/settings.example.yaml ~/.dsh/settings.yaml
```

### Key Provider Settings:
```yaml
llm-pi-ai:
  providers:
    omniroute:
      displayName: OmniRoute
      api: openai-completions
      baseURL: http://127.0.0.1:20128/v1
      apiKeyEnv: OMNIROUTE_API_KEY
      timeoutMs: 120000
      streamIdleTimeoutMs: 300000
      retryPolicy:
        mode: normal
        maxRetries: 3
      models:
        - id: oc/big-pickle
          name: oc/Big Pickle
          contextWindow: 200000
          maxTokens: 32000
        - id: cx/gpt-5.6-sol-medium
          name: GPT-5.6 Sol Medium
          contextWindow: 1048576
          maxTokens: 65536
```
*(Tip: Always set `streamIdleTimeoutMs: 300000` and `maxRetries: 3` so heavy reasoning models don't time out).*

---

## 4. Custom Plugins Catalog & Management

All plugins in this repository are modular, ESM-based Cordis plugins located in `plugins/`. Copy them into `~/.dsh/plugins/` to use them:

```bash
mkdir -p ~/.dsh/plugins
cp plugins/* ~/.dsh/plugins/
```

### Plugin 1: Git & Workspace Guardrails (`dsh-git-guardrails.mjs`)
- **Purpose**: Intercepts tool calls at runtime (`tools/pre-execute` boundary) and blocks destructive actions (e.g. `git push --force`, `git reset --hard`, `git clean -f`, `git branch -D`, and deletion of project roots).
- **Dependencies**: None.
- **How to Enable**: Add under `insert:` in `~/.dsh/profiles/web/cordis.patch.yml`:
  ```yaml
  - insert:
      - id: git-guardrails
        name: 'file:///C:/Users/<username>/.dsh/plugins/dsh-git-guardrails.mjs'
  ```
- **How to Disable**: Remove or comment out the block in `cordis.patch.yml`.

---

### Plugin 2: OmniRoute Web Search Provider (`dsh-omniroute-search.mjs`)
- **Purpose**: Registers the `omniroute` search provider with `ctx.web`. Routes queries to your local OmniRoute / Exa endpoint (`127.0.0.1:20128/v1/search`) with automatic fallback to Python DuckDuckGo (`ddgs`).
- **Dependencies**: OmniRoute running locally OR Python `pip install duckduckgo_search`.
- **How to Enable**:
  1. Mount the plugin in `cordis.patch.yml`:
     ```yaml
     - insert:
         - id: omniroute-search
           name: 'file:///C:/Users/<username>/.dsh/plugins/dsh-omniroute-search.mjs'
     ```
  2. Pin the search provider in `cordis.patch.yml`:
     ```yaml
     - id: web
       config:
         searchProvider: omniroute
     ```
- **How to Disable**: Remove the insert block and set `searchProvider: deepseek-official` (or `exa`).

---

### Plugin 3: Crawl4AI Web Fetch Provider (`dsh-crawl4ai-fetch.mjs` + `crawl4ai_fetch.py`)
- **Purpose**: High-fidelity web page scraper that executes JavaScript and extracts clean Markdown (bypasses Cloudflare / SPA blank screens).
- **Dependencies**: Python 3.10+ and Crawl4AI:
  ```bash
  pip install crawl4ai
  playwright install chromium
  ```
- **How to Enable**:
  1. Mount the plugin in `cordis.patch.yml`:
     ```yaml
     - insert:
         - id: crawl4ai-fetch
           name: 'file:///C:/Users/<username>/.dsh/plugins/dsh-crawl4ai-fetch.mjs'
     ```
  2. Pin the fetch provider in `cordis.patch.yml`:
     ```yaml
     - id: web
       config:
         fetchProvider: crawl4ai
     ```
- **How to Disable**: Change `fetchProvider: http` in `cordis.patch.yml`.

---

### Plugin 4: YouTube Transcript Model Tool (`dsh-youtube-transcript.mjs`)
- **Purpose**: Model tool `youtube_transcript`. Fetches full transcripts in 1 call with 30-minute memory caching and pagination support (`offset`/`limit`).
- **Dependencies**: Python script / extractor.
- **How to Enable**:
  Add under `insert:` in `cordis.patch.yml`:
  ```yaml
  - insert:
      - id: youtube-transcript
        name: 'file:///C:/Users/<username>/.dsh/plugins/dsh-youtube-transcript.mjs'
  ```
- **How to Disable**: Remove or comment out the block in `cordis.patch.yml`.

---

## 5. Running and Restarting the Web Server

### Starting the Server
```bash
dsh web
```
This serves the Web UI on `http://127.0.0.1:3080`.

### Safe Background Restarts (PowerShell / Windows)
If `dsh web` is already running, starting a second instance will fail with `listen EADDRINUSE: address already in use 127.0.0.1:3080`.

To restart cleanly:
```powershell
# Stop existing node processes on port 3080 and start fresh:
pwsh C:\Users\<username>\.dsh\restart-web.ps1
```

Or manually:
```powershell
Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'bin\.js.{0,6}web' } | Stop-Process -Force
dsh web
```

---

## 6. Built-in Fork Enhancements

This repository includes several upstream stability fixes:

1. **Reasoning Auto-Continuation (`agent-loop`):**
   When reasoning models generate `<think>...</think>` thoughts without immediately generating text or tool calls, the engine automatically injects a continuation message and prompts the model rather than silently terminating the turn.
2. **Stream Timeout Decoupling:**
   Upstream `dsh-v0.1.1-rc.2` fix ensuring long reasoning pauses or image resolutions don't prematurely abort SSE chat streams.
3. **Step-Boundary Retries:**
   Automatic retry on 503 capacity or socket blips with exponential backoff.

---

## 7. Checklist for AI Agents Setting Up for Users

If an AI Agent is setting this up for a user, follow this automated checklist:

- [ ] Check Node version (`node -v` >= 22.0.0) and pnpm (`pnpm -v`).
- [ ] Run `pnpm install` in repository root.
- [ ] Run `pnpm run build` in repository root.
- [ ] Navigate to `apps/cli` and run `npm link`.
- [ ] Ensure `~/.dsh/` and `~/.dsh/plugins/` directories exist.
- [ ] Copy desired `.mjs` and `.py` files from `plugins/` to `~/.dsh/plugins/`.
- [ ] Configure `~/.dsh/settings.yaml` with valid models and endpoints.
- [ ] Configure `~/.dsh/profiles/web/cordis.patch.yml` with correct absolute paths (e.g. `file:///C:/Users/.../.dsh/plugins/...`).
- [ ] Start or restart `dsh web` and verify output in terminal.
