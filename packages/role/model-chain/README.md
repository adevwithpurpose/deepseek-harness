# @deepseek-ai/dsh-model-chain

Agent-scoped ordered model routing with a bounded total-attempt budget. The scoped listener owns recovery before deployment-wide same-route retry: each failed request records `llm/failover`, advances to the next route, and consumes one slot from a single total-attempt budget. The route affects both prompt variables and request configuration.

## Model Experience

### Active model route

#### What the model sees

The selected `provider` and `model` prompt variables and the corresponding request route. Route transitions are durable `llm/failover` events.

#### Token effect

No additional prompt prose. A retried request consumes provider tokens on the selected route.

#### KV Cache effect

Switching provider or model cannot reuse a provider-specific KV cache from the failed route.

## Known Limitations and Deferred Work

- The configured chain is fixed for the agent lifetime; live role-policy edits affect newly created children.
