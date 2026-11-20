import { describe, expect, it } from 'vitest'
import { computeBaseline, computeScreenReport, firstActionLatencies } from '../src/screens'
import type { HypothesisCard, InteractionEvent, SecondSample } from '../src/types'

const cards: HypothesisCard[] = [
  { screenKey: 'cart', screenName: 'Sepet', order: 1, behavior: 'flow', expectedSec: [2, 8] },
  { screenKey: 'delivery', screenName: 'Teslimat', order: 2, behavior: 'flow', expectedSec: [3, 10] },
  { screenKey: 'plan', screenName: 'Plan seçimi', order: 3, behavior: 'decide', expectedSec: [8, 30] },
  { screenKey: 'confirm', screenName: 'Onay', order: 4, behavior: 'read', expectedSec: [3, 10] }
]
const ev = (t: number, screenKey: string, type: InteractionEvent['type'], payload?: Record<string, unknown>): InteractionEvent => ({ t, screenKey, type, payload })
const warmup: InteractionEvent[] = [ev(0, 'w1', 'screen'), ev(1.2, 'w1', 'click'), ev(2, 'w2', 'screen'), ev(3.1, 'w2', 'click'), ev(4, 'w3', 'screen'), ev(5.5, 'w3', 'click')]
const s = (t: number, o: Partial<SecondSample> = {}): SecondSample => ({ t, face: true, headSpeedMax: 0.3, talking: 0, samples: 12, faceWidthRatio: 0.2, ...o })
const baseline = computeBaseline(Array.from({ length: 30 }, (_, i) => s(i - 30)), warmup)

describe('baseline', () => {
  it('learns first-action latency from warm-up', () => {
    expect(firstActionLatencies(warmup)).toEqual([1.2, 1.1, 1.5].map((x) => expect.closeTo(x, 5)))
    expect(baseline.firstActionP95).toBeCloseTo(1.2)
    expect(baseline.seconds).toBe(30)
  })
})

describe('screen report (two axes)', () => {
  // Sepet quick; Teslimat 14 s pause, goes back twice; Plan 3 s; Onay 27 s; looks away 8 s on Onay.
  const events: InteractionEvent[] = [
    ev(0, 'cart', 'screen'), ev(1, 'cart', 'click'),
    ev(2, 'delivery', 'screen'), ev(16, 'delivery', 'click'),
    ev(17, 'cart', 'screen'), ev(18, 'cart', 'click'),
    ev(19, 'delivery', 'screen'), ev(20, 'delivery', 'click'),
    ev(21, 'cart', 'screen'), ev(22, 'cart', 'click'),
    ev(23, 'delivery', 'screen'), ev(24, 'delivery', 'click'),
    ev(25, 'plan', 'screen'), ev(27, 'plan', 'click'),
    ev(28, 'confirm', 'screen'), ev(30, 'confirm', 'click')
  ]
  const samples = Array.from({ length: 55 }, (_, i) => s(i, i >= 40 && i < 48 ? { face: false, headSpeedMax: null } : {}))
  const r = computeScreenReport({ cards, events, samples, baseline, endSec: 55, cameraEnabled: true })
  const texts = r.mismatches.map((m) => m.text)

  it('produces behaviour sentences for each kind', () => {
    expect(texts).toEqual([
      'Teslimat: akıcı bekledin, katılımcı ilk aksiyondan önce 14 sn durdu.',
      'Teslimat: en fazla 10 sn bekledin, 19 sn sürdü.',
      'Teslimat: akıcı bekledin, katılımcı iki kez geri döndü ve iki kez bir önceki ekranla arasında gidip geldi.',
      "Plan seçimi: karar bekledin, katılımcı 3 sn'de geçti.",
      'Onay: en fazla 10 sn bekledin, 27 sn sürdü.',
      'Onay: katılımcı 8 sn ekrandan uzaklaştı.'
    ])
  })
  it('separates effort from friction', () => {
    const del = r.screens.find((x) => x.screenKey === 'delivery')!
    expect(del.observed).toEqual({ effort: 100, friction: 90 })
    expect(r.loops).toEqual([{ screens: ['cart', 'delivery'], count: 2 }])
    const em = r.mismatches.filter((m) => m.kind === 'effort-mismatch')
    expect(em.map((m) => [m.screenKey, m.direction])).toEqual([['delivery', 'high'], ['plan', 'low']])
    expect(em[1].expected).toEqual({ effort: 80, friction: 20 })
  })
  it('does not flag the smooth screen', () => {
    expect(r.mismatches.some((m) => m.screenKey === 'cart')).toBe(false)
  })
  it('a long pause on a read screen is expected effort, not a mismatch', () => {
    const c2 = cards.map((c) => (c.screenKey === 'delivery' ? { ...c, behavior: 'read' as const, expectedSec: [3, 60] as [number, number] } : c))
    const r2 = computeScreenReport({ cards: c2, events, samples, baseline, endSec: 55, cameraEnabled: true })
    expect(r2.mismatches.filter((m) => m.screenKey === 'delivery').map((m) => m.kind)).toEqual(['unexpected-friction'])
  })
  it('expected curves come from cards on both axes', () => {
    expect(r.expected.effort[5].level).toBe(20)
    expect(r.expected.effort[26].level).toBe(80)
    expect(r.expected.effort[30].level).toBe(80)
    expect(r.expected.friction[30].level).toBe(20)
  })
  it('observed curves step with the screen scores', () => {
    expect(r.observed.friction[5].level).toBe(90)
    expect(r.observed.friction[0].level).toBe(0)
  })
  it('replay window is 5 s around the anchor', () => {
    const fr = r.mismatches.find((m) => m.kind === 'unexpected-friction')!
    expect(fr.at).toBe(17) // first time going back
    expect(fr.replay).toEqual([12, 22])
    expect(r.mismatches.filter((m) => m.kind === 'over-time').map((m) => m.at)).toEqual([12, 38])
    expect(r.mismatches.find((m) => m.kind === 'disengagement')!.at).toBe(40)
  })
  it('never uses emotion words', () => {
    const banned = /kafası karış|stres|kork|sinir|şaşır|üzül|mutlu|kaş|frustr|confus|emotion|duygu/i
    for (const t of texts) expect(t).not.toMatch(banned)
  })
  it('without camera only interaction mismatches remain', () => {
    const r2 = computeScreenReport({ cards, events, samples, baseline, endSec: 55, cameraEnabled: false })
    expect(r2.mismatches.some((m) => m.kind === 'disengagement')).toBe(false)
    expect(r2.mismatches.map((m) => m.kind)).toEqual(['effort-mismatch', 'over-time', 'unexpected-friction', 'effort-mismatch', 'over-time'])
  })
  it('tab-out counts as disengagement even without camera', () => {
    const e2 = [...events, ev(31, 'confirm', 'visibility', { hidden: true }), ev(36, 'confirm', 'visibility', { hidden: false })]
    const r3 = computeScreenReport({ cards, events: e2, samples: [], baseline, endSec: 55, cameraEnabled: false })
    expect(r3.mismatches.find((m) => m.kind === 'disengagement')?.text).toBe('Onay: katılımcı 5 sn ekrandan uzaklaştı.')
  })
  it('is deterministic', () => {
    expect(computeScreenReport({ cards, events, samples, baseline, endSec: 55, cameraEnabled: true })).toEqual(r)
  })
})

