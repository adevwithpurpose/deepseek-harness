// Shared time-label helpers for user/assistant IconActions rows.

import type { ConversationNode } from '@deepseek-ai/dsh-client-runtime/client'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'

/** The date-template share of the conversation dictionary the clock consumes. */
export type ClockTranslate = Translate<'clock.md' | 'clock.ymd'>

/** The elapsed-duration share of the conversation dictionary. */
export type RunDurationTranslate = Translate<'duration.seconds' | 'duration.minutes'>
function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * Local calendar-day epoch (ms at local midnight) for an instant.
 * @param ms - Unix epoch ms.
 * @returns Midnight of that local calendar day.
 */
export function startOfLocalDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * Delay until the next local midnight after `ms` (at least 1ms).
 * @param ms - Unix epoch ms.
 * @returns Milliseconds until the following local midnight.
 */
export function msUntilNextLocalMidnight(ms: number): number {
  const next = new Date(ms)
  next.setHours(24, 0, 0, 0)
  return Math.max(next.getTime() - ms, 1)
}

/**
 * Localized elapsed-time label shared by running and settled turn chrome.
 * @param ms - Elapsed duration in milliseconds (negatives clamp to zero).
 * @param t - Translate seat supplying the duration templates.
 * @returns Display string in whole seconds.
 */
export function formatRunDuration(ms: number, t: RunDurationTranslate): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return minutes > 0
    ? t('duration.minutes', { minutes, seconds: String(seconds).padStart(2, '0') })
    : t('duration.seconds', { seconds })
}

/**
 * Sub-turn latency figure: one decimal under ten seconds, whole seconds
 * beyond. Unit-less so the locale template owns the second suffix.
 * @param ms - Latency in milliseconds (negatives clamp to zero).
 * @returns Display number in seconds without unit.
 */
export function formatLatencySeconds(ms: number): string {
  const s = Math.max(0, ms) / 1000
  return s < 10 ? String(Math.round(s * 10) / 10) : String(Math.round(s))
}

/**
 * Decode-throughput figure: whole tokens from ten up, one decimal below.
 * @param tps - Tokens per second.
 * @returns Display number without unit.
 */
export function formatTokensPerSecond(tps: number): string {
  const clamped = Math.max(0, tps)
  return clamped >= 10 ? String(Math.round(clamped)) : String(Math.round(clamped * 10) / 10)
}

/** Provider/model identity currently answering a session, as displayed in the composer stats strip. */
export interface SessionModelFact {
  provider: string
  model: string
}

/**
 * Latest durable model fact across one chat's settled nodes. Assistant nodes
 * contribute their request provenance; route-selection and failover nodes
 * contribute the route's target — so routed subagents show their own chain,
 * and a failover flips the display the moment its event lands. The highest-seq
 * fact wins; `null` before any modeled response.
 * @param nodes - settled Chat nodes from the conversation snapshot.
 * @returns the current provider/model identity, or null when none exists.
 */
export function currentModelFromNodes(nodes: readonly ConversationNode[]): SessionModelFact | null {
  let best: { seq: number; fact: SessionModelFact } | null = null
  for (const node of nodes) {
    let fact: SessionModelFact | undefined
    if (node.kind === 'assistant') {
      const provenance = node.provenance
      if (provenance !== undefined) fact = { provider: provenance.provider, model: provenance.model }
    } else if (node.kind === 'model-route-selected') {
      fact = { provider: node.provider, model: node.model }
    } else if (node.kind === 'model-failover') {
      fact = { provider: node.toProvider, model: node.toModel }
    }
    if (fact !== undefined && (best === null || node.seq > best.seq)) best = { seq: node.seq, fact }
  }
  return best?.fact ?? null
}

/**
 * Compact local timestamp for message IconActions. Same calendar day →
 * `HH:mm`; earlier this year → the `clock.md` date template + clock; other
 * years → the `clock.ymd` template + clock. Pure: the date templates arrive
 * through the caller's locale seat.
 * @param time - Unix epoch ms from the source session event.
 * @param t - translate seat supplying the `clock.md` / `clock.ymd` templates.
 * @param now - Reference instant for the day/year cut (defaults to wall clock).
 * @returns Date-aware clock string (24-hour, zero-padded time).
 */
export function formatMessageClock(time: number, t: ClockTranslate, now: number = Date.now()): string {
  const d = new Date(time)
  const n = new Date(now)
  const clock = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  if (
    d.getFullYear() === n.getFullYear()
    && d.getMonth() === n.getMonth()
    && d.getDate() === n.getDate()
  ) {
    return clock
  }
  const params = { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() }
  const md = d.getFullYear() === n.getFullYear() ? t('clock.md', params) : t('clock.ymd', params)
  return `${md} ${clock}`
}
