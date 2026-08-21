import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createScope, scopeOf } from '@deepseek-ai/dsh-scope'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import * as plugin from '../src/index.ts'
describe('skill restriction Consumer', () => {
  it('applies its policy to the current scope', async () => {
    const ctx = new Context(); await ctx.plugin(SkillRegistry)
    ctx.skills.register({ name: 'a', description: 'a', content: 'a', source: 'runtime' }); ctx.skills.register({ name: 'b', description: 'b', content: 'b', source: 'runtime' })
    const scope = createScope(ctx, { role: 'restricted' })
    await scope.ctx.plugin(plugin, { allow: ['a'] })
    expect((await ctx.skills.list({ scope: scopeOf(scope.ctx) })).map(skill => skill.name)).toEqual(['a'])
    await ctx.fiber.dispose()
  })
  it('keeps the function-plugin namespace export', () => { expect('default' in plugin).toBe(false) })
})
