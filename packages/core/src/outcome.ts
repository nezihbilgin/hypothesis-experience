// Task outcome (decisions 2026-11-20 metric set): direct success (expected path to the target), indirect success
// (target reached via off-path screens), failed (Done without the target), dropped (the task never ended: gave up,
// tab closed, timeout). Pure; works on logical screens (aliases applied).
import { aliasMap, logicalEvents } from './screens'
import { clicklessTransitions } from './signals'
import type { HypothesisCard, InteractionEvent } from './types'

export type TaskResult = 'direct' | 'indirect' | 'failed' | 'dropped'

export interface TaskOutcome {
  /** null when the task has no target screen (success cannot be judged), unless it was dropped. */
  result: TaskResult | null
  /** Logical screen the participant was on when the task ended (drop-off funnel). */
  lastScreen: string | null
  /** Task seconds when it ended or was last seen. */
  endedAt: number | null
  /** Off-path screens visited before reaching the target (or before the end). */
  offPathVisited: string[]
  /** Click-less transitions (probably keyboard) before reaching the target; any makes a success indirect. */
  clicklessTransitions: number
}

export function taskOutcome(opts: {
  cards: HypothesisCard[]
  events: InteractionEvent[]
  targetScreen?: string
  /** Participant pressed Done. */
  finished: boolean
  endSec: number | null
}): TaskOutcome {
  const events = logicalEvents(opts.events, opts.cards)
  const screens = events.filter((e) => e.type === 'screen' || e.type === 'state')
  const map = aliasMap(opts.cards)
  const target = opts.targetScreen
  const reached = target
    ? screens.find((e) => (typeof e.payload?.node === 'string' ? e.payload.node : e.screenKey) === target || (!(target in map) && e.screenKey === target))
    : undefined
  const until = reached ? reached.t : Infinity
  const offPath = new Set(opts.cards.filter((c) => c.offPath).map((c) => c.screenKey))
  const offPathVisited = [...new Set(screens.filter((e) => e.type === 'screen' && e.t <= until && offPath.has(e.screenKey)).map((e) => e.screenKey))]
  const last = [...screens].reverse().find((e) => e.type === 'screen')
  const lastT = events.length ? events[events.length - 1].t : null
  let result: TaskResult | null | undefined
  if (!opts.finished) result = 'dropped'
  else if (!target) result = null
  else if (!reached) result = 'failed'
  const clickless = clicklessTransitions(events).filter((c) => c.t <= until).length
  if (result === undefined) result = offPathVisited.length || clickless ? 'indirect' : 'direct'
  return { result, lastScreen: last?.screenKey ?? null, endedAt: opts.endSec ?? lastT, offPathVisited, clicklessTransitions: clickless }
}
