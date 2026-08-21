import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import RolePolicy, { RoleId } from '@deepseek-ai/dsh-role'
import * as provider from '../src/index.ts'
describe('role config provider', () => {
  it('registers and disposes configured policies with its fiber', async () => {
    const ctx = new Context(); await ctx.plugin(RolePolicy)
    const fiber = await ctx.plugin(provider, { roles: [{ id: 'explorer', preset: 'explorer', subagentProvider: 'spawn', models: [{ provider: 'oc', model: 'big-pickle' }], maxDepth: 1 }] })
    expect(ctx.rolePolicy.resolve(RoleId('explorer'))).toMatchObject({ preset: 'explorer', revision: expect.stringMatching(/^[0-9a-f]{12}$/) })
    await fiber.dispose(); expect(() => ctx.rolePolicy.resolve(RoleId('explorer'))).toThrow('unknown role')
    await ctx.fiber.dispose()
  })
  it('derives the same revision from the same execution policy', async () => {
    const config = { roles: [{ id: 'oracle', preset: 'oracle', subagentProvider: 'spawn', models: [{ provider: 'cx', model: 'sol' }], maxDepth: 1 }] }
    const first = new Context(); await first.plugin(RolePolicy); await first.plugin(provider, config)
    const second = new Context(); await second.plugin(RolePolicy); await second.plugin(provider, config)
    expect(first.rolePolicy.resolve(RoleId('oracle')).revision).toBe(second.rolePolicy.resolve(RoleId('oracle')).revision)
    await first.fiber.dispose(); await second.fiber.dispose()
  })

  it('rejects an empty role table', async () => {
    const ctx = new Context(); await ctx.plugin(RolePolicy)
    await expect(ctx.plugin(provider, { roles: [] })).rejects.toThrow('must not be empty')
    await ctx.fiber.dispose()
  })
})
