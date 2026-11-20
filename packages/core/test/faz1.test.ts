import { describe, expect, it } from 'vitest'
import example from './fixtures/study.example.json'
import {
  FigmaAdapter,
  RageClickDetector,
  cameraQuality,
  cardsFromTask,
  computeBaseline,
  computeScreenReport,
  normalizeFigmaMessage,
  parseStudy,
  shouldTryCpuDelegate,
  summarizeTask,
  type HypothesisCard,
  type InteractionEvent,
  type SecondSample
} from '../src'

const s = (t: number, o: Partial<SecondSample> = {}): SecondSample => ({ t, face: true, headSpeedMax: 0.3, talking: 0, samples: 12, faceWidthRatio: 0.2, ...o })
const ev = (t: number, screenKey: string, type: InteractionEvent['type'], payload?: Record<string, unknown>): InteractionEvent => ({ t, screenKey, type, payload })

describe('low-sample seconds are no data', () => {
  const cards: HypothesisCard[] = [{ screenKey: 'a', screenName: 'Form', order: 1, behavior: 'read', expectedSec: [0, 60] }]
  const events = [ev(0, 'a', 'screen'), ev(1, 'a', 'click')]
  const baseline = computeBaseline(Array.from({ length: 20 }, (_, i) => s(i - 20)), [ev(-20, 'w', 'screen'), ev(-19, 'w', 'click')])

  it('a faceless second with < 5 frames is not "away"', () => {
    const samples = Array.from({ length: 20 }, (_, i) => s(i, i >= 5 && i < 12 ? { face: false, headSpeedMax: null, samples: 3 } : {}))
    const r = computeScreenReport({ cards, events, samples, baseline, endSec: 20, cameraEnabled: true })
    expect(r.mismatches.some((m) => m.kind === 'disengagement')).toBe(false)
    expect(r.screens[0].awaySec).toBe(0)
    expect(r.cameraCoverage).toBe(0.65)
  })
  it('the same seconds with enough frames are "away"', () => {
    const samples = Array.from({ length: 20 }, (_, i) => s(i, i >= 5 && i < 12 ? { face: false, headSpeedMax: null } : {}))
    const r = computeScreenReport({ cards, events, samples, baseline, endSec: 20, cameraEnabled: true })
    expect(r.mismatches.find((m) => m.kind === 'disengagement')?.text).toBe('Form: katılımcı 7 sn ekrandan uzaklaştı.')
    expect(r.cameraCoverage).toBe(1)
  })
  it('a low-sample head spike changes nothing but coverage', () => {
    const quiet = computeScreenReport({ cards, events, samples: Array.from({ length: 20 }, (_, i) => s(i)), baseline, endSec: 20, cameraEnabled: true })
    const spiky = computeScreenReport({ cards, events, samples: Array.from({ length: 20 }, (_, i) => s(i, i === 8 ? { headSpeedMax: 9, samples: 4 } : {})), baseline, endSec: 20, cameraEnabled: true })
    expect(spiky.screens).toEqual(quiet.screens)
    expect(spiky.mismatches).toEqual(quiet.mismatches)
    expect(spiky.cameraCoverage).toBe(0.95)
  })
  it('baseline ignores low-sample warm-up seconds', () => {
    const b = computeBaseline([...Array.from({ length: 10 }, (_, i) => s(i - 20)), s(-5, { headSpeedMax: 50, samples: 2 })], [])
    expect(b.seconds).toBe(10)
    expect(b.headSpeedP95).toBeCloseTo(0.3)
  })
  it('camera off means zero coverage', () => {
    const r = computeScreenReport({ cards, events, samples: [s(0)], baseline, endSec: 20, cameraEnabled: false })
    expect(r.cameraCoverage).toBe(0)
  })
})

describe('rage click detector', () => {
  it('fires once on the 3rd click within 1 s in the same area', () => {
    const d = new RageClickDetector()
    const out = [0, 0.2, 0.4, 0.6].map((t) => d.push({ t, x: 100, y: 100 }))
    expect(out).toEqual([false, false, true, false])
  })
  it('does not fire for spread-out or far-apart clicks', () => {
    const d = new RageClickDetector()
    expect([0, 0.8, 1.6].map((t) => d.push({ t, x: 0, y: 0 }))).toEqual([false, false, false])
    const d2 = new RageClickDetector()
    expect([0, 0.1, 0.2].map((t, i) => d2.push({ t, x: i * 200, y: 0 }))).toEqual([false, false, false])
  })
})

