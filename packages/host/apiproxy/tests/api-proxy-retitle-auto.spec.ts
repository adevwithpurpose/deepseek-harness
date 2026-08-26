/**
 * sessions.retitleAuto delegation through the composed SessionTitleService:
 * the explicit refresh re-run that also unpins a user rename. The agent
 * factory is the same structural stub as api-proxy-rename.spec.ts; cold-session
 * resolution rides the shared `agentFor` path owned by api-proxy-cold.spec.ts.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionStore from '@deepseek-ai/dsh-session'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent, AgentHandle, CreateAgentOptions } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import SessionTitleService, { SessionTitleProviderId } from '@deepseek-ai/dsh-session-title'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import type { Session, SessionId } from '@deepseek-ai/dsh-session'
import type { RpcRequest } from '@deepseek-ai/dsh-host-apiproxy/api/rpc'
import { RpcId } from '@deepseek-ai/dsh-host-apiproxy/api/rpc'
import { createApiProxy } from '@deepseek-ai/dsh-host-apiproxy'

const sid = (id: string): SessionId => id as SessionId

let nextRpc = 1
function request<P>(payload: P): RpcRequest<P> {
  return { rpcId: RpcId(`fr-${String(nextRpc++)}`), payload }
}

async function composed(withTitles = true): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(UserQuestionService)
  if (withTitles) {
    await ctx.plugin(SessionTitleService, { fallbackMaxWords: 5, fallbackMaxBytes: 40, maxTitleBytes: 80 })
  }
  ctx.agents.setFactory({
    createAgent: (ownerCtx: Context, options: CreateAgentOptions): Promise<AgentHandle> => {
      const session = ctx.sessions.create(options.sessionId, {
        ...options.seed === undefined ? {} : { seed: [...options.seed] },
        ...options.meta === undefined ? {} : { meta: options.meta },
      })
      const agent = { id: session.id, session, status: 'idle', ctx: ownerCtx } as Agent
      ctx.agents.register(agent)
      return Promise.resolve({ agent, dispose: () => Promise.resolve() })
    },
    resume: () => Promise.reject(new Error('resume must not run: every source is attached')),
  })
  return ctx
}

/** Register one live agent whose log holds one completed turn with one prompt. */
function liveAgent(ctx: Context, id: string): Session {
  const session = ctx.sessions.create(sid(id), { meta: { cwd: '/proj' } })
  session.append('turn/start', { turn: 1 })
  session.append('user/message', createUserMessage({
    content: [{ type: 'text', text: 'prompt 1' }],
    source: { kind: 'user' },
  }), { surfaceOp: 'append' })
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  ctx.agents.register({ id: session.id, session, status: 'idle', ctx } as Agent)
  return session
}

const api = (ctx: Context) => createApiProxy(ctx, { defaultModelSelection: () => ({ provider: 'p', model: 'm' }), cwd: '/tmp' })

describe('sessions.retitleAuto', () => {
  it('runs the registered provider and accepts its snapshot as a provider-source title', async () => {
    const ctx = await composed()
    const source = liveAgent(ctx, 'session-retitle-auto')
    ctx.sessionTitle.register({
      id: SessionTitleProviderId('mock-titler'),
      automatic: 'all-prompts',
      generate: async req => ({
        title: 'Mocked Title',
        messageSeqs: req.messages.map(message => message.seq),
        model: { provider: 'mock', model: 'mock-title' },
      }),
    })

    const response = await api(ctx).sessions.retitleAuto(request({ sessionId: source.id }))
    expect(response.result.ok).toBe(true)
    if (!response.result.ok) return
    expect(response.result.value).toMatchObject({ accepted: true, title: 'Mocked Title' })
    const event = source.events.findLast(item => item.type === 'session/title')
    expect(event?.seq).toBe(response.result.value.seq)
    expect(event?.data).toMatchObject({ title: 'Mocked Title', source: { kind: 'provider' } })
  })

  it('reports accepted:false when no provider is mounted and changes nothing', async () => {
    const ctx = await composed()
    const source = liveAgent(ctx, 'session-retitle-auto-noprovider')

    const response = await api(ctx).sessions.retitleAuto(request({ sessionId: source.id }))
    expect(response.result.ok).toBe(true)
    if (!response.result.ok) return
    expect(response.result.value).toEqual({ accepted: false })
    // Refresh may materialize the bare fallback; what it must never do here
    // is accept a provider-sourced title.
    const event = source.events.findLast(item => item.type === 'session/title')
    expect(event?.data.source.kind ?? 'absent').not.toBe('provider')
  })

  it('maps a deployment without the title service to internal', async () => {
    const ctx = await composed(false)
    const source = liveAgent(ctx, 'session-retitle-auto-noservice')

    const response = await api(ctx).sessions.retitleAuto(request({ sessionId: source.id }))
    expect(response.result.ok).toBe(false)
    if (!response.result.ok) {
      expect(response.result.error.code).toBe('internal')
      expect(response.result.error.message).toContain('no session-title service')
    }
  })

  it('unpins a user rename: the explicit refresh accepts a provider title over it', async () => {
    const ctx = await composed()
    const source = liveAgent(ctx, 'session-retitle-auto-unpin')
    const client = api(ctx)
    // One proxy per context: createApiProxy mounts a user-questions provider,
    // so a second call would collide.
    await client.sessions.rename(request({ sessionId: source.id, title: 'pinned name' }))
    ctx.sessionTitle.register({
      id: SessionTitleProviderId('mock-titler'),
      automatic: 'all-prompts',
      generate: async req => ({
        title: 'Refreshed Title',
        messageSeqs: req.messages.map(message => message.seq),
      }),
    })

    const response = await client.sessions.retitleAuto(request({ sessionId: source.id }))
    expect(response.result.ok).toBe(true)
    if (!response.result.ok) return
    expect(response.result.value).toMatchObject({ accepted: true, title: 'Refreshed Title' })
    const event = source.events.findLast(item => item.type === 'session/title')
    expect(event?.data).toMatchObject({ title: 'Refreshed Title', source: { kind: 'provider' } })
  })
})
