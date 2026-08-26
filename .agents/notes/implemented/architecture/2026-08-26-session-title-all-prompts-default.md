# 2026-08-26 — Session titles: all-prompts provider as the base default

## Context

The base bundle mounted `session-title-first-prompt-llm`, so a session's durable
title was summarized once from message #1 and never revised. On deployments
routing workers through reasoning-style free models, the strict title validator
(tool-call blocks, empty text, non-stop finish) rejected every automatic
attempt silently — sessions kept the 5-word deterministic fallback forever,
which made the session list hard to search.

## Decision

`packages/bundle/base` now mounts `@deepseek-ai/dsh-session-title-all-prompts-llm`
under the same `session-title-llm` id and budgets (5 words / 10 CJK chars target,
4096 input bytes, 64 output tokens, 60s timeout). The all-prompts cadence starts
a bounded revision after every new eligible human prompt and supersedes stale
work, so long-running sessions retitle as their task evolves instead of being
pinned to the first message.

Route selection stays unset in the base default: without `provider`/`model`
overrides the auxiliary call inherits each session's logged route. Deployments
whose worker routes fail the validator pin a clean-text model by overriding the
row's config (patch config replaces wholesale, so all keys must be restated);
the web profile on this machine pins `omniroute/oc/big-pickle`.

## Consequences

- One extra auxiliary request per human prompt per session (~64 output tokens,
  no main-request KV invalidation); newer revisions abort older ones.
- The patch layer cannot swap an entry's package (`name` is a guard), so the
  cadence choice is a bundle-layer decision; only config stays user-layer.
- The headless profile snapshot's `titleProvider` string changed accordingly.
