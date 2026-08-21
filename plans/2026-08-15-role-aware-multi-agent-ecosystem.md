# Role-Aware Multi-Agent Ecosystem Audit and Implementation Plan

## Purpose

This plan turns the current role-themed DeepSeek Harness presets into an enforced, observable, cost-bounded multi-agent system. It is self-contained for an implementation agent that has not seen the originating conversation.

The desired system has six roles: Orchestrator, Explorer, Librarian, Oracle, Fixer, and Designer. A delegation must select the intended role, compose that role's preset, choose its configured model chain, enforce its tool and skill policy, expose only its MCP integrations, preserve direct parent-child messaging, log every model-visible decision, and obey global retry and subagent budgets.

## User decisions fixed by this plan

- OmniRoute is the LLM provider route.
- Model retry budget: **five total attempts**, meaning one initial request plus at most four retries.
- Subagent safety budget: **three concurrent children, eight total child starts per top-level orchestration root, delegation depth one**. Workflow configuration can enforce these limits immediately for workflow-created children; a unified root budget must be built to cover direct subagent calls as well.
- Specialist model preferences come from the user's `oh-my-opencode-slim` `omniroute` preset, normalized to DSH's provider/model vocabulary.
- Existing backup remains the rollback baseline: `E:/Anti-Gravity/backups/dsh-snapshot-20260815/`.
- Approval prompts remain disabled; children must not gain greater authority than their parent.

## Audit summary

### What DSH already ships and should be reused

1. **Agent preset composition**
   - `packages/preset/agent-presets/src/index.ts` implements standing preset mounts, `mount()`, `composeFrom()`, and durable preset selection.
   - `packages/preset/agent-presets/src/session.ts` logs `agent-preset/selected` so composition is reconstructable.
   - The Web/Host factory mounts a preset during unpublished agent creation, allowing failed composition to roll back cleanly.

2. **Subagent execution and communication**
   - `packages/subagent/subagent` supplies named providers, one-shot and continuable children, direct-parent authority, durable descriptors, follow-up, interrupt, enumeration, and reporting.
   - In-process spawn/fork inherit parent provider/model by default but accept `AgentOptions` overrides.
   - `toolFilter` is enforced through `ctx.tools.restrict()`: tools disappear from the prompt and refuse execution.
   - `tool-subagent-control` supplies `send_message`, `interrupt_agent`, and `list_agents`.
   - `tool-subagent-report` supplies the child-to-parent report channel to continuable in-process children.

3. **Workflow execution**
   - `packages/workflow/workflow-worker-thread/src/index.ts` already exposes `maxConcurrentAgents` and `maxTotalAgents`.
   - Defaults are unsafe for this deployment: automatic concurrency can reach 16 and total starts default to 1000.
   - Workflow `agent()` calls already accept explicit provider/model overrides.

4. **Model requests and retries**
   - `packages/llm/llm-retry` retries exact-provider requests through `agent/request-error`.
   - `packages/llm/llm-pi-ai/src/config.ts` accepts a per-provider `retryPolicy` with `maxRetries`.
   - The retry plugin does not perform model or provider failover.

5. **Skills, MCP, Web, and telemetry**
   - Skills are scope-layered through `packages/skill/skill` and loaded through `tool-skill`.
   - `packages/mcp/mcp-client` supports stdio and Streamable HTTP MCP servers and registers namespaced tools.
   - `packages/web/web` has provider-neutral search/fetch seams.
   - Session logs, subagent lifecycle events, workflow events, projections, and OTel telemetry already provide most observability primitives.

### What the current custom implementation actually does

Current files are under `C:/Users/saf08/.dsh/.agent-presets/` and `C:/Users/saf08/.dsh/profiles/web/cordis.patch.yml`.

