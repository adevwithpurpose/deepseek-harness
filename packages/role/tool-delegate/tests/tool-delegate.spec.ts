import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { CallId } from '@deepseek-ai/dsh-llm'
import RolePolicy, { RoleId } from '@deepseek-ai/dsh-role'
import { SessionId } from '@deepseek-ai/dsh-session'
import Subagents from '@deepseek-ai/dsh-subagent'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import * as delegate from '../src/index.ts'

describe('role delegation tool', () => {
  it('keeps execution knobs out of schema and forwards resolved policy', async () => {
    const ctx = new Context(); await ctx.plugin(SystemPrompt); await ctx.plugin(Tools); await ctx.plugin(Subagents); await ctx.plugin(RolePolicy)
    let seen: any
    let disposed = false
    ctx.subagents.registerProvider({ name: 'spawn', capabilities: { outputSchema: true, depthLimit: true, toolFilter: true, persona: true, agentPreset: true }, inheritsParentContext: false, async start(request) { seen = request; return { id: SessionId('child'), localAgent: undefined, result: Promise.resolve({ output: [], stopReason: 'completed' }), async dispose() { disposed = true } } } })
    ctx.rolePolicy.register({ id: RoleId('explorer'), revision: 'r1', preset: 'explorer', subagentProvider: 'spawn', models: [{ provider: 'oc', model: 'big-pickle' }], toolFilter: { deny: ['write'] }, maxDepth: 1 })
    await ctx.plugin(delegate)
    const schema = ctx.tools.schemas().find(item => item.name === 'delegate')!
    expect(JSON.stringify(schema.parameters)).not.toContain('agentOptions')
    expect(JSON.stringify(schema.parameters)).not.toContain('agentPreset')
    const parent = { id: SessionId('parent') } as Agent
    const result = await ctx.tools.execute({ callId: CallId('c'), name: 'delegate', arguments: { role: 'explorer', objective: 'Map code', acceptance_criteria: ['paths'], background: false }, agent: parent, signal: new AbortController().signal })
    expect(result.isError).toBe(false)
    expect(seen).toMatchObject({ agentPreset: 'explorer', agentOptions: { provider: 'oc', model: 'big-pickle' }, toolFilter: { deny: ['write'] }, maxDepth: 1 })
    expect(disposed).toBe(true)
    await ctx.fiber.dispose()
  })
  it('rejects unknown roles before child start', async () => {
    const ctx = new Context(); await ctx.plugin(SystemPrompt); await ctx.plugin(Tools); await ctx.plugin(Subagents); await ctx.plugin(RolePolicy); await ctx.plugin(delegate)
    const result = await ctx.tools.execute({ callId: CallId('c'), name: 'delegate', arguments: { role: 'missing', objective: 'x', acceptance_criteria: ['y'] }, agent: { id: SessionId('p') } as Agent, signal: new AbortController().signal })
    expect(result.isError).toBe(true)
    await ctx.fiber.dispose()
  })
})
