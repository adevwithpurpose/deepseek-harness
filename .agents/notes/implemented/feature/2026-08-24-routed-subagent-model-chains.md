# Agent Note: Routed subagent model chains

Status: implemented

## Problem

A direct subagent inherits the parent Agent's provider and model unless `dsh-tool-subagent` has one fixed `agentOptions` value. A costly main model therefore creates equally costly workers, while multiple fixed-model tool instances duplicate model-visible schemas and still cannot express ordered fallbacks. Specialist role presets solve a broader persona problem and add prompt/tool surface that task-class routing does not need.

## Decision

`dsh-tool-subagent` accepts an optional deployment-configured task-route table. The model chooses one allowlisted route id, while the deployment owns each route's ordered provider/model candidates and the default used when the selector is omitted. A configured route pins the child independently of the parent model. No role persona or role-specific preset is required.

The child Agent owns failover through the shared Agent model-chain policy. Only provider, authentication, quota, empty-response, rate-limit, server, timeout, transport, and unclassified pi-ai failures advance the chain. Invalid requests, context overflow, cancellation, tool-policy rejection, and acceptance failure do not. One provider's ordinary same-route retry may resolve the failure before the chain listener advances. The request listener derives every candidate from the current turn and step, so a completed step's fallback cannot alter a later step.

Continuable child descriptors persist the route id and candidate list so cold resume preserves execution policy. `llm/route-selected` records the initial route for telemetry, and `llm/failover` records each transition. Neither event adds model-visible prompt prose.

The subagent descriptor version is 4 because model route policy is part of continuable composition. Older descriptors remain unsupported under the pre-release persistence policy.

## Alternatives considered

**Multiple fixed-model subagent tools.** Separate `subagent_fast`, `subagent_code`, and similar instances were rejected because they duplicate model-visible tool schemas and make execution policy a tool-name concern.

**Role-aware child presets.** Role presets were rejected because the required behavior is provider/model policy rather than persona, and repeated specialist prompt/tool surfaces increase tokens.

**Raw model parameters.** Allowing the model to send arbitrary provider/model ids was rejected because it bypasses deployment cost policy and makes provider inventory part of the prompt contract.

## Consequences

The Web profile defaults routine work to free or bundled workers while reserving limited `cx/*` models as final fallbacks. The tool description carries only route ids and concise deployment guidance. Route changes affect newly started children; existing continuable children retain their durable route chain.

Routing adds one short enum parameter and no separate tool definitions. Each failed route may consume provider tokens before failover, and a provider/model transition cannot reuse the failed route's KV cache. Deployment owners must keep configured model ids synchronized with the model catalog.

## Testing

Focused tests cover route schema projection, explicit and default route selection, rejection of ambiguous `agentOptions` plus routes, eligible failover, and continuable descriptor persistence. Type checking covers Agent, model-chain, subagent, driver, and tool packages. The Web composition boots with route ids whose model ids exist in the configured OmniRoute catalog.