describe('face signals (supporting only)', () => {
  const c: HypothesisCard[] = [
    { screenKey: 'a', screenName: 'Giriş', order: 1, behavior: 'flow', expectedSec: [0, 60] },
    { screenKey: 'b', screenName: 'Koşullar', order: 2, behavior: 'read', expectedSec: [0, 60] }
  ]
  const fb = computeBaseline(Array.from({ length: 30 }, (_, i) => s(i - 30, { blinkRate: 18, samples: 15, stillness: 0.3, browDown: 0.05 })), warmup)
  // On 'a' the participant goes still, blinks less and lowers brows, but acts quickly and never hits friction.
  const calmEvents = [ev(0, 'a', 'screen'), ev(1, 'a', 'click'), ev(10, 'b', 'screen'), ev(11, 'b', 'click')]
  const focused = Array.from({ length: 20 }, (_, i) => s(i, { blinkRate: 6, samples: 15, stillness: 0.9, browDown: 0.4, faceWidthRatio: 0.24 }))

  it('baseline includes blink, brow and stillness', () => {
    expect(fb).toMatchObject({ blinkRateMedian: 18, browDownMedian: 0.05, stillnessMedian: 0.3 })
  })
  it('face movement alone never creates a mismatch', () => {
    const r = computeScreenReport({ cards: c, events: calmEvents, samples: focused, baseline: fb, endSec: 20, cameraEnabled: true, faceSignals: true })
    expect(r.mismatches).toEqual([])
    expect(r.screens[0].faceSupport).toEqual(['blink-drop', 'stillness', 'lean-in'])
    expect(r.screens[0].observed.effort).toBeGreaterThan(computeScreenReport({ cards: c, events: calmEvents, samples: focused, baseline: fb, endSec: 20, cameraEnabled: true }).screens[0].observed.effort)
  })
  it('face signals off (default) ignores blendshapes even with camera on', () => {
    const r = computeScreenReport({ cards: c, events: calmEvents, samples: focused, baseline: fb, endSec: 20, cameraEnabled: true })
    expect(r.screens.every((x) => x.faceSupport.length === 0)).toBe(true)
  })
  it('with friction, brow movement raises severity only', () => {
    const fr = [ev(0, 'a', 'screen'), ev(1, 'a', 'dead-click'), ev(2, 'a', 'click'), ev(10, 'b', 'screen'), ev(11, 'b', 'click')]
    const on = computeScreenReport({ cards: c, events: fr, samples: focused, baseline: fb, endSec: 20, cameraEnabled: true, faceSignals: true })
    const off = computeScreenReport({ cards: c, events: fr, samples: focused, baseline: fb, endSec: 20, cameraEnabled: true })
    expect(on.mismatches.map((m) => m.text)).toEqual(off.mismatches.map((m) => m.text))
    expect(on.mismatches[0].severity).toBeGreaterThan(off.mismatches[0].severity)
    expect(on.screens[0].faceSupport).toContain('brow')
  })
  it('blink is ignored below 15 fps, other face signals still count', () => {
    const lowFps = focused.map((x) => ({ ...x, samples: 12 }))
    const r = computeScreenReport({ cards: c, events: calmEvents, samples: lowFps, baseline: fb, endSec: 20, cameraEnabled: true, faceSignals: true })
    expect(r.screens[0].faceSupport).toEqual(['stillness', 'lean-in'])
  })
  it('blink baseline can be extended with the first screen', () => {
    const b = computeBaseline([s(-2, { blinkRate: 10, samples: 15 })], [], [s(0, { blinkRate: 20, samples: 15 }), s(1, { blinkRate: 22, samples: 15 })])
    expect(b.blinkRateMedian).toBe(20)
    expect(b.seconds).toBe(1)
  })
})
