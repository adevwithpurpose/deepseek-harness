import type { LlmFailure } from '@deepseek-ai/dsh-llm'

declare module '@deepseek-ai/dsh-session' {
  interface SessionEventMap {
    'llm/failover': ModelFailoverEventData
  }
}
/** Durable model route transition selected after a failed request. */
export interface ModelFailoverEventData {
  turn: number
  step: number
  attempt: number
  fromProvider: string
  fromModel: string
  toProvider: string
  toModel: string
  failure: LlmFailure
}