- Five specialist preset directories exist: Explorer, Librarian, Oracle, Fixer, and Designer.
- There is **no Orchestrator preset** even though orchestration is the root role.
- `settings.yaml` currently sets the default preset to `designer`, so new ordinary sessions can start with the wrong role.
- Model lists and skill lists are persona prose only. They do not route a model, create fallback, load a skill, or restrict skill access.
- Ordinary `subagent` calls inherit the parent's preset and model. Calling the child `Librarian` in its prompt does not mount the Librarian preset.
- The Librarian test ran on the parent's Gemini model; only the explicit workflow test demonstrably used `opencode-go/minimax-m3`.
- Explorer and Oracle mount `@deepseek-ai/dsh-tool-fs`, which exposes `write` and `edit`. Their read-only rule is advisory, not enforced.
- Every role mounts the filesystem skill provider, exposing the merged skill catalog. There is no role skill allowlist.
- Eleven named desired skills are absent from the current DSH skill catalog: `skill-router`, `skill-discovery`, `deepwork`, `handoff`, `verification-planning`, `efficient-web-research`, `impeccable`, `ui-ux-pro-max`, `accessibility`, `e2e-testing`, and `mcp-server-patterns`.
- Context7 and GitHub-search MCPs were described but not configured.
- `web_search` fails because `web-search-deepseek` expects `DEEPSEEK_API_KEY`; the credential store currently has OmniRoute credentials, not a DeepSeek search credential.
- `web_fetch` is configured with the HTTP provider, but it needs a refreshed assembled-profile smoke test.
- `tool-subagent-report` is already installed on the host and contributes child setup. Repeating it in every role preset is unnecessary and risks duplicate contributions.
- The profile uses junctions to source-tree packages that are not declared in the profile's `package.json`. This is fragile across rebuilds and upgrades.
- `SYSTEM-CHANGES.md` overstates completion and must be corrected after real enforcement ships.

## Target architecture

### 1. Add a first-class role policy seam

Create a complete capability seam under a new package group:

- `packages/role/role` — Service Definition: role vocabulary, validated configuration, registry, resolver, durable types, events, invariant.
- `packages/role/role-config` — Service Provider: loads deployment role policies from Cordis config/settings and resolves a role into an immutable execution policy.
- `packages/role/tool-delegate` — Consumer: model-facing `delegate` tool that accepts role, objective, acceptance criteria, scope/ownership, and background mode. It must not expose raw provider/model/tool-policy knobs to the model.
- `packages/client/ui-role` or the nearest existing client UI package — read-only display of resolved role, preset, selected model, fallback position, and policy version on child sessions.

Do not alter the agent loop. Integrate through the existing agent factory, subagent, tools, skills, session, and workflow extension points.

### 2. Role policy data model

Define a validated configuration similar to:

```yaml
roles:
  librarian:
    preset: librarian
    provider: spawn
    models:
      - provider: omniroute
        model: opencode-go/minimax-m3
      - provider: omniroute
        model: opencode-go/deepseek-v4-flash-max
      - provider: omniroute
        model: antigravity/gemini-3.6-flash-high
    tools:
      allow: [read, glob, grep, web_search, web_fetch, skill, report]
    skills:
      allow: [research, youtube-summarizer, agent-browser, mcp2cli]
    mcps: [context7, gh_grep]
    maxDepth: 1
```

Requirements:

- Role ids match the preset id containment rule: `[a-z0-9][a-z0-9-]*`.
- Reject missing presets, empty model chains, unknown tools, unknown skills, and unknown MCP server ids at the earliest resolvable point.
- Record a stable policy revision/hash. Never put secrets in role config or session events.
- Keep provider/model identifiers separate; do not use OpenCode's combined `opencode-omniroute/...` string inside DSH.
- Resolve the whole policy before the child is published. No hidden defaults inside execution.

### 3. Extend in-process delegation with explicit child preset selection

The key missing primitive is a child role/preset override.

Modify the subagent request and descriptor contracts to carry an optional `agentPreset` (or a role-owned resolved composition reference):

- `packages/subagent/subagent/src/types.ts` — add the request field and provider capability if needed.
- `packages/subagent/subagent/src/descriptor.ts` — persist the chosen preset for continuable cold resume.
- `packages/subagent/subagent/src/child-agent.ts` — when an explicit child preset is supplied, mount that preset during unpublished creation instead of calling `composeFrom(parent)`. When omitted, retain exact parent-composition inheritance.
- Construct `SessionHeader.agentPreset` from the resolved child preset, not the parent scope.
- Reject explicit preset selection for providers that cannot enforce it. Out-of-process providers remain capability-gated.

