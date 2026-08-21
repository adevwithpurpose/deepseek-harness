import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { agentEvents, type Agent } from '@deepseek-ai/dsh-agent'
import type { LlmFailure } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import * as chain from '../src/index.ts'
function agent(ctx: Context): Agent { const session = Session.create(SessionId('a')); return { id: session.id, session, ctx } as Agent }
describe('model chain', () => {
  it('records and selects the next route after downstream retry declines', async () => {
    const ctx = new Context(); const a = agent(ctx); ctx.accessor('agent', { get: () => a }); await ctx.plugin(chain, { routes: [{ provider: 'p1', model: 'm1' }, { provider: 'p2', model: 'm2' }], maxAttempts: 2 })
    const failure = { code: 'SERVER_ERROR', message: 'failed', retryable: true } as LlmFailure
    const action = await agentEvents(ctx, a).waterfall('agent/request-error', { turn: 1, step: 0, provider: 'p1', failure, retryPolicy: undefined, signal: new AbortController().signal }, async () => undefined)
    expect(action).toEqual({ kind: 'retry' }); expect(a.session.events.at(-1)).toMatchObject({ type: 'llm/failover', data: { toProvider: 'p2', toModel: 'm2', attempt: 2 } })
    await ctx.fiber.dispose()
  })
  it('fails load for an empty route chain', async () => {
    const ctx = new Context(); ctx.accessor('agent', { get: () => agent(ctx) })
    let message = ''
    try { await ctx.plugin(chain, { routes: [] }) } catch (error) { message = String(error) }
    expect(message).toContain('must not be empty')
    await ctx.fiber.dispose()
  })
})
