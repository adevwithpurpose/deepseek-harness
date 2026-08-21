/** Preset-scoped enforced tool restriction. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'

/** Static tool policy applied to the current scoped composition. */
export interface Config {
  /** Global tool names retained; every other global tool is denied. */
  allow?: string[]
  /** Global tool names denied in addition to any allow policy. */
  deny?: string[]
}

/** Loader configuration for a static tool policy. */
export const Config: z<Config> = z.object({
  allow: z.array(z.string()).default(undefined as unknown as string[]),
  deny: z.array(z.string()).default(undefined as unknown as string[]),
})

export const name = 'dsh-tool-restriction'
export const inject = ['tools']

/** Apply an enforced prompt-and-dispatch tool restriction to this preset scope.
 * @param ctx - preset-scoped plugin context.
 * @param config - static allow and deny policy.
 */
export function apply(ctx: Context, config: Config): void {
  if (config.allow === undefined && config.deny === undefined) {
    throw new Error('tool-restriction: configure allow or deny')
  }
  if (config.allow?.length === 0 && config.deny?.length === 0) {
    throw new Error('tool-restriction: empty allow and deny lists are a no-op')
  }
  ctx.tools.restrict(config)
}
