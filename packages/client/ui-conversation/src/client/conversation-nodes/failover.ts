import type { Context } from '@deepseek-ai/cordis'
import type {
  ConversationMatch,
  ConversationNodeDefinition,
  ModelFailoverNode,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { FailoverChatData } from '../contract/chat-nodes.ts'
import { chatNode } from './common.ts'

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ChatNodeDataMap {
    'model-failover': FailoverChatData
  }
}

/** One-event model failover Definition. */
export const failoverDefinition: ConversationNodeDefinition<ModelFailoverNode> = {
  kind: 'model-failover',
  target: 'chat',
  match: (event: any) => event.type === 'llm/failover' ? { id: String(event.seq), role: 'start' } : null,
  start: (_context, match: ConversationMatch) => {
    const event = match.event as any
    if (event.type !== 'llm/failover') throw new Error('model-failover start requires llm/failover')
    return {
      kind: 'model-failover',
      seq: event.seq,
      time: event.time,
      turn: event.data.turn,
      step: event.data.step,
      attempt: event.data.attempt,
      fromProvider: event.data.fromProvider,
      fromModel: event.data.fromModel,
      toProvider: event.data.toProvider,
      toModel: event.data.toModel,
    }
  },
  update: context => context.state,
  buildViewNode: context => context.state === undefined ? null : chatNode(context, 'model-failover', context.state.seq, { transition: context.state }),
}

/** Register model failover projection. @param ctx - owning conversation context. */
export function registerFailoverConversationNode(ctx: Context): void {
  ctx.conversationEvents.register(failoverDefinition)
}