Acceptance checks:

- An Orchestrator on the `orchestrator` preset delegates `role: librarian`; the child's header and cold-resumed composition both name `librarian`.
- The same child uses Librarian tools/skills even though the parent does not.
- Omitting role/preset preserves current `composeFrom` behavior.
- Failed preset mount publishes no Agent or Session.

### 4. Enforce tool and skill policy

#### Tools

- Use existing `tools.restrict({ allow })` for global tools.
- Make each role preset contain only its local model-facing tools. Do not mount `tool-fs` in a supposedly read-only preset unless its mutating names are removed by an effective child restriction.
- The delegation tool must pass the resolved role tool restriction into the in-process subagent request.
- Add tests that execute denied tools directly, not just tests that inspect prompt schemas.

Recommended role tool sets:

- Orchestrator: delegation/control, workflow, goals, todos, memory, read/search, ask-user; no routine source mutation.
- Explorer: `read`, `read_image` if needed, `glob`, `grep`, `skill`, child `report`; no shell, write, edit, delegation, workflow, or external mutation.
- Librarian: Explorer read tools plus `web_search`, `web_fetch`, approved read-only MCP tools, skill, report; no workspace mutation.
- Oracle: read/search, memory recall, skill, report; no shell or mutation by default.
- Fixer: read/search/write/edit, platform shell, jobs, skill, report; no delegation unless explicitly justified.
- Designer: Fixer filesystem/shell tools plus image/browser tooling; external mutations remain approval-governed.

#### Skills

Add scope-aware skill policy rather than relying on persona text:

- Extend `packages/skill/skill` with a restriction mechanism analogous to `tools.restrict()`, or add a narrowly owned `skill-policy` plugin that filters both catalog visibility and load execution by viewing scope.
- Multiple restrictions intersect. Unknown names fail loud. Nearest scope cannot widen a parent/delegation restriction.
- A denied skill must be absent from the catalog and rejected by the loader tool.
- Preserve direct user invocation policy where allowed, but role policy still applies.

Audit each desired skill before installation. Do not blindly copy skills from slim; translate only useful workflow content and preserve DSH safety/approval rules. Add the missing skills as separate, reviewable work or map them to existing DSH skills when equivalent.

### 5. Configure MCP by role

Use `@deepseek-ai/dsh-mcp-client` rather than building a new MCP client.

- Mount Context7 and GitHub code-search clients in the Librarian preset's standing scope so their `mcp__...` tools are role-local.
- Prefer read-only GitHub search. Do not expose issue creation, PR creation, or repository mutation tools to Librarian.
- Resolve credentials through `ctx.credentials`/environment references; never put tokens in YAML, logs, plans, or session events.
- Add connection health and tool-catalog verification at preset mount.
- If an MCP server cannot expose a read-only operation subset, restrict its names through role tool policy or do not mount it.

MCP server mode is not needed for this objective and should remain out of scope.

### 6. Implement model chains and failover

Separate two concepts:

1. **Transient retry on the same model/route** — existing `llm-retry`.
2. **Fallback to the next configured model** — new behavior.

#### Immediate deployment policy

Configure OmniRoute's `llm-pi-ai.providers.omniroute.retryPolicy` as:

```yaml
retryPolicy:
  mode: normal
  maxRetries: 4
```

This yields the chosen **five total attempts**. Retain the default eligible transient codes unless evidence supports changing them. Do not use `mode: always`.

#### Durable cross-model fallback

Add a model-chain recovery plugin, preferably a generic LLM capability rather than embedding fallback in the role tool:

- Role resolution attaches an ordered model chain to the child before publication.
- Persist the chain identity/policy revision and current index without logging credentials.
- On eligible `agent/request-error` outcomes, advance to the next model only after the configured same-model retry budget is exhausted, or define a single global attempt coordinator so budgets cannot multiply. The preferred final design is a **single global five-attempt budget across the chain**.
- Append a non-surface `llm/failover` event containing role, policy revision, from/to provider+model, canonical error code, and attempt counters.
- Reconstruct the selected provider/model through the existing request waterfall and request header logging.
- Do not fail over authentication, invalid-request, policy, or context-size errors unless a specific next model can resolve that class safely.
- Preserve prompt-prefix stability within each provider/model. A model switch naturally establishes a different provider cache identity.

