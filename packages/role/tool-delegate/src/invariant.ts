/** Package-owned invariant companion for `@deepseek-ai/dsh-tool-delegate`. */
/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'
const PACKAGE_NAME = '@deepseek-ai/dsh-tool-delegate'
export const name = 'tool-delegate-invariant'
export const inject = ['invariants']
/** No runtime invariant: subagent session events own delegated child lifecycle consistency. */
const install: InvariantInstaller = () => {}
/** Register invariant ownership. @param ctx - invariant context. @returns disposer. */
export const apply = (ctx: Context): Promise<() => void> => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
