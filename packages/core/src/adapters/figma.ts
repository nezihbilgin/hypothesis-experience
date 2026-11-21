// Figma Embed API messages -> interaction_event schema.
// Faz 0 findings: some messages arrive as a bare string (e.g. "LOGIN_SCREEN_SHOWN"), others as { type, data };
// Figma's internal frame plumbing ({ command: ... } without type) is not an Embed API event and is dropped.
// Pure and deterministic: the app passes the message data (event.data, origin already checked) and a timestamp.
import { RageClickDetector, SCHEMA_VERSION } from '../signals'
import type { InteractionEvent, PointerKind, Viewport } from '../types'

/** Device context the app knows (Figma does not report it); stamped on every event. */
export interface FigmaContext {
  pointerType?: PointerKind
  viewport?: Viewport
  orientation?: 'portrait' | 'landscape'
  streamId?: string
}


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

  /** Raw node id currently presented (a state variant when aliases are used). */
  private node: string | null = null
  /** Raw node currently presented (state variant), for comments. */
  get currentNode(): string | null {
    return this.node
  }
  /** Scroll offset of the frame at the last click (Figma reports it only with clicks), for placing comments. */
  lastScroll: { node: string; frameId: string; x: number; y: number; t: number } | null = null

  /** aliases: state-variant node id -> logical screen key (from the study's screen aliases, see aliasMap). */
  constructor(
    public context: FigmaContext = {},
    private readonly aliases: Record<string, string> = {}
  ) {}

  private logical = (node: string): string => this.aliases[node] ?? node

  /** t: seconds from task start. */
  push(raw: unknown, t: number): FigmaPushResult {
    const msg = normalizeFigmaMessage(raw)
    if (!msg) return { events: [] }
    const { type, data } = msg
    if (BLOCKERS[type]) return { events: [], status: BLOCKERS[type] }
    if (type === 'INITIAL_LOAD') return { events: [], status: 'loaded' }

    if (type === 'PRESENTED_NODE_CHANGED') {
      const node = str(data.presentedNodeId)
      if (!node || node === this.node) return { events: [] }
      const key = this.logical(node)
      const via = str(data.interactionType)
      const fromNode = this.node
      this.node = node
      if (key === this.screenKey) {
        // Same logical screen, another state: not a screen transition (no visit split, no question).
        return { events: [this.ev(t, 'state', { node, ...(fromNode ? { from: fromNode } : {}), ...(via ? { interactionType: via } : {}) })] }
      }
      const payload: Record<string, unknown> = {}
      if (this.screenKey) payload.from = this.screenKey
      if (node !== key) payload.node = node
      if (via) payload.interactionType = via
      this.screenKey = key
      return { events: [this.ev(t, 'screen', payload)] }
    }

    if (type === 'MOUSE_PRESS_OR_RELEASE') {
      // A click can arrive before the first PRESENTED_NODE_CHANGED; fall back to the node it reports.
      if (!this.screenKey) {
        const pn = str(data.presentedNodeId)
        this.node = pn ?? null
        this.screenKey = pn ? this.logical(pn) : null
      }
      if (!this.screenKey) return { events: [] }
      // Figma sends the click position as data.mousePosition {x, y} (frame coordinates); older/other payloads x, y.
      const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})
      const mp = obj(data.mousePosition)
      // Fallback: position inside the nearest scrolling frame + that frame's scroll offset.
      const sp = obj(data.nearestScrollingFrameMousePosition)
      const so = obj(data.nearestScrollingFrameOffset)
      const sx = num(sp.x) !== undefined ? num(sp.x)! + (num(so.x) ?? 0) : undefined
      const sy = num(sp.y) !== undefined ? num(sp.y)! + (num(so.y) ?? 0) : undefined
      const px = num(mp.x) ?? num(data.x) ?? sx
      const py = num(mp.y) ?? num(data.y) ?? sy
      const hasPos = px !== undefined && py !== undefined
      const x = px ?? 0
      const y = py ?? 0
      const payload: Record<string, unknown> = hasPos ? { x, y } : {}
      const target = str(data.targetNodeId)
      if (target) payload.targetNodeId = target
      if (typeof data.handled === 'boolean') payload.handled = data.handled
      // For the click map: which state node was on screen, and which frame the position is relative to.
      const presented = str(data.presentedNodeId) ?? this.node
      if (presented && presented !== this.screenKey) payload.node = presented
      const frameId = str(data.nearestScrollingFrameId)
      if (frameId && num(so.x) !== undefined && num(so.y) !== undefined) this.lastScroll = { node: presented ?? frameId, frameId, x: num(so.x)!, y: num(so.y)!, t }
      if (hasPos && frameId) payload.frameId = frameId
      const events = [this.ev(t, 'click', payload)]
      const pos = hasPos ? { x, y } : {}
      if (data.handled === false) events.push(this.ev(t, 'dead-click', { ...pos, ...(target ? { targetNodeId: target } : {}) }))
      const click = { t, x: hasPos ? x : NaN, y: hasPos ? y : NaN, ...(target ? { target } : {}), ...(this.context.pointerType ? { pointerType: this.context.pointerType } : {}) }
      if (this.rage.push(click)) events.push(this.ev(t, 'rage-click', { ...pos, ...(target ? { targetNodeId: target } : {}) }))
      return { events }
    }
    return { events: [] }
  }

  private ev(t: number, type: InteractionEvent['type'], payload: Record<string, unknown>): InteractionEvent {
    return { t, screenKey: this.screenKey!, type, payload, v: SCHEMA_VERSION, ...this.context }
  }
}