Model chain normalization:

- Orchestrator: `omniroute/cx/gpt-5.6-terra`, `omniroute/antigravity/gemini-3.6-flash-high`, `omniroute/oc/big-pickle`.
- Oracle: `omniroute/cx/gpt-5.6-sol-medium`, `omniroute/oc/big-pickle`, `omniroute/antigravity/gemini-3.6-flash-high`.
- Librarian: `omniroute/opencode-go/minimax-m3`, `omniroute/opencode-go/deepseek-v4-flash-max`, `omniroute/antigravity/gemini-3.6-flash-high`.
- Explorer: `omniroute/oc/big-pickle`, `omniroute/opencode-go/deepseek-v4-flash-max`, `omniroute/cmd/deepseek/deepseek-v4-flash`, `omniroute/cx/gpt-5.6-luna-medium`.
- Designer: verify the preferred Xiaomi id against OmniRoute's live catalog; use the configured `opencode-go/mimo-v2.5-pro` if `cmd/xiaomi/mimo-v2.5-pro` is unavailable. Other choices: `antigravity/gemini-3.6-flash-high` and `cx/gpt-5.6-terra-medium`.
- Fixer: `omniroute/oc/big-pickle`, `omniroute/opencode-go/deepseek-v4-flash-max`, `omniroute/cx/gpt-5.6-luna-high`, and the verified MiMo id.

### 7. Enforce subagent budgets

Apply both static deployment limits and runtime ownership accounting.

#### Static limits

- Every `tool-subagent` instance exposed to a model: `maxDepth: 1`.
- `workflow-worker-thread`: `maxConcurrentAgents: 3` and `maxTotalAgents: 8`.
- Every workflow call inherits an engine-side total cap; scripts cannot raise it.
- Disable delegation tools entirely in specialist presets unless a role explicitly needs child delegation. The initial release should allow spawning only from Orchestrator.

#### Runtime budget

Add parent-root budget accounting so multiple direct tool calls cannot bypass workflow limits:

- Define a deployment-configured budget service keyed by the top-level delegation root/session.
- Reserve a slot before provider startup; release concurrency slots after settlement; never return consumed total-start budget.
- Count one-shot, continuable, workflow, and Ralph children through the same authoritative start path.
- Reject the ninth child with a stable error before any child resources or session are published.
- Persist enough policy identity and lifecycle events to audit decisions; do not require a durable global counter if reconstructing active roots after restart is not part of the first release. Document restart semantics explicitly.

Acceptance checks:

- At most three children execute concurrently.
- Exactly eight starts may be accepted for one orchestration root; the ninth fails before publication.
- A depth-one child cannot create a grandchild.
- Separate top-level user sessions have independent budgets.
- Cancellation/disposal releases concurrency capacity without allowing total-start reuse.

### 8. Build the Orchestrator preset and repair specialist presets

Create a user or shipped `orchestrator` preset based on the current `code` preset, then remove capabilities that do not belong to coordination.

Orchestrator instructions must require every handoff to include:

- role and objective;
- relevant context, but no hidden assumption that the child saw the parent conversation;
- allowed files/directories and exclusive write ownership;
- observable acceptance criteria;
- expected report fields;
- whether the task is read-only or mutating;
- when to reject, report a blocker, or ask the parent for clarification.

Standard child report schema:

- `status: success | partial | rejected | blocked`;
- summary;
- evidence with exact paths/commands/source URLs;
- changed files;
- verification performed and results;
- risks/uncertainties;
- recommended next action.

Preset corrections:

- Remove model/skill claims from persona prose once policy is machine-enforced; keep concise role behavior only.
- Remove repeated `tool-subagent-report` rows; keep the host child-setup contribution once.
- Do not grant Explorer, Librarian, or Oracle shell/write/edit tools.
- Do not grant Fixer or Designer delegation initially.
- Keep Code Mode only when the role's complete allowed tool set is safe through `run_code`; verify nested dispatch honors restrictions.
- Change the deployment default preset from `designer` to `orchestrator` only after the Orchestrator preset passes composition and snapshot tests.

