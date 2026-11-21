import { describe, expect, it } from 'vitest'
import example from './fixtures/study.example.json'
import {
  FigmaAdapter,
  RageClickDetector,
  aliasMap,
  taskOutcome,
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

describe('screen aliases (Figma state variants)', () => {
  const cards: HypothesisCard[] = [
    { screenKey: 'amount', screenName: 'Tutar', order: 1, behavior: 'decide', expectedSec: [0, 60], aliases: ['amount-2', 'amount-3'] },
    { screenKey: 'cards', screenName: 'Kartlar', order: 2, behavior: 'flow', expectedSec: [0, 60], aliases: ['cards-all'] }
  ]
  it('the adapter turns a state change into a state event, not a screen transition', () => {
    const a = new FigmaAdapter({}, aliasMap(cards))
    const out = [
      ...a.push({ type: 'PRESENTED_NODE_CHANGED', data: { presentedNodeId: 'amount' } }, 0).events,
      ...a.push({ type: 'PRESENTED_NODE_CHANGED', data: { presentedNodeId: 'amount-2' } }, 2).events,
      ...a.push({ type: 'PRESENTED_NODE_CHANGED', data: { presentedNodeId: 'amount-3' } }, 4).events,
      ...a.push({ type: 'PRESENTED_NODE_CHANGED', data: { presentedNodeId: 'cards-all' } }, 6).events
    ]
    expect(out.map((e) => `${e.type}:${e.screenKey}`)).toEqual(['screen:amount', 'state:amount', 'state:amount', 'screen:cards'])
    expect(out[3].payload).toMatchObject({ from: 'amount', node: 'cards-all' })
    const click = a.push({ type: 'MOUSE_PRESS_OR_RELEASE', data: { handled: true, presentedNodeId: 'cards-all', nearestScrollingFrameId: 'cards-all', nearestScrollingFrameMousePosition: { x: 10, y: 20 } } }, 7).events[0]
    expect(click).toMatchObject({ screenKey: 'cards', payload: { x: 10, y: 20, node: 'cards-all', frameId: 'cards-all' } })
  })
  it('the report keeps one visit per logical screen even from raw node events', () => {
    const raw: InteractionEvent[] = [ev(0, 'amount', 'screen'), ev(1, 'amount', 'click'), ev(3, 'amount-2', 'screen'), ev(5, 'amount-3', 'screen'), ev(9, 'cards', 'screen')]
    const r = computeScreenReport({ cards, events: raw, samples: [], baseline: computeBaseline([], []), endSec: 12, cameraEnabled: false })
    expect(r.screens.find((x) => x.screenKey === 'amount')).toMatchObject({ durationSec: 9, visits: [{ start: 0, end: 9 }], backs: 0 })
  })
  it('study aliases parse, must be unique, and the target may be an alias', () => {
    const base = { name: 'x', sourceType: 'figma', sourceUrl: 'https://www.figma.com/proto/x' }
    const ok = parseStudy({ ...base, tasks: [{ prompt: 'p', targetScreen: 'cards-all', screens: [{ key: 'cards', name: 'K', behavior: 'flow', expectedSec: [0, 5], aliases: ['cards-all'] }] }] })
    expect(ok.ok && cardsFromTask(ok.study.tasks[0])[0].aliases).toEqual(['cards-all'])
    const dup = parseStudy({ ...base, tasks: [{ prompt: 'p', screens: [{ key: 'a', name: 'A', behavior: 'flow', expectedSec: [0, 5], aliases: ['b'] }, { key: 'b', name: 'B', behavior: 'flow', expectedSec: [0, 5] }] }] })
    expect(dup.ok ? [] : dup.errors).toEqual(['Görev 1: Ekran 2: "b" anahtarı iki kez kullanılmış.'])
  })
})

describe('study-level screens, expected path, off-path visits, orientation', () => {
  const study = {
    name: 'x', sourceType: 'figma', sourceUrl: 'https://www.figma.com/proto/x',
    screens: [
      { key: 'home', name: 'Home', participantName: 'Ana sayfa', behavior: 'flow', expectedSec: [0, 30] },
      { key: 'detail', name: 'Detail', behavior: 'read', expectedSec: [0, 60] },
      { key: 'orders', name: 'Orders', behavior: 'flow', expectedSec: [0, 30], aliases: ['orders-2'] }
    ],
    tasks: [
      { id: 'buy', prompt: 'Satın al', expectedPath: ['home', 'detail'], probes: { home: 'Ana sayfada aklından ne geçti?' } },
      { id: 'activate', prompt: 'Aç', expectedPath: ['home', 'orders'], targetScreen: 'orders-2', probes: { home: 'Siparişleri nerede aramayı bekledin?' }, overrides: { orders: { behavior: 'decide', expectedSec: [5, 20] } } }
    ]
  }
  it('parses study-level screens; each task gets path screens first, the rest off-path, probes per task', () => {
    const r = parseStudy(study)
    if (!r.ok) throw new Error(r.errors.join('\n'))
    const c1 = cardsFromTask(r.study.tasks[0])
    expect(c1.map((c) => [c.screenKey, c.order, !!c.offPath])).toEqual([['home', 1, false], ['detail', 2, false], ['orders', 3, true]])
    expect(c1[0].probe).toBe('Ana sayfada aklından ne geçti?')
    expect(cardsFromTask(r.study.tasks[1])[0].probe).toBe('Siparişleri nerede aramayı bekledin?')
    expect(r.study.tasks[1].expectedPath).toEqual(['home', 'orders'])
    expect(cardsFromTask(r.study.tasks[1])[1]).toMatchObject({ screenKey: 'orders', behavior: 'decide', expectedSec: [5, 20] })
    expect(c1[2]).toMatchObject({ screenKey: 'orders', behavior: 'flow' })
  })
  it('allowedScreens are acceptable detours (not off-path) and one screen can be on several tasks\' paths', () => {
    const r = parseStudy({ ...study, tasks: [{ id: 'a', prompt: 'p', expectedPath: ['home', 'detail'], allowedScreens: ['orders'] }, { id: 'b', prompt: 'q', expectedPath: ['home', 'detail', 'orders'] }] })
    if (!r.ok) throw new Error(r.errors.join())
    expect(cardsFromTask(r.study.tasks[0]).map((c) => [c.screenKey, !!c.offPath])).toEqual([['home', false], ['detail', false], ['orders', false]])
    expect(r.study.tasks[0].allowedScreens).toEqual(['orders'])
    expect(cardsFromTask(r.study.tasks[1]).every((c) => !c.offPath)).toBe(true)
    // Detour home → orders → detail: no off-path friction and no "back" for leaving the allowed screen.
    const rep = computeScreenReport({ cards: cardsFromTask(r.study.tasks[0]), events: [ev(0, 'home', 'screen'), ev(1, 'home', 'click'), ev(2, 'orders', 'screen'), ev(3, 'orders', 'click'), ev(4, 'detail', 'screen'), ev(5, 'detail', 'click')], samples: [], baseline: computeBaseline([], []), endSec: 6, cameraEnabled: false })
    expect(rep.screens.find((x) => x.screenKey === 'orders')).toMatchObject({ backs: 0, observed: { friction: 0 } })
    expect(rep.offPathScreens).toEqual([])
  })
  it('rejects unknown keys in expectedPath and probes', () => {
    const r = parseStudy({ ...study, tasks: [{ id: 'a', prompt: 'p', expectedPath: ['home', 'nope'], probes: { zzz: 'q' } }] })
    expect(r.ok ? [] : r.errors).toEqual(['Görev 1: expectedPath içindeki "nope" tanımlı ekranlardan biri değil.', 'Görev 1: probes içindeki "zzz" tanımlı ekranlardan biri değil.'])
  })
  it('an off-path visit adds friction and is listed separately; going back from it is not a "back"', () => {
    const r0 = parseStudy(study)
    if (!r0.ok) throw new Error()
    const cards = cardsFromTask(r0.study.tasks[0])
    const events = [ev(0, 'home', 'screen'), ev(6, 'home', 'click'), ev(7, 'orders', 'screen'), ev(8, 'orders', 'click'), ev(9, 'home', 'screen'), ev(10, 'home', 'click'), ev(11, 'detail', 'screen'), ev(30, 'detail', 'click')]
    const r = computeScreenReport({ cards, events, samples: [], baseline: computeBaseline([], []), endSec: 31, cameraEnabled: false })
    expect(r.offPathScreens).toEqual(['orders'])
    const orders = r.screens.find((x) => x.screenKey === 'orders')!
    expect(orders).toMatchObject({ offPath: true, backs: 0, observed: { friction: 40 } })
    expect(r.mismatches.find((m) => m.screenKey === 'orders')?.text).toBe('Orders: akıcı bekledin, katılımcı beklenen yolun dışındaki bu ekrana geldi.')
  })
  it('the first screen pause is orientation, not hesitation (default), and can be switched off', () => {
    const cards: HypothesisCard[] = [{ screenKey: 'home', screenName: 'Home', order: 1, behavior: 'flow', expectedSec: [0, 60] }, { screenKey: 'next', screenName: 'Next', order: 2, behavior: 'flow', expectedSec: [0, 60] }]
    const events = [ev(0, 'home', 'screen'), ev(15, 'home', 'click'), ev(16, 'next', 'screen'), ev(17, 'next', 'click')]
    const base = { cards, events, samples: [], baseline: computeBaseline([], []), endSec: 20, cameraEnabled: false }
    const r = computeScreenReport(base)
    expect(r.orientationSec).toBe(15)
    expect(r.mismatches).toEqual([])
    expect(computeScreenReport({ ...base, excludeOrientation: false }).mismatches.map((m) => m.kind)).toEqual(['effort-mismatch'])
  })
})

describe('metric set: loops, misclicks, outcome, orientation in over-time, funnel', () => {
  const cards: HypothesisCard[] = [
    { screenKey: 'a', screenName: 'A', order: 1, behavior: 'flow', expectedSec: [0, 10] },
    { screenKey: 'b', screenName: 'B', order: 2, behavior: 'flow', expectedSec: [0, 60] },
    { screenKey: 'x', screenName: 'X', order: 3, behavior: 'flow', expectedSec: [0, 60], offPath: true },
    { screenKey: 't', screenName: 'T', order: 4, behavior: 'read', expectedSec: [0, 60], aliases: ['t-done'] }
  ]
  const base = { cards, samples: [], baseline: computeBaseline([], []), cameraEnabled: false }
  it('A→B→A→B is one loop, counted on B; misclick rate per screen', () => {
    const events = [ev(0, 'a', 'screen'), ev(1, 'a', 'click'), ev(2, 'b', 'screen'), ev(3, 'b', 'dead-click'), ev(3, 'b', 'click'), ev(4, 'b', 'click'), ev(5, 'a', 'screen'), ev(6, 'b', 'screen'), ev(7, 'b', 'click')]
    const r = computeScreenReport({ ...base, events, endSec: 8 })
    expect(r.loops).toEqual([{ screens: ['a', 'b'], count: 1 }])
    expect(r.screens.find((s) => s.screenKey === 'b')).toMatchObject({ loops: 1, clicks: 3, deadClicks: 1, misclickRate: 0.33 })
  })
  it('over-time on the first screen uses the time after orientation', () => {
    const events = [ev(0, 'a', 'screen'), ev(8, 'a', 'click'), ev(15, 'b', 'screen'), ev(16, 'b', 'click')]
    const r = computeScreenReport({ ...base, events, endSec: 20 })
    expect(r.orientationSec).toBe(8)
    expect(r.screens[0]).toMatchObject({ orientationSec: 8, timedSec: 7 })
    expect(r.mismatches.some((m) => m.kind === 'over-time')).toBe(false) // 15 s on screen, 7 s after orientation, max 10
    const r2 = computeScreenReport({ ...base, events: [ev(0, 'a', 'screen'), ev(2, 'a', 'click'), ev(15, 'b', 'screen')], endSec: 20 })
    expect(r2.mismatches.find((m) => m.kind === 'over-time')?.text).toBe('A: en fazla 10 sn bekledin, 13 sn sürdü.')
  })
  it('task outcome: direct, indirect, failed, dropped (with last screen)', () => {
    const clicked = (xs: InteractionEvent[]) => xs.flatMap((e, i) => (i ? [ev(e.t - 0.2, xs[i - 1].screenKey, 'click'), e] : [e]))
    const path = clicked([ev(0, 'a', 'screen'), ev(1, 'b', 'screen'), ev(2, 't', 'screen'), ev(3, 't-done', 'screen')])
    const o = (events: InteractionEvent[], finished = true) => taskOutcome({ cards, events, targetScreen: 't-done', finished, endSec: 5 })
    expect(o(path).result).toBe('direct')
    expect(o(clicked([ev(0, 'a', 'screen'), ev(1, 'x', 'screen'), ev(2, 't', 'screen'), ev(3, 't-done', 'screen')]))).toMatchObject({ result: 'indirect', offPathVisited: ['x'] })
    expect(o(path.slice(0, 5)).result).toBe('failed') // reached t but not the "done" state
    expect(o(path.slice(0, 3), false)).toMatchObject({ result: 'dropped', lastScreen: 'b' })
    // Reaching the target with a click-less (keyboard) transition is not a direct success.
    expect(o([ev(0, 'a', 'screen'), ev(0.8, 'a', 'click'), ev(1, 'b', 'screen'), ev(2, 't', 'screen'), ev(3, 't-done', 'screen', { interactionType: 'ON_CLICK' })])).toMatchObject({ result: 'indirect', clicklessTransitions: 1 })
    // Timed, hover and drag transitions are the prototype's design, not a skipped click (QA KA-15).
    for (const it of ['AFTER_TIMEOUT', 'ON_HOVER', 'MOUSE_ENTER', 'ON_DRAG'])
      expect(o([ev(0, 'a', 'screen'), ev(0.8, 'a', 'click'), ev(1, 'b', 'screen', { interactionType: 'ON_CLICK' }), ev(2, 't', 'screen', { interactionType: it }), ev(2.5, 't', 'click'), ev(3, 't-done', 'screen', { interactionType: 'ON_CLICK' })])).toMatchObject({ result: 'direct', clicklessTransitions: 0 })
  })
  it('task summary: results, drop-off funnel, rage and misclicks per screen, median orientation', () => {
    const run = (events: InteractionEvent[], finished: boolean) => {
      const report = computeScreenReport({ ...base, events, endSec: 10 })
      return { participant: 'p', report, outcome: taskOutcome({ cards, events, targetScreen: 't', finished, endSec: 10 }), taskSec: 10 }
    }
    const sum = summarizeTask(cards, [
      run([ev(0, 'a', 'screen'), ev(2, 'a', 'click'), ev(3, 'b', 'screen'), ev(3.5, 'b', 'click'), ev(4, 't', 'screen')], true),
      run([ev(0, 'a', 'screen'), ev(4, 'a', 'click'), ev(5, 'b', 'screen'), ev(6, 'b', 'rage-click'), ev(6, 'b', 'dead-click'), ev(6, 'b', 'click')], false)
    ])
    expect(sum.results).toEqual({ direct: 1, indirect: 0, failed: 0, dropped: 1 })
    expect(sum.screens.find((s) => s.screenKey === 'b')).toMatchObject({ droppedHere: 1, rageClicks: 1, misclickRate: 0.5 })
    expect(sum.medianOrientationSec).toBe(2)
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
