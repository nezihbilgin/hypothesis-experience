// Figma Embed API messages -> interaction_event schema.
// Faz 0 findings: some messages arrive as a bare string (e.g. "LOGIN_SCREEN_SHOWN"), others as { type, data };
// Figma's internal frame plumbing ({ command: ... } without type) is not an Embed API event and is dropped.
// Pure and deterministic: the app passes the message data (event.data, origin already checked) and a timestamp.
import { RageClickDetector } from '../signals'
import type { InteractionEvent } from '../types'

export const SCHEMA_VERSION = 1

export type FigmaStatus = 'loaded' | 'login-required' | 'password-required'

export interface FigmaPushResult {
  events: InteractionEvent[]
  /** Set when the message changes the embed's state; 'login-required' / 'password-required' mean the study cannot run. */
  status?: FigmaStatus
}

const BLOCKERS: Record<string, FigmaStatus> = { LOGIN_SCREEN_SHOWN: 'login-required', PASSWORD_SCREEN_SHOWN: 'password-required' }

/** Normalises a raw postMessage payload to { type, data }, or null if it is not an Embed API event. */
export function normalizeFigmaMessage(raw: unknown): { type: string; data: Record<string, unknown> } | null {
  if (typeof raw === 'string') return raw ? { type: raw, data: {} } : null
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (typeof o.type !== 'string') return null // includes { command: ... }
  const data = o.data && typeof o.data === 'object' ? (o.data as Record<string, unknown>) : {}
  return { type: o.type, data }
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined)

export class FigmaAdapter {
  /** Node id of the frame currently presented, null before the first PRESENTED_NODE_CHANGED. */
  screenKey: string | null = null
  private rage = new RageClickDetector()

  /** t: seconds from task start. */
  push(raw: unknown, t: number): FigmaPushResult {
    const msg = normalizeFigmaMessage(raw)
    if (!msg) return { events: [] }
    const { type, data } = msg
    if (BLOCKERS[type]) return { events: [], status: BLOCKERS[type] }
    if (type === 'INITIAL_LOAD') return { events: [], status: 'loaded' }

    if (type === 'PRESENTED_NODE_CHANGED') {
      const node = str(data.presentedNodeId)
      if (!node || node === this.screenKey) return { events: [] }
      const payload: Record<string, unknown> = {}
      if (this.screenKey) payload.from = this.screenKey
      const via = str(data.interactionType)
      if (via) payload.interactionType = via
      this.screenKey = node
      return { events: [this.ev(t, 'screen', payload)] }
    }

    if (type === 'MOUSE_PRESS_OR_RELEASE') {
      // A click can arrive before the first PRESENTED_NODE_CHANGED; fall back to the node it reports.
      if (!this.screenKey) this.screenKey = str(data.presentedNodeId) ?? null
      if (!this.screenKey) return { events: [] }
      const x = num(data.x) ?? 0
      const y = num(data.y) ?? 0
      const payload: Record<string, unknown> = { x, y }
      const target = str(data.targetNodeId)
      if (target) payload.targetNodeId = target
      if (typeof data.handled === 'boolean') payload.handled = data.handled
      const events = [this.ev(t, 'click', payload)]
      if (data.handled === false) events.push(this.ev(t, 'dead-click', { x, y, ...(target ? { targetNodeId: target } : {}) }))
      if (this.rage.push({ t, x, y })) events.push(this.ev(t, 'rage-click', { x, y }))
      return { events }
    }
    return { events: [] }
  }

  private ev(t: number, type: InteractionEvent['type'], payload: Record<string, unknown>): InteractionEvent {
    return { t, screenKey: this.screenKey!, type, payload, v: SCHEMA_VERSION }
  }
}
