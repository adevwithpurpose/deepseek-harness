import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import RolePolicyRegistry, { RoleId } from '../src/index.ts'

describe('role policy registry', () => {
  it('snapshots, orders, resolves, and removes effect-owned policies', async () => {
    const ctx = new Context(); await ctx.plugin(RolePolicyRegistry)
    const models = [{ provider: 'p', model: 'm' }] as const
    const dispose = ctx.rolePolicy.register({ id: RoleId('explorer'), revision: 'r1', preset: 'explorer', subagentProvider: 'spawn', models, maxDepth: 1 })
    expect(ctx.rolePolicy.list().map(p => p.id)).toEqual(['explorer'])
    expect(ctx.rolePolicy.resolve(RoleId('explorer')).models).not.toBe(models)
    dispose(); expect(ctx.rolePolicy.list()).toEqual([])
    await ctx.fiber.dispose()
  })
  it('rejects duplicates and invalid depth', async () => {
    const ctx = new Context(); await ctx.plugin(RolePolicyRegistry)
    const policy = { id: RoleId('oracle'), revision: 'r', preset: 'oracle', subagentProvider: 'spawn', models: [{ provider: 'p', model: 'm' }] as const, maxDepth: 1 }
    ctx.rolePolicy.register(policy)
    expect(() => ctx.rolePolicy.register(policy)).toThrow('already registered')
    expect(() => ctx.rolePolicy.register({ ...policy, id: RoleId('bad'), maxDepth: -1 })).toThrow('non-negative')
    await ctx.fiber.dispose()
  })
  it('rejects invalid role ids and empty model routes', async () => {
    expect(() => RoleId('Not Valid')).toThrow('must match')
    const ctx = new Context(); await ctx.plugin(RolePolicyRegistry)
    expect(() => ctx.rolePolicy.register({ id: RoleId('bad'), revision: 'r', preset: 'bad', subagentProvider: 'spawn', models: [{ provider: '', model: 'm' }], maxDepth: 1 })).toThrow('require provider and model')
    await ctx.fiber.dispose()
  })

  it('fails for an unknown role', async () => {
    const ctx = new Context(); await ctx.plugin(RolePolicyRegistry)
    expect(() => ctx.rolePolicy.resolve(RoleId('missing'))).toThrow('unknown role')
    await ctx.fiber.dispose()
  })
})
