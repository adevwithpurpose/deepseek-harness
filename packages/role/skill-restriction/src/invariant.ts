/** Package-owned invariant companion for `@deepseek-ai/dsh-skill-restriction`. */
/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'
const PACKAGE_NAME = '@deepseek-ai/dsh-skill-restriction'
export const name = 'skill-restriction-invariant'
export const inject = ['invariants']
/** No runtime invariant: the skill registry owns compiled restriction consistency and disposal. */
const install: InvariantInstaller = () => {}
/** Register invariant ownership. @param ctx - invariant context. @returns disposer. */
export const apply = (ctx: Context): Promise<() => void> => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
