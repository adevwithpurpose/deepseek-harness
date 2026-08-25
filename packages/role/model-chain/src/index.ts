import type { Context } from '@deepseek-ai/cordis'
import { installModelChain } from '@deepseek-ai/dsh-agent'
import type { AgentModelRoute } from '@deepseek-ai/dsh-agent'
import z from '@deepseek-ai/schemastery'
export type { ModelChainPolicy, ModelFailoverEventData, ModelRouteSelectedEventData } from '@deepseek-ai/dsh-agent'

/** Agent-scoped chain configuration. */
export interface Config {
  /** Model-hidden task route id used for telemetry attribution. */
  routeId?: string
  /** Ordered routes rotated after eligible request failures. */
  routes: AgentModelRoute[]
  /** Total distinct route attempts allowed for one failed step. */
  maxAttempts?: number
  /** Provider-neutral failure codes allowed to advance the chain. */
  failoverCodes?: string[]
}
/** Loader schema for a nonempty bounded route chain. */
export const Config: z<Config> = z.object({
  routeId: z.string(),
  routes: z.array(z.object({ provider: z.string().required(), model: z.string().required() })).required(),
  maxAttempts: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(5),
  failoverCodes: z.array(z.string()).default(undefined as unknown as string[]),
})
export const name = 'dsh-model-chain'

/** Install route override and failover recovery for this agent scope.
 * @param ctx - scoped agent context.
 * @param config - ordered routes and total attempt budget.
 */
export function apply(ctx: Context, config: Config): void {
  installModelChain(ctx, config)
}
