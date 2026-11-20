import {
  EMBED_SOURCE,
  RageClickDetector,
  SessionClock,
  alignToSession,
  computeBaseline,
  computeScreenReport,
  fromEmbedMessage,
  type HypothesisCard,
  type InteractionEvent
} from '@hx/core'
import { describe, expect, it } from 'vitest'
import { inputChangeKind, orientationOf, screenKeyOf, selectorOf, throttle, type ElLike } from '../src/pure'

const el = (tagName: string, attrs: Record<string, string> = {}, parent: ElLike | null = null, id?: string): ElLike => ({
  tagName,
  ...(id ? { id } : {}),
  parentElement: parent,
  getAttribute: (n) => attrs[n] ?? null
})

describe('embed SDK helpers', () => {
  const root = el('MAIN', { 'data-step': 'checkout' })
  const form = el('FORM', {}, root)
  const btn = el('BUTTON', {}, form)

  it('screenKey prefers the nearest data-step, else the path', () => {
    expect(screenKeyOf(btn, '/cart')).toBe('checkout')
    expect(screenKeyOf(el('DIV'), '/cart')).toBe('/cart')
    expect(screenKeyOf(null, '')).toBe('/')
  })
  it('selector is short and has no text or values', () => {
    expect(selectorOf(btn)).toBe('main[data-step="checkout"] > form > button')
    expect(selectorOf(el('INPUT', {}, form, 'email'))).toBe('input#email')
    expect(selectorOf(el('A', { 'data-testid': 'next' }, form))).toBe('a[data-testid="next"]')
  })
  it('input changes are classified by length only', () => {
    expect(inputChangeKind(3, 4)).toBe('input-edit')
    expect(inputChangeKind(4, 3)).toBe('input-delete')
    expect(inputChangeKind(4, 4, 'deleteContentBackward')).toBe('input-delete')
  })
  it('orientation and throttle', () => {
    expect(orientationOf(390, 844)).toBe('portrait')
    expect(orientationOf(1280, 800)).toBe('landscape')
    const ok = throttle(100)
    expect([0, 50, 100, 150, 220].map(ok)).toEqual([true, false, true, false, true])
  })
})

describe('embed messages -> interaction events', () => {
  let now = 10_000
  const clock = new SessionClock(() => now)
  clock.start()
  now = 15_000
  const msg = { source: EMBED_SOURCE, v: 2, type: 'click', at: 12_500, screenKey: 'checkout', payload: { x: 10, y: 20 }, pointerType: 'touch', viewport: { w: 390, h: 844 }, orientation: 'portrait', streamId: 'phone' }

  it('maps absolute time to the session clock and keeps mobile fields', () => {
    expect(fromEmbedMessage(msg, (ms) => clock.at(ms))).toEqual({
      t: 2.5, screenKey: 'checkout', type: 'click', v: 2, payload: { x: 10, y: 20 }, pointerType: 'touch', viewport: { w: 390, h: 844 }, orientation: 'portrait', streamId: 'phone'
    })
  })
  it('rejects foreign or malformed messages', () => {
    const conv = (m: unknown) => fromEmbedMessage(m, (ms) => clock.at(ms))
    expect(conv({ ...msg, source: 'other' })).toBeNull()
    expect(conv({ ...msg, type: 'keypress' })).toBeNull()
    expect(conv({ ...msg, v: 99 })).toBeNull()
    expect(conv({ ...msg, screenKey: '' })).toBeNull()
    expect(conv('click')).toBeNull()
    expect(conv({ ...msg, pointerType: 'eye' })).not.toHaveProperty('pointerType')
  })
})

describe('mobile-ready model', () => {
  it('rage click covers taps with a larger radius', () => {
    const d = new RageClickDetector()
    expect([0, 0.2, 0.4].map((t, i) => d.push({ t, x: 100 + i * 25, y: 100, pointerType: 'touch' }))).toEqual([false, false, true])
    const m = new RageClickDetector()
    expect([0, 0.2, 0.4].map((t, i) => m.push({ t, x: 100 + i * 25, y: 100, pointerType: 'mouse' }))).toEqual([false, false, false])
  })
  it('per-stream offsets move timestamps onto the session clock', () => {
    const items = [{ t: 1, streamId: 'phone' }, { t: 1, streamId: 'laptop-cam' }, { t: 1 }]
    expect(alignToSession(items, [{ streamId: 'phone', offsetSec: 0.35 }]).map((x) => x.t)).toEqual([1.35, 1, 1])
  })
  it('missing capabilities are excluded and reported, not read as calm', () => {
    const cards: HypothesisCard[] = [{ screenKey: 'a', screenName: 'Sepet', order: 1, behavior: 'flow', expectedSec: [0, 30] }]
    const events: InteractionEvent[] = [{ t: 0, screenKey: 'a', type: 'screen' }, { t: 1, screenKey: 'a', type: 'click', pointerType: 'touch' }]
    // Camera samples say "face lost" for 5 s, but the setup has no camera: no disengagement may come from them.
    const samples = Array.from({ length: 10 }, (_, t) => ({ t, face: t < 3 || t > 7, headSpeedMax: 0.1, talking: null, samples: 15 }))
    const r = computeScreenReport({ cards, events, samples, baseline: computeBaseline([], []), endSec: 10, cameraEnabled: true, capabilities: { hasCamera: false, hasHover: false } })
    expect(r.signals).toEqual({ camera: false, face: false, hover: false, screenVideo: false })
    expect(r.mismatches).toEqual([])
    expect(r.cameraCoverage).toBe(0)
  })
})
