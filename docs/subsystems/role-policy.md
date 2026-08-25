# Role policy

English | [中文](role-policy.zh.md)

Reference for specialist role registration and enforced role delegation.

`ctx.rolePolicy` stores immutable `RoleExecutionPolicy` values under branded `RoleId` identities. The configuration Provider derives a stable revision from execution-affecting fields. The delegation Consumer exposes task-level fields while policy supplies child preset, subagent provider, model routes, persona, tool restriction, and depth.

Role-local model chains record `llm/failover` events. Subagent descriptors and headers remain the durable child-composition record. Scoped tool and skill restrictions enforce prompt visibility and direct execution or loading through their owning registries.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxrolepolicy--rolepolicyregistry"></a>

### `ctx.rolePolicy` — `RolePolicyRegistry`

Process-local registry of immutable specialist role policies.

```ts cordis-catalog
/**
 * Register one policy for this plugin fiber.
 * @param input - policy to snapshot.
 * @returns the disposal callback.
 */
register(input: RoleExecutionPolicy): () => void

/**
 * List policies in registration order.
 * @returns immutable policy snapshots.
 */
list(): readonly RoleExecutionPolicy[]

/**
 * Resolve a role or fail loud.
 * @param id - role id.
 * @returns the immutable policy.
 */
resolve(id: RoleId): RoleExecutionPolicy
```

Source: [`packages/role/role/src/index.ts`](../../packages/role/role/src/index.ts)
<!-- END GENERATED cordis-surface -->