### 9. Repair web search and verify web fetch

The current DeepSeek search provider is correctly failing because `DEEPSEEK_API_KEY` is absent.

Choose exactly one configured provider based on available credentials:

- DeepSeek search requires a DeepSeek credential and its separate Anthropic-compatible search endpoint.
- Exa requires `EXA_API_KEY`.
- Perplexity requires `PERPLEXITY_API_KEY`.

Do not point the DeepSeek native-search provider at OmniRoute unless OmniRoute explicitly supports the same Anthropic Messages server-tool protocol. An OpenAI-compatible chat endpoint is not a drop-in replacement.

Implementation steps:

1. Add the chosen credential through the DSH credentials service or launch environment, not source or YAML literals.
2. Mount only the selected search provider and set `web.searchProvider` to its registered id.
3. Keep `web-fetch-http` with explicit byte/character/time limits and same-origin redirect protections.
4. Enable `tool-web` only in Librarian and any root role that genuinely needs it.
5. Test successful search, missing credential, provider timeout, empty results, and fetch rejection for unsafe URLs/redirects.

### 10. Observability and UI

Add model-visible and audit-visible records without leaking secrets:

- Role selection event: role id, preset id, policy revision.
- Model attempt/failover events: provider/model ids, attempt index, canonical error class, delay; no request body or credentials.
- Budget events: reservation accepted/rejected, current concurrency, total accepted, configured limits.
- Existing subagent start/end and workflow events remain authoritative for lifecycle.
- UI child cards show role, selected model, fallback index, status, and budget consumption.
- Add a diagnostic/settings surface that validates every role's preset, models, skills, MCP servers, and tools before users start work.
- Audit session telemetry redaction before enabling full telemetry; the telemetry seam ships no redaction rules by default.

## Phased implementation sequence

### Phase 0 — Stabilize configuration and truthful documentation

1. Preserve the backup and make a fresh timestamped backup before implementation.
2. Correct `SYSTEM-CHANGES.md` to label the current presets as prototypes, not enforced roles.
3. Configure OmniRoute for `maxRetries: 4` (five total attempts).
4. Configure workflow concurrency/total caps and all model-facing subagent tools with depth one.
5. Stop using undeclared junctions; install/profile-link plugins through the supported `dsh plugin`/profile dependency path.
6. Restore `web_search` by choosing and configuring a credentialed provider.

Verification:

- `dsh --profile web --dump-config` shows retry policy and all limits.
- Direct `web_search` and `web_fetch` smokes pass or fail with the expected stable diagnostic.
- A bounded workflow proves no more than three concurrent/eight total starts.

### Phase 1 — Child preset selection primitive

Implement explicit child preset composition and durable descriptor support in the subagent seam. Add package tests, loader-composition tests, persistence/resume tests, and one real assembled example snapshot.

### Phase 2 — Role service and delegation consumer

Implement the role registry/config provider and `delegate` tool. Resolve role policy before child startup; pass preset, model, persona, and tool restriction through trusted typed boundaries. Add an Orchestrator preset.

### Phase 3 — Skill policy and MCP role composition

Add scope-aware skill restrictions, install only verified skills, and mount Context7/GitHub search in Librarian. Prove denied skills and MCP mutation tools are invisible and non-executable.

### Phase 4 — Cross-model failover

Implement logged, bounded model-chain failover with a single five-attempt global budget. Test canonical transient errors, permanent errors, chain exhaustion, cancellation, persistence, and prompt reconstruction.

### Phase 5 — Unified subagent budget

Implement root-session budget accounting across direct subagents, workflows, and Ralph. Add lifecycle, concurrency, cancellation, and restart-semantics tests.

### Phase 6 — UI, telemetry, snapshots, and rollout

Add role/fallback/budget UI, diagnostics, telemetry redaction, end-to-end tests, keyless snapshots, docs, Agent Notes, and migration/rollback guidance. Switch the default preset to Orchestrator only here.

## Required test matrix

### Unit and package integration

