import { describe, expect, it } from 'vitest'
import { computeSentiReport } from '../src/compat/senti'
import type { SecondSample, Session } from '../src/compat/senti-types'
import trace from './fixtures/startle-trace.json'

const sample = (t: number, o: Partial<SecondSample> = {}): SecondSample => ({
  t,
  face: true,
  headSpeedMax: 0.5,
  headSpeedMedian: 0.2,
  talking: 0,
  fear: 5,
  surprise: 10,
  neutral: 60,
  samples: 29,
  ...o
})

const base = (n = 30): SecondSample[] => Array.from({ length: n }, (_, i) => sample(i - n, { headSpeedMax: 0.4 + (i % 5) * 0.05 }))

function session(over: Partial<Session> & { play?: (t: number) => Partial<SecondSample> | null; len?: number } = {}): Session {
  const len = over.len ?? 180
  const samples: SecondSample[] = []
  for (let t = 0; t < len; t++) {
    const o = over.play?.(t)
    if (o !== null) samples.push(sample(t, o ?? {}))
  }
  const { play: _p, len: _l, ...rest } = over
  void _p
  void _l
  return {
    id: 's',
    name: 'test',
    createdAt: '2026-11-16T00:00:00Z',
    plannedSec: len,
    intended: [
      { t: 0, level: 20 },
      { t: len, level: 20 }
    ],
    beats: [],
    markers: [],
    baseline: base(),
    samples,
    playStartedAtMs: 0,
    playedSec: len,
    recording: null,
    sensing: { restarts: 0, signals: [] },
    consent: { acceptedAt: '' },
    ...rest
  }
}

const PEAK_INTENDED = [
  { t: 0, level: 20 },
  { t: 120, level: 20 },
  { t: 130, level: 90 },
  { t: 140, level: 20 },
  { t: 180, level: 20 }
]
const NO_DASH = /[–—]/

describe('computeSentiReport', () => {
  it('a clear startle at a planned peak yields no mismatch', () => {
    const r = computeSentiReport(
      session({ intended: PEAK_INTENDED, beats: [{ t: 130, label: 'jump scare' }], play: (t) => (t === 130 ? { headSpeedMax: 8 } : {}) })
    )
    expect(r.moments.filter((m) => m.kind === 'startle')).toHaveLength(1)
    expect(r.felt[130].level).toBeGreaterThan(40)
    expect(r.mismatches).toEqual([])
  })

  it('flags a missed peak with the beat label and no dashes', () => {
    const r = computeSentiReport(session({ intended: PEAK_INTENDED, beats: [{ t: 130, label: 'jump scare' }] }))
    expect(r.mismatches).toHaveLength(1)
    expect(r.mismatches[0].kind).toBe('missed-peak')
    expect(r.mismatches[0].text).toBe('Jump scare at 2:10: you planned a peak, the player barely moved.')
    expect(r.mismatches[0].text).not.toMatch(NO_DASH)
  })

  it('flags an unplanned spike in a calm stretch', () => {
    const r = computeSentiReport(session({ play: (t) => (t === 82 ? { headSpeedMax: 7 } : {}) }))
    const m = r.mismatches.find((x) => x.kind === 'unplanned-spike')
    expect(m).toBeDefined()
    expect(m!.start).toBeLessThanOrEqual(82)
    expect(m!.end).toBeGreaterThan(82)
    expect(m!.text).toMatch(/you planned calm, the player startled\.$/)
    expect(m!.text).not.toMatch(NO_DASH)
  })

  it('flags looking away during a planned peak, and not as a missed peak', () => {
    const r = computeSentiReport(
      session({
        intended: PEAK_INTENDED,
        beats: [{ t: 130, label: 'boss' }],
        play: (t) => (t >= 126 && t <= 134 ? { face: false, headSpeedMax: null, headSpeedMedian: null, talking: null, fear: null, surprise: null, neutral: null, samples: 0 } : {})
      })
    )
    expect(r.moments.some((m) => m.kind === 'lookaway' && m.durationSec === 9)).toBe(true)
    expect(r.mismatches.map((m) => m.kind)).toEqual(['looked-away'])
    expect(r.felt[130].level).toBe(0)
    expect(r.mismatches[0].text).toBe('Boss at 2:10: you planned tension, the player looked away.')
  })

  it('falls back to the first 20 s of play when the baseline is empty', () => {
    const r = computeSentiReport(session({ baseline: [], play: (t) => (t === 100 ? { headSpeedMax: 6 } : {}) }))
    expect(r.baseline.seconds).toBe(20)
    expect(r.moments.filter((m) => m.kind === 'startle')).toHaveLength(1)
  })

  it('returns an empty report for no samples without crashing', () => {
    const r = computeSentiReport(session({ samples: [], baseline: [] }))
    expect(r).toEqual({ felt: [], moments: [], mismatches: [], baseline: { headSpeedP95: 0, talkingMean: 0, seconds: 0 } })
  })

  it('is deterministic', () => {
    const s = session({ intended: PEAK_INTENDED, beats: [{ t: 130, label: 'x' }], play: (t) => (t % 37 === 0 ? { headSpeedMax: 5 } : {}) })
    expect(JSON.stringify(computeSentiReport(s))).toBe(JSON.stringify(computeSentiReport(s)))
  })

  it('merges adjacent windows of the same kind', () => {
    const r = computeSentiReport(session({ play: (t) => (t >= 62 && t <= 68 ? { headSpeedMax: t % 2 ? 7 : 6 } : {}) }))
    expect(r.mismatches.filter((m) => m.kind === 'unplanned-spike')).toHaveLength(1)
  })
})

describe('real trace (probe/logs startle test, one person, native camera)', () => {
  type Row = Omit<SecondSample, 't'> & { s: number; seg: string }
  const rows = trace as Row[]
  const settleEnd = rows.filter((r) => r.seg === 'settle').at(-1)!.s + 1
  const toSample = (r: Row): SecondSample => {
    const { s, seg, ...rest } = r
    void seg
    return { ...rest, t: s - settleEnd }
  }
  const s = session({
    baseline: rows.filter((r) => r.seg === 'settle' && r.face).map((r) => ({ ...toSample(r), t: r.s - settleEnd })),
    samples: rows.filter((r) => r.seg !== 'settle').map(toSample),
    playedSec: rows.length - settleEnd
  })
  const r = computeSentiReport(s)
  const startlesIn = (seg: string): number => {
    const ts = rows.filter((x) => x.seg === seg).map((x) => x.s - settleEnd)
    return r.moments.filter((m) => m.kind === 'startle' && m.t >= ts[0] && m.t <= ts.at(-1)!).length
  }

  it('finds at least 3 startles in the tense segment and at most 1 in the calm segment', () => {
    // eslint-disable-next-line no-console
    console.log(`REAL TRACE baseline=${JSON.stringify(r.baseline)} calm=${startlesIn('calm')} tense=${startlesIn('tense')} moments=${r.moments.length} mismatches=${r.mismatches.length}`)
    expect(startlesIn('tense')).toBeGreaterThanOrEqual(3)
    expect(startlesIn('calm')).toBeLessThanOrEqual(1)
  })
})
