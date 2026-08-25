import type { Context } from '@deepseek-ai/cordis'
import type { ConversationMatch, ConversationNodeDefinition, ModelRouteSelectedNode } from '@deepseek-ai/dsh-client-runtime/client'
import type { RouteSelectedChatData } from '../contract/chat-nodes.ts'
import { chatNode } from './common.ts'

type RouteSelectedEvent = {
  type: 'llm/route-selected'
  seq: number
  time: number
  data: { routeId: string; provider: string; model: string; candidates: number }
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ChatNodeDataMap {
    'model-route-selected': RouteSelectedChatData
  }
}

/** One-event model route selection definition. */
export const routeSelectedDefinition: ConversationNodeDefinition<ModelRouteSelectedNode> = {
  kind: 'model-route-selected',
  target: 'chat',
  match: (event: unknown) => {
    const candidate = event as Partial<RouteSelectedEvent>
    return candidate.type === 'llm/route-selected' ? { id: String(candidate.seq), role: 'start' } : null
  },
  start: (_context, match: ConversationMatch) => {
    const event = match.event as RouteSelectedEvent
    return {
      kind: 'model-route-selected',
      seq: event.seq,
      time: event.time,
      routeId: event.data.routeId,
      provider: event.data.provider,
      model: event.data.model,
      candidates: event.data.candidates,
    }
  },
  update: context => context.state,
  buildViewNode: context => context.state === undefined ? null : chatNode(
    context, 'model-route-selected', context.state.seq, { route: context.state }),
}

/** Register the model route selection projection. @param ctx - owning conversation context. */
export function registerRouteSelectedConversationNode(ctx: Context): void {
  ctx.conversationEvents.register(routeSelectedDefinition)
}