- Role config parsing, duplicate ids, missing presets/models/tools/skills/MCPs.
- Role resolver returns detached immutable policy.
- Child preset mount vs inherited composition.
- Tool and skill restrictions affect prompt visibility and direct execution.
- Model chain and attempt accounting.
- Budget reservation/settlement/cancellation.
- Report schema and authority checks.
- HMR disposal removes every registry contribution.

### Real-composition tests

Boot test `cordis.yml` files through the Loader and app/process. Do not rely only on hand-built `ctx.plugin(...)` tests.

Scenarios:

1. Orchestrator delegates to Librarian; child uses `opencode-go/minimax-m3` and has web/MCP tools but no write/edit.
2. Explorer direct write execution is denied.
3. Fixer can edit its owned fixture and run a focused test.
4. Librarian reports to its direct parent; a sibling/ancestor spoof is rejected.
5. Child cold resume reconstructs role preset, model policy, and tool/skill policy.
6. Failover advances models and never exceeds five total attempts.
7. Ninth child is rejected; only three run concurrently; grandchildren are rejected.
8. Missing web credential fails clearly without exposing credential values.

### Snapshot and user-visible coverage

Add/update a runnable example and keyless snapshot for:

- role delegation request and child identity;
- successful structured report;
- denied tool/skill;
- model fallback notice;
- budget rejection;
- web provider failure diagnostic.

### Commands

Run focused checks while developing, then the repository-prescribed relevant gates:

- focused `pnpm vitest run <changed-package tests>`;
- relevant real-composition and snapshot tests;
- `pnpm run typecheck` for changed compiler faces;
- `pnpm run lint`;
- `pnpm run doc-sync` for docs/catalog changes;
- `pnpm run hygiene` when package manifests/exports change.

Do not default to the entire test suite. Follow `docs/testing.md` and `.agents/skills/dsh-pre-push-checks/SKILL.md` before a push.

## Documentation and decision records

Every non-trivial phase needs an Agent Note in the same PR. Update:

- `docs/architecture.md` for the new role extension point and any changed child composition path.
- The owning subsystem pages for role/subagent/skills/LLM types.
- Package READMEs for configuration, behavior, failure modes, Model Experience, and limitations.
- `docs/tool-catalog.md` through its generator for `delegate`.
- `docs/config-catalog.md` through its generator for role, retry, and budget config.
- User documentation for creating a role, choosing tools/skills/MCPs/models, and reading fallback/budget status.
- `SYSTEM-CHANGES.md` with final scope, verification, and rollback once deployment changes are real.

## Migration and rollback

Migration:

1. Keep current prototype presets while the role packages are built, but stop claiming enforcement.
2. Introduce Orchestrator and role policies behind an opt-in profile patch.
3. Run keyless and one credentialed local smoke suite.
4. Migrate one role at a time: Explorer, Librarian, Oracle, Fixer, Designer.
5. Switch the default preset only after all role diagnostics pass.
6. Remove legacy persona-only model/skill lists and duplicate report rows.

Rollback:

- Remove the role/delegate/profile rows and restore the pre-change `cordis.patch.yml` from the backup.
- Restore the previous default preset/model settings.
- Role session events must be ignorable during the pre-release migration or the rollback must restore the matching build, consistent with the repository's format-zero compatibility stance.
- Do not delete user session logs or credentials during rollback.

## Definition of done

The ecosystem is complete only when all statements below are demonstrably true:

1. A delegation names a role, and the child session records and mounts that role's preset.
2. The child uses the role's selected primary model; failover follows the configured chain and never exceeds five total attempts.
3. Explorer, Librarian, and Oracle cannot execute write/edit/shell/delegation operations.
4. Each role sees and can load only its allowed skills.
5. Librarian has working, credentialed web search/fetch and read-only Context7/GitHub-search integrations.
6. Parent and child exchange continuable messages and structured reports with direct-parent authority.
7. No orchestration root exceeds three concurrent children, eight total starts, or depth one.
8. Every model-visible role, tool, skill, preset, and model choice is reconstructable from the session log.
9. UI/telemetry accurately show role, model, fallback, lifecycle, and budget state without secrets.
10. Focused unit, real-composition, persistence, end-to-end, and keyless snapshot checks pass, and documentation/Agent Notes are current.
