# 2026-08-26 — Title revision control: retry-until-modeled and manual re-run

Cross-links: [session-title all-prompts default](2026-08-26-session-title-all-prompts-default.md) ·
[log-backed session titles](../feature/2026-07-21-log-backed-session-titles.md)

## Problem

The all-prompts cadence revises a session's title on every eligible human
prompt forever. Two deployment needs emerged from live use:

1. Retitle until the model lands one good title, then stop — failures keep
   retrying on later prompts, but a settled title should not keep churning
   (tokens, latency, and title drift) for the rest of a long session.
2. A human needs a way to re-run the titler deliberately — especially after a
   manual rename pinned the title — without sending another prompt.

## Decision

- **Service opt-in `stopOnceModeled`** (`@deepseek-ai/dsh-session-title`
  Config, default `false`): while enabled, `onUserMessage` schedules no
  automatic provider revision once the current title's source kind is
  `provider`. Failed attempts leave the source at `fallback`, so later prompts
  keep retrying. The user-rename pin and explicit `refresh()` semantics are
  unchanged; `refresh` remains the documented unpin-and-rerun.
- **New RPC `session.retitleAuto`** (`{sessionId}` →
  `{accepted, title?, seq?}`): delegates to `ctx.sessionTitle.refresh`.
  `accepted` is true only for a provider-sourced snapshot — with no registered
  provider, refresh materializes the bare fallback, which must not surface as
  "auto-naming". The rename dialog gains an Auto-name button wired to it;
  acceptance closes the dialog and settles the title projection from the unary
  echo, `accepted: false` shows an unavailable notice.

## Consequences

- Default composition behavior is unchanged (`stopOnceModeled` is opt-in);
  the web profile on this machine enables it alongside the flash-low pin.
- `refresh` returning a fallback snapshot is now a meaningful case that RPC
  consumers must translate to "not accepted" rather than display.
- Per-prompt retitling remains available by leaving the flag unset.
