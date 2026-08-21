# @deepseek-ai/dsh-tool-delegate

Model-facing Consumer for `dsh-role`. The model supplies only a role, objective, observable acceptance criteria, optional ownership scope, and foreground/background choice. The resolved policy supplies the child preset, provider, first ordered model route, persona, tool filter, and depth; raw execution knobs are absent from the schema. Background children are durable and continuable.

## Model Experience

### Delegate tool

#### What the model sees

One `delegate` schema containing role, objective, acceptance criteria, optional scope, and background choice. Provider, model, preset, tool filter, persona, and depth are absent.

#### Token effect

One fixed schema in the parent plus the structured handoff in the child context.

#### KV Cache effect

Prefix-stable while the tool name and schema remain unchanged. Each call and result append after the reusable prefix.

## Known Limitations and Deferred Work

- The Consumer currently uses the first model route. Coordinated retry and cross-route failover remain a separate policy layer.
