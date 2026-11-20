// embed-sdk postMessage -> interaction_event. The SDK runs inside the prototype page (AI demo / live site);
// the participant app receives its messages, checks the origin, and converts them here.
// The SDK stamps absolute time (performance.timeOrigin + now, shared across frames); the app maps it to the
// session clock (SessionClock.at), so both sources end up on one clock.
import { SCHEMA_VERSION } from '../signals'
import type { InteractionEvent, InteractionType, PointerKind } from '../types'

export const EMBED_SOURCE = 'hx-embed'

export interface EmbedMessage {
  source: typeof EMBED_SOURCE
  v: number
  type: InteractionType
  /** Absolute milliseconds: performance.timeOrigin + performance.now() in the prototype page. */
  at: number
  screenKey: string
  payload?: Record<string, unknown>
  pointerType?: PointerKind
  viewport?: { w: number; h: number }
  orientation?: 'portrait' | 'landscape'
  streamId?: string
}

const TYPES: InteractionType[] = ['screen', 'click', 'dead-click', 'rage-click', 'input-edit', 'input-delete', 'scroll', 'pointer-move', 'visibility', 'js-error']
const POINTERS: PointerKind[] = ['mouse', 'touch', 'pen']

/** Validates a raw message and converts it; null for anything that is not a well-formed SDK message. */
export function fromEmbedMessage(raw: unknown, toSessionSec: (absMs: number) => number): InteractionEvent | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Record<string, unknown>
  if (m.source !== EMBED_SOURCE || typeof m.v !== 'number' || m.v > SCHEMA_VERSION) return null
  if (!TYPES.includes(m.type as InteractionType) || typeof m.at !== 'number' || !Number.isFinite(m.at)) return null
  if (typeof m.screenKey !== 'string' || !m.screenKey) return null
  const ev: InteractionEvent = { t: Math.round(toSessionSec(m.at) * 1000) / 1000, screenKey: m.screenKey, type: m.type as InteractionType, v: m.v }
  if (m.payload && typeof m.payload === 'object') ev.payload = m.payload as Record<string, unknown>
  if (POINTERS.includes(m.pointerType as PointerKind)) ev.pointerType = m.pointerType as PointerKind
  const vp = m.viewport as { w?: unknown; h?: unknown } | undefined
  if (vp && typeof vp.w === 'number' && typeof vp.h === 'number') ev.viewport = { w: vp.w, h: vp.h }
  if (m.orientation === 'portrait' || m.orientation === 'landscape') ev.orientation = m.orientation
  if (typeof m.streamId === 'string' && m.streamId) ev.streamId = m.streamId
  return ev
}