describe('figma adapter', () => {
  it('normalises string and object messages, drops command plumbing', () => {
    expect(normalizeFigmaMessage('LOGIN_SCREEN_SHOWN')).toEqual({ type: 'LOGIN_SCREEN_SHOWN', data: {} })
    expect(normalizeFigmaMessage({ type: 'INITIAL_LOAD', data: { x: 1 } })).toEqual({ type: 'INITIAL_LOAD', data: { x: 1 } })
    expect(normalizeFigmaMessage({ command: 'calculateSubFramePositioning' })).toBeNull()
    expect(normalizeFigmaMessage(null)).toBeNull()
  })
  it('reports a blocked embed', () => {
    const a = new FigmaAdapter()
    expect(a.push('LOGIN_SCREEN_SHOWN', 0)).toEqual({ events: [], status: 'login-required' })
    expect(a.push({ type: 'PASSWORD_SCREEN_SHOWN' }, 0).status).toBe('password-required')
    expect(a.push({ type: 'INITIAL_LOAD', data: {} }, 0).status).toBe('loaded')
  })
  it('turns a navigation into screen, click, dead-click and rage-click events', () => {
    const a = new FigmaAdapter()
    const out: InteractionEvent[] = []
    const feed = (raw: unknown, t: number): void => void out.push(...a.push(raw, t).events)
    feed({ type: 'PRESENTED_NODE_CHANGED', data: { presentedNodeId: '1:2', interactionType: 'NONE' } }, 0)
    feed({ type: 'PRESENTED_NODE_CHANGED', data: { presentedNodeId: '1:2' } }, 0.5) // duplicate, ignored
    feed({ type: 'MOUSE_PRESS_OR_RELEASE', data: { handled: true, targetNodeId: '9:1', x: 10, y: 20 } }, 1)
    feed({ type: 'PRESENTED_NODE_CHANGED', data: { presentedNodeId: '1:3', interactionType: 'ON_CLICK' } }, 1.1)
    for (const t of [3, 3.2, 3.4]) feed({ type: 'MOUSE_PRESS_OR_RELEASE', data: { handled: false, x: 50, y: 50 } }, t)
    feed({ command: 'calculateSubFramePositioning' }, 4)
    expect(out.map((e) => `${e.t} ${e.screenKey} ${e.type}`)).toEqual([
      '0 1:2 screen', '1 1:2 click', '1.1 1:3 screen',
      '3 1:3 click', '3 1:3 dead-click', '3.2 1:3 click', '3.2 1:3 dead-click', '3.4 1:3 click', '3.4 1:3 dead-click', '3.4 1:3 rage-click'
    ])
    expect(out[2].payload).toEqual({ from: '1:2', interactionType: 'ON_CLICK' })
    expect(out.every((e) => e.v === 2)).toBe(true)
  })
  it('reads the click position from data.mousePosition', () => {
    const a = new FigmaAdapter()
    a.push({ type: 'PRESENTED_NODE_CHANGED', data: { presentedNodeId: '1:2' } }, 0)
    const ev = a.push({ type: 'MOUSE_PRESS_OR_RELEASE', data: { handled: false, mousePosition: { x: 120, y: 340 } } }, 1).events
    expect(ev[0].payload).toMatchObject({ x: 120, y: 340 })
    // Three clicks far apart are not a rage click.
    a.push({ type: 'MOUSE_PRESS_OR_RELEASE', data: { handled: false, mousePosition: { x: 500, y: 40 } } }, 1.2)
    expect(a.push({ type: 'MOUSE_PRESS_OR_RELEASE', data: { handled: false, mousePosition: { x: 20, y: 600 } } }, 1.4).events.some((e) => e.type === 'rage-click')).toBe(false)
  })
  it('falls back to the nearest scrolling frame position + offset', () => {
    const a = new FigmaAdapter()
    a.push({ type: 'PRESENTED_NODE_CHANGED', data: { presentedNodeId: '1:2' } }, 0)
    const ev = a.push({ type: 'MOUSE_PRESS_OR_RELEASE', data: { handled: true, nearestScrollingFrameMousePosition: { x: 100, y: 50 }, nearestScrollingFrameOffset: { x: 0, y: 400 } } }, 1).events
    expect(ev[0].payload).toMatchObject({ x: 100, y: 450 })
  })
  it('without a position, rage click needs the same target element', () => {
    const a = new FigmaAdapter()
    a.push({ type: 'PRESENTED_NODE_CHANGED', data: { presentedNodeId: '1:2' } }, 0)
    const click = (t: number, target: string) => a.push({ type: 'MOUSE_PRESS_OR_RELEASE', data: { handled: false, targetNodeId: target } }, t).events
    expect([click(1, 'a'), click(1.2, 'b'), click(1.4, 'c')].flat().some((e) => e.type === 'rage-click')).toBe(false)
    const ev = [click(3, 'x'), click(3.2, 'x'), click(3.4, 'x')].flat()
    expect(ev.filter((e) => e.type === 'rage-click').length).toBe(1)
    expect(ev[0].payload).toEqual({ targetNodeId: 'x', handled: false })
  })
  it('a click before any screen event uses the node it reports', () => {
    const a = new FigmaAdapter()
    expect(a.push({ type: 'MOUSE_PRESS_OR_RELEASE', data: { handled: true } }, 0).events).toEqual([])
    expect(a.push({ type: 'MOUSE_PRESS_OR_RELEASE', data: { handled: true, presentedNodeId: '1:2' } }, 1).events[0].screenKey).toBe('1:2')
  })
  it('adapter output feeds the screen model', () => {
    const a = new FigmaAdapter()
    const events: InteractionEvent[] = []
    const feed = (raw: unknown, t: number): void => void events.push(...a.push(raw, t).events)
    feed({ type: 'PRESENTED_NODE_CHANGED', data: { presentedNodeId: '1:2' } }, 0)
    for (const t of [1, 1.3, 1.6]) feed({ type: 'MOUSE_PRESS_OR_RELEASE', data: { handled: false, x: 5, y: 5 } }, t)
    feed({ type: 'MOUSE_PRESS_OR_RELEASE', data: { handled: true, x: 80, y: 90 } }, 3)
    feed({ type: 'PRESENTED_NODE_CHANGED', data: { presentedNodeId: '1:3' } }, 3.1)
    const parsed = parseStudy(example)
    if (!parsed.ok) throw new Error(parsed.errors.join())
    const cards = cardsFromTask(parsed.study.tasks[0])
    const baseline = computeBaseline([], [])
    const r = computeScreenReport({ cards, events, samples: [], baseline, endSec: 6, cameraEnabled: false })
    expect(r.mismatches.find((m) => m.screenKey === '1:2')?.text).toBe('Sepet: akıcı bekledin, katılımcı üç kez tepkisiz bir yere tıkladı ve bir kez aynı yere art arda tıkladı.')
  })
})

