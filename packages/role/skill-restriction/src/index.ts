/** Preset-scoped skill catalog restriction Consumer. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-skill'
import z from '@deepseek-ai/schemastery'

/** Static skill catalog policy. */
export interface Config {
  /** Skill names retained in the scoped catalog. */
  allow?: string[]
  /** Skill names removed from the scoped catalog. */
  deny?: string[]
}
/** Loader configuration for a skill policy. */
export const Config: z<Config> = z.object({
  allow: z.array(z.string()).default(undefined as unknown as string[]),
  deny: z.array(z.string()).default(undefined as unknown as string[]),
})
export const name = 'dsh-skill-restriction'
export const inject = ['skills']
/** Apply a skill policy to this preset scope. @param ctx - scoped context. @param config - allow and deny policy. */
export function apply(ctx: Context, config: Config): void { ctx.skills.restrict(config) }
