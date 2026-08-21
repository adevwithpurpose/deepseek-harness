# @deepseek-ai/dsh-skill-restriction

Preset-scoped Consumer of `ctx.skills.restrict()`. Allow and deny policies intersect across a scope chain and affect both catalog listing and skill loading, so an unavailable specialist skill cannot be loaded by naming it directly.

## Model Experience

### Restricted skill catalog

#### What the model sees

The existing `skill` tool advertises and loads only skills admitted by the current scope policy. This package adds no schema or prompt section.

#### Token effect

No added tokens; smaller skill catalogs reduce the skill tool's model-facing description.

#### KV Cache effect

Prefix-stable for a fixed preset policy; changing visible skill names changes the skill catalog text.

## Known Limitations and Deferred Work

- A configured name may be absent from the installed catalog; absence remains a normal unavailable-skill result rather than a preset load failure.
