/** Specialist role execution policy registry. */
import { Context, Service } from '@deepseek-ai/cordis'
import type { Branded } from '@deepseek-ai/dsh-brand'

/** Stable specialist role id. */
export type RoleId = Branded<'RoleId'>
/**
 * Brand a validated role id.
 * @param value - role name.
 * @returns the branded id.
 */
export function RoleId(value: string): RoleId {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(value)) {
    throw new Error('role id must match /^[a-z0-9][a-z0-9-]*$/')
  }
  return value as RoleId
}
/** One model route in preference order. */
export interface RoleModelRoute { readonly provider: string; readonly model: string }
/** Immutable execution policy resolved before delegation. */
export interface RoleExecutionPolicy {
  readonly id: RoleId
  readonly revision: string
  readonly preset: string
  readonly subagentProvider: string
  readonly models: readonly [RoleModelRoute, ...RoleModelRoute[]]
  readonly persona?: string
  readonly toolFilter?: { readonly allow?: readonly string[]; readonly deny?: readonly string[] }
  readonly maxDepth: number
}
function snapshot(input: RoleExecutionPolicy): RoleExecutionPolicy {
  if (!input.revision || !input.preset || !input.subagentProvider || input.models.length === 0) throw new Error('role policy requires revision, preset, provider, and models')
  for (const route of input.models) {
    if (route.provider.length === 0 || route.model.length === 0) throw new Error('role policy model routes require provider and model')
  }
  if (input.toolFilter !== undefined && input.toolFilter.allow === undefined && input.toolFilter.deny === undefined) {
    throw new Error('role policy toolFilter must name allow or deny')
  }
  if (!Number.isSafeInteger(input.maxDepth) || input.maxDepth < 0) throw new Error('role policy maxDepth must be a non-negative safe integer')
  return Object.freeze({ ...input, models: Object.freeze(input.models.map(route => Object.freeze({ ...route }))) as unknown as RoleExecutionPolicy['models'], ...(input.toolFilter === undefined ? {} : { toolFilter: Object.freeze({ ...input.toolFilter, ...(input.toolFilter.allow === undefined ? {} : { allow: Object.freeze([...input.toolFilter.allow]) }), ...(input.toolFilter.deny === undefined ? {} : { deny: Object.freeze([...input.toolFilter.deny]) }) }) }) })
}
declare module '@deepseek-ai/cordis' { interface Context { rolePolicy: RolePolicyRegistry } }
/** Process-local registry of immutable specialist role policies. */
export class RolePolicyRegistry extends Service {
  private readonly policies = new Map<RoleId, RoleExecutionPolicy>()
  constructor(ctx: Context) { super(ctx, 'rolePolicy') }
  /**
   * Register one policy for this plugin fiber.
   * @param input - policy to snapshot.
   * @returns the disposal callback.
   */
  register(input: RoleExecutionPolicy): () => void {
    const policy = snapshot(input)
    if (this.policies.has(policy.id)) throw new Error(`role policy "${policy.id}" is already registered`)
    return this.ctx.effect(() => { this.policies.set(policy.id, policy); return () => { if (this.policies.get(policy.id) === policy) this.policies.delete(policy.id) } }, 'rolePolicy.register()')
  }
  /**
   * List policies in registration order.
   * @returns immutable policy snapshots.
   */
  list(): readonly RoleExecutionPolicy[] { return Object.freeze([...this.policies.values()]) }
  /**
   * Resolve a role or fail loud.
   * @param id - role id.
   * @returns the immutable policy.
   */
  resolve(id: RoleId): RoleExecutionPolicy { const found = this.policies.get(id); if (!found) throw new Error(`unknown role "${id}"`); return found }
}
export default RolePolicyRegistry
