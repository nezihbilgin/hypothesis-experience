import { describe, expect, it } from 'vitest'
import { computeBaseline, computeScreenReport, firstActionLatencies, retroMoments } from '../src/screens'
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
const baseline = computeBaseline(Array.from({ length: 20 }, (_, i) => s(i - 20)), warmup)

describe('baseline', () => {
  it('learns first-action latency from warm-up', () => {
    expect(firstActionLatencies(warmup)).toEqual([1.2, 1.1, 1.5].map((x) => expect.closeTo(x, 5)))
    expect(baseline.firstActionP95).toBeCloseTo(1.2)
    expect(baseline.seconds).toBe(20)
  })
})

describe('screen report', () => {
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

  it('produces the handoff example sentences', () => {
    expect(texts).toContain('Teslimat: akıcı bekledin, katılımcı 14 sn durdu ve iki kez geri döndü.')
    expect(texts).toContain('Plan seçimi: karar bekledin, katılımcı 3 sn\'de geçti.')
    expect(texts).toContain('Onay: en fazla 10 sn bekledin, 27 sn sürdü.')
    expect(texts).toContain('Onay: katılımcı 8 sn ekrandan uzaklaştı.')
  })
  it('does not flag the smooth screen', () => {
    expect(r.mismatches.some((m) => m.screenKey === 'cart')).toBe(false)
  })
  it('expected curve comes from cards', () => {
    expect(r.expectedCurve[5].level).toBe(20)
    expect(r.expectedCurve[26].level).toBe(80)
    expect(r.expectedCurve[30].level).toBe(50)
  })
  it('real curve rises on friction and drops to 0 when away', () => {
    expect(Math.max(...r.realCurve.slice(2, 26).map((p) => p.level))).toBeGreaterThan(30)
    expect(r.realCurve[42].level).toBe(0)
  })
  it('picks at most 4 retro clips of 10 s', () => {
    const m = retroMoments(r)
    expect(m.length).toBeLessThanOrEqual(4)
    for (const x of m) expect(x.clip[1] - x.clip[0]).toBe(10)
  })
  it('never uses emotion words', () => {
    const banned = /kafası karış|stres|kork|sinir|şaşır|üzül|mutlu|frustr|confus|emotion|duygu/i
    for (const t of texts) expect(t).not.toMatch(banned)
  })
  it('without camera only interaction mismatches remain', () => {
    const r2 = computeScreenReport({ cards, events, samples, baseline, endSec: 55, cameraEnabled: false })
    expect(r2.mismatches.some((m) => m.kind === 'disengagement')).toBe(false)
    expect(r2.mismatches.some((m) => m.kind === 'unexpected-friction')).toBe(true)
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