describe('camera quality', () => {
  it('uses the median of the last 5 seconds', () => {
    expect(cameraQuality({ fpsPerSecond: [2, 3, 13, 12, 6, 14, 13], faceRatio: 0.95 })).toEqual({ cameraEnabled: true, blinkEnabled: false, reason: 'ok', medianFps: 13 })
    expect(cameraQuality({ fpsPerSecond: [15, 15, 16, 14, 15], faceRatio: 0.95 }).blinkEnabled).toBe(true)
  })
  it('falls back to camera-less mode on low fps or no face', () => {
    expect(cameraQuality({ fpsPerSecond: [9, 8, 12, 7, 9], faceRatio: 1 })).toMatchObject({ cameraEnabled: false, reason: 'low-fps', medianFps: 9 })
    expect(cameraQuality({ fpsPerSecond: [14, 14, 14, 14, 14], faceRatio: 0.3 })).toMatchObject({ cameraEnabled: false, reason: 'no-face' })
    expect(cameraQuality({ fpsPerSecond: [], faceRatio: 0 })).toMatchObject({ cameraEnabled: false, reason: 'no-frames' })
  })
  it('gives a lighting hint without changing the decision', () => {
    expect(cameraQuality({ fpsPerSecond: [14, 14, 14, 14, 14], faceRatio: 0.9, brightness: 0.1 })).toMatchObject({ cameraEnabled: true, hint: 'dark' })
  })
  it('tries the CPU delegate only on 4+ cores', () => {
    expect(shouldTryCpuDelegate(2)).toBe(false)
    expect(shouldTryCpuDelegate(4)).toBe(true)
    expect(shouldTryCpuDelegate(undefined)).toBe(false)
  })
})

