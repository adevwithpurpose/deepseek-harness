/** Agent-scoped ordered model routing and failover policy. */
import type { Context } from '@deepseek-ai/cordis'
import type { LlmCallConfig, LlmFailure } from '@deepseek-ai/dsh-llm'
import type { RequestErrorAction } from './runtime-types.ts'
import type { AgentModelRoute } from './runtime-types.ts'

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Records the configured task route and its initial provider/model when a routed Agent is created. */
    'llm/route-selected': ModelRouteSelectedEventData
    /** Records one eligible provider/model failure and the next configured route selected for retry. */
    'llm/failover': ModelFailoverEventData
  }
}

/** Durable task-route selection applied to one Agent. */
export interface ModelRouteSelectedEventData {
  routeId: string
  provider: string
  model: string
  candidates: number
}

/** Durable model route transition selected after a failed request. */
export interface ModelFailoverEventData {
  turn: number
  step: number
  attempt: number
  fromProvider: string
  fromModel: string
  toProvider: string
  toModel: string
  failure: LlmFailure
}

/** Provider/model failures eligible to move to another configured route. */
export const DEFAULT_FAILOVER_CODES = Object.freeze([
  'AUTH',
  'EMPTY_RESPONSE',
  'NO_ADAPTER',
  'PI_AI_ERROR',
  'QUOTA_EXCEEDED',
  'RATE_LIMIT',
  'SERVER',
  'TIMEOUT',
  'TRANSPORT',
])

/** Agent-scoped model-chain policy. */
export interface ModelChainPolicy {
  /** Model-hidden task route id used for telemetry attribution. */
  routeId?: string
  /** Ordered provider/model candidates, primary first. */
  routes: readonly AgentModelRoute[]
  /** Maximum distinct route attempts for one failed step. */
  maxAttempts?: number
  /** Provider-neutral failure codes allowed to advance the chain. */
  failoverCodes?: readonly string[]
}

/** Whether a provider/model failure may advance to another configured route. */
export function isFailoverEligible(failure: LlmFailure, codes: readonly string[]): boolean {
  return codes.includes(failure.code)
}

/** Read one validated route by index. */
function routeAt(routes: readonly AgentModelRoute[], index: number): AgentModelRoute {
  const route = routes[index]
  if (route === undefined) throw new Error(`model-chain: route ${index} is unavailable`)
  return route
}

/** Install one ordered provider/model chain on an Agent scope. */
export function installModelChain(ctx: Context, config: ModelChainPolicy): void {
  if (config.routes.length === 0) throw new Error('model-chain: routes must not be empty')
  const routes = config.routes.map(route => ({ provider: route.provider, model: route.model }))
  for (const [index, route] of routes.entries()) {
    if (route.provider.length === 0 || route.model.length === 0) {
      throw new Error(`model-chain: routes[${index}] requires non-empty provider and model`)
    }
  }
  const maxAttempts = Math.min(config.maxAttempts ?? routes.length, routes.length)
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error('model-chain: maxAttempts must be a positive safe integer')
  }
  const failoverCodes = config.failoverCodes ?? DEFAULT_FAILOVER_CODES
  if (failoverCodes.length === 0 || failoverCodes.some(code => code.length === 0)) {
    throw new Error('model-chain: failoverCodes must contain non-empty values')
  }
  if (config.routeId !== undefined) {
    const agent = ctx.agent
    if (agent !== undefined && !agent.session.events.some(event => event.type === 'llm/route-selected')) {
      agent.session.append('llm/route-selected', {
        routeId: config.routeId,
        provider: routeAt(routes, 0).provider,
        model: routeAt(routes, 0).model,
        candidates: routes.length,
      })
    }
  }

  ctx.on('agent/request', async (payload, next): Promise<LlmCallConfig> => {
    const resolved = await next()
    const transitions = payload.agent.session.events.filter(event => event.type === 'llm/failover'
      && event.data.turn === payload.turn && event.data.step === payload.step).length
    const route = routeAt(routes, Math.min(transitions, routes.length - 1))
    return { ...resolved, provider: route.provider, model: route.model }
  })
  ctx.on('agent/request-error', async (payload, next): Promise<RequestErrorAction> => {
    const transitions = payload.agent.session.events.filter(event => event.type === 'llm/failover'
      && event.data.turn === payload.turn && event.data.step === payload.step).length
    const nextAttempt = transitions + 2
    if (payload.signal.aborted || nextAttempt > maxAttempts || !isFailoverEligible(payload.failure, failoverCodes)) return next()
    const from = routeAt(routes, transitions)
    const to = routeAt(routes, transitions + 1)
    payload.agent.session.append('llm/failover', {
      turn: payload.turn,
      step: payload.step,
      attempt: nextAttempt,
      fromProvider: from.provider,
      fromModel: from.model,
      toProvider: to.provider,
      toModel: to.model,
      failure: payload.failure,
    })
    return { kind: 'retry' }
  })
}
