# @deepseek-ai/dsh-role-config

Configuration Provider for `dsh-role`. It validates a non-empty role table, derives a stable 12-hex revision from execution-affecting fields, and registers each policy for the provider fiber's lifetime. Role ids, presets, providers, ordered model routes, optional persona/tool policy, and depth remain deployment configuration; credentials are never accepted.

## Model Experience

### Configured role policies

#### What the model sees

Nothing directly. `dsh-tool-delegate` projects a resolved policy into a child request.

#### Token effect

None until a Consumer exposes or applies a policy.

#### KV Cache effect

No direct effect; a changed policy may alter a later child's preset and tool prefix.

## Known Limitations and Deferred Work

- Cross-model failover consumes the ordered routes but belongs to the delegation Consumer.
