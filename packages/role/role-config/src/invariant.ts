/** Package-owned invariant companion for `@deepseek-ai/dsh-role-config`. */
/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'
const PACKAGE_NAME = '@deepseek-ai/dsh-role-config'
export const name = 'role-config-invariant'
export const inject = ['invariants']
/** No runtime invariant: dsh-role owns registry mutation and immutable snapshots. */
const install: InvariantInstaller = () => {}
/** Register invariant ownership. @param ctx - invariant context. @returns disposer. */
export const apply = (ctx: Context): Promise<() => void> => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
