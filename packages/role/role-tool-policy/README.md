# @deepseek-ai/dsh-tool-restriction

Preset-scoped Consumer that calls `ctx.tools.restrict()`. An `allow` list removes every other global tool; a `deny` list removes named tools. Restrictions affect both model-visible schemas and dispatch, so prose cannot bypass a read-only specialist policy. Unknown tool names and host-plane mounting fail at load through the tools service.

## Model Experience

### Restricted tool set

#### What the model sees

No new schema or prompt text. `ctx.tools.restrict()` removes denied global tool schemas from the restricted agent scope and dispatch rejects the same names.

#### Token effect

No added tokens; restriction normally reduces tool-schema tokens.

#### KV Cache effect

Prefix-stable for a fixed preset policy; changing the allowed schemas invalidates reuse from the first changed schema.

## Known Limitations and Deferred Work

- The plugin restricts tools, not skills exposed through an allowed `skill` tool. Role-scoped skill catalog policy remains a separate Consumer.
