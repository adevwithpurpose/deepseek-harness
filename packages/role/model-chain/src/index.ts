/** Agent-scoped bounded model-chain failover. */
import type { Context, Events } from '@deepseek-ai/cordis'
import type { ModelSelection } from '@deepseek-ai/dsh-agent'
import type { LlmCallConfig } from '@deepseek-ai/dsh-llm'
import z from '@deepseek-ai/schemastery'
export * from './types.ts'

/** Model route configured for this specialist preset. */
export interface ModelRoute {
  /** Registered LLM provider route. */
  provider: string
  /** Provider-owned model id. */
  model: string
}
/** Agent-scoped chain configuration. */
export interface Config {
  /** Ordered routes rotated after request failures. */
  routes: ModelRoute[]
  /** Total request attempts allowed for one failed step; default five. */
  maxAttempts?: number
}
/** Loader schema for a nonempty bounded route chain. */
export const Config: z<Config> = z.object({
  routes: z.array(z.object({ provider: z.string().required(), model: z.string().required() })).required(),
  maxAttempts: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(5),
})
export const name = 'dsh-model-chain'

/** Install route override and failover recovery for this agent scope.
 * @param ctx - scoped agent context.
 * @param config - ordered routes and total attempt budget.
 */
export function apply(ctx: Context, config: Config): void {
  if (config.routes.length === 0) throw new Error('model-chain: routes must not be empty')
  const maxAttempts = Math.min(config.maxAttempts ?? 5, config.routes.length)
  ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    const result = await next()
    const session = context.agent?.session
    const priorAttempts = session
      ? session.events.filter(event => event.type === 'llm/failover').length
      : 0
    const route = config.routes[priorAttempts % config.routes.length]!
    return { ...result, variables: { ...result.variables, provider: route.provider, model: route.model } }
  })
  ctx.on('agent/request', async (payload, next): Promise<LlmCallConfig> => {
    const resolved = await next()
    const priorAttempts = payload.agent.session.events.filter(event => event.type === 'llm/failover' && event.data.turn === payload.turn && event.data.step === payload.step).length
    const route = config.routes[priorAttempts % config.routes.length]!
    return { ...resolved, provider: route.provider, model: route.model }
  })
  ctx.on('agent/request-error', async (payload: Parameters<Events['agent/request-error']>[0]) => {
    const priorAttempts = payload.agent.session.events.filter(event => event.type === 'llm/failover' && event.data.turn === payload.turn && event.data.step === payload.step).length + 1
    if (payload.signal.aborted || priorAttempts >= maxAttempts) return
    const fromIndex = (priorAttempts - 1) % config.routes.length
    const toIndex = priorAttempts % config.routes.length
    const from = config.routes[fromIndex]!
    const to = config.routes[toIndex]!
    payload.agent.session.append('llm/failover', {
      turn: payload.turn,
      step: payload.step,
      attempt: priorAttempts + 1,
      fromProvider: from.provider,
      fromModel: from.model,
      toProvider: to.provider,
      toModel: to.model,
      failure: payload.failure,
    })
    return { kind: 'retry' }
  })
}