describe('study definition', () => {
  it('parses the example and builds ordered cards', () => {
    const r = parseStudy(example)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.study.orgId).toBe('default')
    expect(r.study.tasks.length).toBe(1)
    const cards = cardsFromTask(r.study.tasks[0])
    expect(cards.map((c) => [c.screenKey, c.order, c.behavior])).toEqual([['1:2', 1, 'flow'], ['1:3', 2, 'flow'], ['1:4', 3, 'decide'], ['1:5', 4, 'read']])
    expect(cards[2].successCriterion).toBe('Aylık plan seçilir')
  })
  it('lists every problem in Turkish', () => {
    const r = parseStudy({
      name: '', sourceType: 'figma', sourceUrl: 'https://example.com/x', taskPrompt: 'Görev',
      screens: [{ key: 'a', name: 'A', behavior: 'fast', expectedSec: [5, 2] }, { key: 'a', name: 'B', behavior: 'flow', expectedSec: [1, 2] }]
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors).toEqual([
      'Çalışma adı (name) boş olamaz.',
      'Figma çalışmasında link figma.com adresi olmalı.',
      'Ekran 1 (A): behavior "flow", "read" ya da "decide" olmalı.',
      'Ekran 1 (A): expectedSec [min, max] saniye olmalı, min ≤ max.',
      'Ekran 2: "a" anahtarı iki kez kullanılmış.'
    ])
  })
  it('rejects a missing screen list and a bad url', () => {
    const r = parseStudy({ name: 'x', sourceType: 'script', sourceUrl: 'nope', taskPrompt: 'y' })
    expect(r.ok ? [] : r.errors).toEqual(['Prototip linki geçerli bir adres değil: nope', 'En az bir ekran (screens) tanımlanmalı.'])
  })
})

describe('study summary', () => {
  const cards: HypothesisCard[] = [
    { screenKey: 'a', screenName: 'Sepet', order: 1, behavior: 'flow', expectedSec: [0, 10] },
    { screenKey: 'b', screenName: 'Onay', order: 2, behavior: 'read', expectedSec: [0, 5] }
  ]
  const baseline = computeBaseline([], [])
  const run = (events: InteractionEvent[], endSec: number) => computeScreenReport({ cards, events, samples: [], baseline, endSec, cameraEnabled: false })
  const p1 = run([ev(0, 'a', 'screen'), ev(1, 'a', 'click'), ev(2, 'b', 'screen'), ev(3, 'b', 'click')], 12) // Onay over time (10 s)
  const p2 = run([ev(0, 'a', 'screen'), ev(1, 'a', 'dead-click'), ev(2, 'a', 'click'), ev(3, 'b', 'screen'), ev(4, 'b', 'click')], 6)
  const p3 = run([ev(0, 'a', 'screen'), ev(1, 'a', 'click')], 4) // never reached Onay

  it('counts participants per screen and kind', () => {
    const sum = summarizeTask(cards, [{ participant: 'P1', report: p1 }, { participant: 'P2', report: p2 }, { participant: 'P3', report: p3 }])
    expect(sum.participants).toBe(3)
    expect(sum.screens[0]).toMatchObject({ screenName: 'Sepet', reached: 3, withMismatch: 1, byKind: { 'unexpected-friction': 1 } })
    expect(sum.screens[1]).toMatchObject({ screenName: 'Onay', reached: 2, withMismatch: 1, byKind: { 'over-time': 1 }, medianDurationSec: 3 })
  })
})
