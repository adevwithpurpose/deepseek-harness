/** Package-owned invariant companion for `@deepseek-ai/dsh-model-chain`. */
/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'
const PACKAGE_NAME = '@deepseek-ai/dsh-model-chain'
export const name = 'model-chain-invariant'
export const inject = ['invariants']
/** No runtime invariant: session append validation owns event fields; tests cover monotone route transitions. */
const install: InvariantInstaller = () => {}
/** Register invariant ownership. @param ctx - invariant context. @returns disposer. */
export const apply = (ctx: Context): Promise<() => void> => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
