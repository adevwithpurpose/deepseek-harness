/** Configuration provider for specialist role execution policies. */
import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-role'
import { RoleId } from '@deepseek-ai/dsh-role'
import z from '@deepseek-ai/schemastery'

/** One configured role policy. */
export interface RoleConfig {
  /** Stable lowercase role id. */
  id: string
  /** Child agent preset mounted for the role. */
  preset: string
  /** Registered subagent provider used to create the child. */
  subagentProvider: string
  /** Ordered model routes, primary first. */
  models: Array<{
    /** Registered LLM provider route. */
    provider: string
    /** Provider-owned model id. */
    model: string
  }>
  /** Optional child persona override. */
  persona?: string
  /** Optional child tool restriction. */
  toolFilter?: {
    /** Global tools retained by the child. */
    allow?: string[]
    /** Global tools denied to the child. */
    deny?: string[]
  }
  /** Absolute delegation depth cap. */
  maxDepth: number
}
/** Provider config. */
export interface Config {
  /** Nonempty specialist role table. */
  roles: RoleConfig[]
}
/** Loader schema for specialist roles. */
export const Config: z<Config> = z.object({ roles: z.array(z.object({
  id: z.string().required(), preset: z.string().required(), subagentProvider: z.string().required(),
  models: z.array(z.object({ provider: z.string().required(), model: z.string().required() })).required(),
  persona: z.string(),
  toolFilter: z.object({ allow: z.array(z.string()).default(undefined as unknown as string[]), deny: z.array(z.string()).default(undefined as unknown as string[]) }).default(undefined as unknown as { allow: string[]; deny: string[] }),
  maxDepth: z.natural().max(Number.MAX_SAFE_INTEGER).default(1),
})).required() })
/** Compute a stable, credential-free revision over execution-affecting fields. */
function policyRevision(role: RoleConfig): string {
  const canonical = JSON.stringify({
    id: role.id,
    preset: role.preset,
    subagentProvider: role.subagentProvider,
    models: role.models.map(route => ({ provider: route.provider, model: route.model })),
    ...(role.persona === undefined ? {} : { persona: role.persona }),
    ...(role.toolFilter === undefined ? {} : {
      toolFilter: {
        ...(role.toolFilter.allow === undefined ? {} : { allow: role.toolFilter.allow }),
        ...(role.toolFilter.deny === undefined ? {} : { deny: role.toolFilter.deny }),
      },
    }),
    maxDepth: role.maxDepth,
  })
  return createHash('sha256').update(canonical).digest('hex').slice(0, 12)
}

export const name = 'dsh-role-config'
export const inject = ['rolePolicy']
/** Register configured role policies. @param ctx - role service context. @param config - validated policy table. */
export function apply(ctx: Context, config: Config): void {
  if (config.roles.length === 0) throw new Error('role-config: roles must not be empty')
  for (const role of config.roles) {
    ctx.rolePolicy.register({
      ...role,
      id: RoleId(role.id),
      revision: policyRevision(role),
      models: role.models as [{ provider: string; model: string }, ...Array<{ provider: string; model: string }>],
    })
  }
}
