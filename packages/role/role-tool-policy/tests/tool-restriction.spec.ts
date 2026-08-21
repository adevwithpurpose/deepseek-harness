import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createScope } from '@deepseek-ai/dsh-scope'
import type { SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import * as restriction from '../src/index.ts'

async function setup() {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt, {})
  await ctx.plugin(ToolRuntime)
  let agentCtx!: Context
  const key = { id: 'role-test' as SessionId } as Agent
  await ctx.plugin(Object.assign((inner: Context) => {
    agentCtx = createScope(inner, key).ctx
  }, { inject: ['tools', 'systemPrompt'] }))
  return { ctx, agentCtx, key }
}

function tool(name: string): ToolDefinition {
  return {
    name,
    description: name,
    parameters: { type: 'object', properties: {} },
    output: { schema: { type: 'string' }, render: () => [] },
    async execute() { return name },
  }
}

describe('tool restriction', () => {
  it('removes denied tools from model schemas and dispatch', async () => {
    const { ctx, agentCtx, key } = await setup()
    try {
      ctx.tools.register(tool('read'))
      ctx.tools.register(tool('write'))
      await agentCtx.plugin(restriction, { deny: ['write'] })
      expect(ctx.tools.schemas(key).map(item => item.name)).toEqual(['read'])
      expect(ctx.tools.get('write', key)).toBeUndefined()
    } finally { await ctx.fiber.dispose() }
  })

  it('fails loud for a no-op policy', async () => {
    const { ctx, agentCtx } = await setup()
    try {
      await expect(agentCtx.plugin(restriction, {})).rejects.toThrow('allow or deny')
    } finally { await ctx.fiber.dispose() }
  })

  it('has the namespace-plugin export form', () => {
    expect('default' in restriction).toBe(false)
    expect(restriction.name).toBe('dsh-tool-restriction')
  })
})
