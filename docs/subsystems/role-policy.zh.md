# 角色策略

[English](role-policy.md) | 中文

专家角色注册与强制角色委派的参考资料。

`ctx.rolePolicy` 以带品牌的 `RoleId` 保存不可变的 `RoleExecutionPolicy`。配置提供方从影响执行的字段派生稳定修订号。委派使用方只公开任务字段，而策略提供子代理预设、子代理提供方、模型路由、人格、工具限制与深度。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

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

Source: [`packages/role/role/src/index.ts:44`](../../packages/role/role/src/index.ts)
<!-- END GENERATED cordis-surface -->