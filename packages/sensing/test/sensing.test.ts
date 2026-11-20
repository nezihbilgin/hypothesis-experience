import { SessionClock, computeBaseline, computeScreenReport, type SecondSample } from '@hx/core'
import { describe, expect, it } from 'vitest'
import { EnergyVad, QualityProbe, SecondAggregator, type FrameResult } from '../src'

/** Frames for one second at `fps`, face centred and still unless overridden. */
const second = (sec: number, fps: number, o: (i: number) => Partial<FrameResult> = () => ({})): FrameResult[] =>
  Array.from({ length: fps }, (_, i) => ({ t: sec + i / fps, face: true, cx: 0.5, cy: 0.5, width: 0.2, blink: 0.05, browDown: 0.1, ...o(i) }))

const run = (frames: FrameResult[]): SecondSample[] => {
  const out: SecondSample[] = []
  const agg = new SecondAggregator((s) => out.push(s))
  for (const f of frames) agg.push(f)
  agg.flush()
  return out
}

describe('second aggregator', () => {
  it('emits one sample per second with frame count and face', () => {
    const out = run([...second(0, 15), ...second(1, 15, (i) => (i < 10 ? { face: false } : {}))])
    expect(out.map((s) => [s.t, s.samples, s.face])).toEqual([[0, 15, true], [1, 15, false]])
    expect(out[1].headSpeedMax).toBeNull()
  })
  it('measures head speed in face-widths per second and stillness', () => {
    // Moves 0.02 per frame at 10 fps = 0.2 units/s = 1 face-width/s.
    const out = run(second(0, 10, (i) => ({ cx: 0.5 + 0.02 * i })))
    expect(out[0].headSpeedMax).toBeCloseTo(1, 3)
    expect(out[0].stillness).toBe(0)
    expect(run(second(0, 10))[0].stillness).toBe(1)
  })
  it('reports face width median and brow mean', () => {
    const out = run(second(0, 10, (i) => ({ width: i < 6 ? 0.25 : 0.2, browDown: 0.3 })))
    expect(out[0].faceWidthRatio).toBe(0.25)
    expect(out[0].browDown).toBe(0.3)
  })
  it('counts blinks with hysteresis and gives a rate only at >= 15 fps', () => {
    // One blink per second (frames 3-4 closed), 6 seconds at 15 fps -> 60 blinks/min after 5 valid seconds.
    const blinking = (sec: number, fps: number) => second(sec, fps, (i) => ({ blink: i === 3 || i === 4 ? 0.8 : 0.05 }))
    const out = run(Array.from({ length: 6 }, (_, s) => blinking(s, 15)).flat())
    expect(out.map((s) => s.blinkRate)).toEqual([null, null, null, null, 60, 60])
    const slow = run(Array.from({ length: 6 }, (_, s) => blinking(s, 12)).flat())
    expect(slow.every((s) => s.blinkRate === null)).toBe(true)
  })
  it('a half-closed eye flicker between thresholds is not a blink', () => {
    const out = run(Array.from({ length: 6 }, (_, s) => second(s, 15, (i) => ({ blink: i % 2 ? 0.45 : 0.4 }))).flat())
    expect(out[5].blinkRate).toBe(0)
  })
  it('adds the talking ratio from VAD frames', () => {
    const out: SecondSample[] = []
    const agg = new SecondAggregator((s) => out.push(s))
    for (let i = 0; i < 50; i++) agg.pushAudio(i * 0.02, i < 20)
    for (const f of second(0, 10)) agg.push(f)
    agg.flush()
    expect(out[0].talking).toBe(0.4)
  })
  it('output feeds the core model: baseline and report', () => {
    const warm = run(Array.from({ length: 30 }, (_, s) => second(s - 30, 15)).flat())
    const baseline = computeBaseline(warm, [])
    expect(baseline.seconds).toBe(30)
    expect(baseline.stillnessMedian).toBe(1)
    const task = run(Array.from({ length: 10 }, (_, s) => second(s, 15)).flat())
    const r = computeScreenReport({
      cards: [{ screenKey: 'a', screenName: 'Sepet', order: 1, behavior: 'flow', expectedSec: [0, 30] }],
      events: [{ t: 0, screenKey: 'a', type: 'screen' }, { t: 1, screenKey: 'a', type: 'click' }],
      samples: task, baseline, endSec: 10, cameraEnabled: true, faceSignals: true
    })
    expect(r.cameraCoverage).toBe(1)
    expect(r.mismatches).toEqual([])
  })
})

describe('energy VAD', () => {
  it('detects speech above the adaptive noise floor and holds briefly', () => {
    const vad = new EnergyVad({ minRms: 0.01, ratio: 3, adapt: 0.1, hangover: 2 })
    const quiet = Array.from({ length: 10 }, () => vad.push(0.005))
    expect(quiet.every((x) => !x)).toBe(true)
    expect(vad.push(0.1)).toBe(true)
    expect([vad.push(0.005), vad.push(0.005), vad.push(0.005)]).toEqual([true, true, false])
  })
  it('computes RMS', () => {
    expect(EnergyVad.rms([0.5, -0.5, 0.5, -0.5])).toBe(0.5)
    expect(EnergyVad.rms([])).toBe(0)
  })
})

describe('quality probe', () => {
  const sample = (t: number, samples: number, face = true): SecondSample => ({ t, face, headSpeedMax: 0.1, talking: null, samples })
  it('ignores GPU warm-up seconds and decides from the next 5', () => {
    const p = new QualityProbe(3)
    for (const [t, n] of [[0, 1], [1, 2], [2, 3], [3, 14], [4, 13], [5, 15], [6, 12], [7, 14]]) p.push(sample(t, n))
    expect(p.done).toBe(true)
    expect(p.decide()).toMatchObject({ cameraEnabled: true, blinkEnabled: false, medianFps: 14 })
  })
  it('falls back to camera-less mode when the face is mostly missing', () => {
    const p = new QualityProbe()
    for (let t = 0; t < 5; t++) p.push(sample(t, 15, t === 0))
    expect(p.decide()).toMatchObject({ cameraEnabled: false, reason: 'no-face' })
  })
})

describe('session clock', () => {
  it('starts at zero and stops while paused', () => {
    let now = 1000
    const c = new SessionClock(() => now)
    expect(c.t()).toBe(0)
    c.start()
    now = 3000
    expect(c.t()).toBe(2)
    c.pause()
    now = 10000
    expect(c.t()).toBe(2)
    expect(c.at(9000)).toBe(2)
    c.resume()
    now = 11000
    expect(c.t()).toBe(3)
    expect(c.at(10500)).toBe(2.5)
  })
})
