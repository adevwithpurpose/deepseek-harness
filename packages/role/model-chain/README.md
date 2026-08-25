# @deepseek-ai/dsh-model-chain

Agent-scoped ordered model routing with a bounded total-attempt budget. Eligible provider, quota, transport, timeout, empty-response, and adapter failures record `llm/failover` and advance to the next configured route; invalid requests, context overflow, cancellation, and acceptance failures stay on their owning path. The route changes request configuration only, so a previous step's fallback cannot contaminate later model-visible prompt variables. An optional route id records `llm/route-selected` for telemetry without adding prompt prose.

## Model Experience

### Active model route

#### What the model sees

No additional route prose. The request provider/model is selected per step, and selection and transitions are durable `llm/route-selected` and `llm/failover` events.

#### Token effect

No additional prompt prose. A retried request consumes provider tokens on the selected route.

#### KV Cache effect

Switching provider or model cannot reuse a provider-specific KV cache from the failed route.

## Known Limitations and Deferred Work

- The configured chain is fixed for the agent lifetime; live role-policy edits affect newly created children.
