# @deepseek-ai/dsh-role

Service Definition for specialist execution policy. Providers register immutable policies with a branded role id, stable revision, child preset, subagent provider, ordered non-empty model route chain, optional persona/tool filter, and maximum depth. Consumers resolve a role before delegation; unknown and duplicate roles fail loud. Registrations leave with their Cordis effect.

## Model Experience

### Role policy service

#### What the model sees

Nothing directly. Consumers call `ctx.rolePolicy.resolve()` before producing model-visible tools or child requests.

#### Token effect

None directly.

#### KV Cache effect

None directly.

## Known Limitations and Deferred Work

- The Service Definition does not choose defaults or expose model-facing delegation. Those belong to the configuration Provider and tool Consumer.
