/** Role-aware specialist delegation Consumer. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-role'
import { RoleId } from '@deepseek-ai/dsh-role'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-subagent'
import { defineTool } from '@deepseek-ai/dsh-tools'

/** Tool configuration. */
export interface Config {
  /** Model-facing tool name; default `delegate`. */
  toolName?: string
}
export const name = 'dsh-tool-delegate'
export const inject = ['tools', 'rolePolicy', 'subagents']
/** Mount the role-aware delegation tool. @param ctx - capability context. @param config - tool naming config. */
export function apply(ctx: Context, config: Config = {}): void {
  ctx.tools.register(defineTool({
    name: config.toolName ?? 'delegate',
    description: 'Delegate an objective to a configured specialist role. Role policy owns preset, provider, model, tools, persona, and recursion limits.',
    parameters: {
      role: { type: 'string', required: true, description: 'Configured specialist role id.' },
      objective: { type: 'string', required: true, description: 'Concrete objective for the specialist.' },
      acceptance_criteria: { type: 'array', required: true, items: { type: 'string' }, description: 'Observable completion checks.' },
      scope: { type: 'array', items: { type: 'string' }, description: 'Paths or subjects the specialist owns.' },
      background: { type: 'boolean', description: 'Return a continuable child id immediately. Defaults to true.' },
    },
    output: { schema: { type: 'object', additionalProperties: false, properties: { kind: { type: 'string', required: true }, id: { type: 'string', required: true } } }, render: (_args, value) => [{ type: 'text', text: `started ${value.kind} specialist ${value.id}` }] },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      if (!exec.agent) throw new Error('delegate requires a calling agent')
      const policy = ctx.rolePolicy.resolve(RoleId(args.role))
      const prompt = [`# Objective\n${args.objective}`, `# Acceptance criteria\n${args.acceptance_criteria.map((item: string) => `- ${item}`).join('\n')}`, ...(args.scope?.length ? [`# Exclusive scope\n${args.scope.map((item: string) => `- ${item}`).join('\n')}`] : [])].join('\n\n')
      const route = policy.models[0]
      const request = { prompt: [{ type: 'text', text: prompt }] as ContentBlock[], parent: exec.agent, agentOptions: { provider: route.provider, model: route.model }, agentPreset: policy.preset, ...(policy.persona === undefined ? {} : { persona: policy.persona }), ...(policy.toolFilter === undefined ? {} : { toolFilter: policy.toolFilter }), maxDepth: policy.maxDepth }
      if (args.background !== false) {
        const started = await ctx.subagents.startContinuable({ provider: policy.subagentProvider, label: `${policy.id}: ${args.objective.slice(0, 48)}`, request, signal: exec.signal })
        return { kind: 'continuable', id: started.childId }
      }
      const run = await ctx.subagents.start(policy.subagentProvider, { ...request, signal: exec.signal })
      try {
        const result = await run.result
        if (result.stopReason !== 'completed') {
          throw new Error(`specialist run ended with ${result.stopReason}`)
        }
        return { kind: 'foreground', id: run.id }
      } finally {
        await run.dispose()
      }
    },
  }))
}
