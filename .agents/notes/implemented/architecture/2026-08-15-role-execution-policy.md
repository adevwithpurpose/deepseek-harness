# Agent Note: Role execution policy is a capability seam

Status: implemented

## Problem

Specialist presets can change identity and visible plugins, but prose does not bind delegation to a preset, model route, provider, tool policy, or depth. Exposing those knobs in every model call lets the orchestrator bypass deployment policy and makes the role chosen for a child impossible to audit from one resolved object.

## Decision

`dsh-role` is the Service Definition. It registers effect-owned, immutable `RoleExecutionPolicy` snapshots under branded role ids and resolves unknown roles loudly. A policy carries a stable revision, child preset, subagent provider, ordered non-empty model route chain, optional persona and tool filter, and maximum depth.

`dsh-role-config` is the configuration Provider. It validates a credential-free role table and registers each policy for its plugin fiber's lifetime. `dsh-tool-delegate` is the Consumer. Its model schema exposes only role, objective, acceptance criteria, scope, and background choice; it resolves the remaining execution fields from the policy and starts the child with the requested preset. `dsh-tool-restriction` is a preset-scoped Consumer of the tools service that enforces role tool policy in both prompt visibility and dispatch. `SkillRegistry.restrict()` provides the parallel scope-chain intersection for catalog listing and loading, and `dsh-skill-restriction` applies static preset policy; direct skill loading therefore cannot bypass a role catalog restriction.

The role service does not own child lifecycle events. Subagent descriptors and session headers remain the authoritative durable record of provider, model, preset, persona, tool filter, and depth. This avoids a second event stream that can disagree with the child actually created.

## Alternatives considered

Static persona files alone were rejected because they cannot deny dispatch or bind a delegation request. One role-specific tool instance per specialist was rejected because it duplicates schemas and lifecycle code while still scattering policy across Loader rows. Model-supplied provider, model, and filter fields were rejected because a model-facing omission is not enforcement and a visible knob is an authority grant.

## Consequences

Role configuration and delegation evolve independently while sharing one immutable policy type. Unsupported explicit presets fail at provider capability validation. Each specialist preset mounts `dsh-model-chain` with the policy's ordered routes. The scoped model chain owns specialist recovery before deployment-wide same-route retry, records `llm/failover`, changes prompt variables and request routing together, and rotates routes within one five-total-attempt budget. `dsh-subagent` independently owns root-wide three-concurrent/eight-total admission across every Consumer and provider.

## Verification

Package tests cover registration order, snapshots, disposal, configuration lifecycle, schema omission, resolved request forwarding, unknown-role denial, scoped tool dispatch denial, skill allow/deny enforcement through both list and get operations, bounded route transitions, and root-wide total/concurrent admission across providers. Repository typecheck and package invariant/JSDoc checks include all four packages.
