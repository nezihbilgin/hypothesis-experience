import { describe, expect, it } from 'vitest'
import { faceTimeline, type Baseline, type SecondSample } from '../src'

const base: Baseline = { headSpeedP95: 0.2, talkingMean: 0, faceWidthMedian: 0.2, firstActionP95: 1, blinkRateMedian: 15, browDownMedian: 0.2, stillnessMedian: 0.6, seconds: 30 }
const s = (t: number, o: Partial<SecondSample> = {}): SecondSample => ({ t, face: true, headSpeedMax: 0.1, talking: 0, samples: 15, faceWidthRatio: 0.2, browDown: 0.2, stillness: 0.5, blinkRate: 15, ...o })

describe('face timeline', () => {
  it('finds behaviour moments against the personal baseline', () => {
    const secs = Array.from({ length: 20 }, (_, t) =>
      s(t, {
        stillness: t >= 2 && t < 9 ? 1 : 0.5, // 7 s still
        faceWidthRatio: t >= 10 && t < 13 ? 0.24 : 0.2, // leaned in 3 s
        browDown: t >= 14 && t < 16 ? 0.35 : 0.2, // brow 2 s
        talking: t === 17 ? 0.8 : 0, // 1 s talk: too short
        face: !(t >= 18), // away 2 s
        blinkRate: 6
      })
    )
    expect(faceTimeline(secs, base, { faceSignals: true })).toEqual([
      { kind: 'blink-drop', t: 0, sec: 18 },
      { kind: 'still', t: 2, sec: 7 },
      { kind: 'lean-in', t: 10, sec: 3 },
      { kind: 'brow', t: 14, sec: 2 },
      { kind: 'away', t: 18, sec: 2 }
    ])
  })
  it('still means no interaction: seconds with a click break the run', () => {
    const secs = Array.from({ length: 12 }, (_, t) => s(t, { stillness: 1 }))
    expect(faceTimeline(secs, base, { faceSignals: true, activeSeconds: [3, 4] }).filter((m) => m.kind === 'still')).toEqual([{ kind: 'still', t: 5, sec: 7 }])
  })
  it('a question or comment pause splits a run', () => {
    const secs = Array.from({ length: 14 }, (_, t) => s(t, { stillness: 1 }))
    expect(faceTimeline(secs, base, { faceSignals: true, breaks: [6.4] }).filter((m) => m.kind === 'still')).toEqual([
      { kind: 'still', t: 0, sec: 7 },
      { kind: 'still', t: 7, sec: 7 }
    ])
  })
  it('without face signals only away and talking remain', () => {
    const secs = Array.from({ length: 6 }, (_, t) => s(t, { stillness: 1, talking: t < 3 ? 0.6 : 0 }))
    expect(faceTimeline(secs, base, { faceSignals: false })).toEqual([{ kind: 'talk', t: 0, sec: 3 }])
  })
})
