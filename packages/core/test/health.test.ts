import { describe, expect, it } from 'vitest'
import { computeBaseline, sessionHealth, type HealthInput, type InteractionEvent, type SecondSample } from '../src'

const ev = (t: number, screenKey: string, type: InteractionEvent['type'], payload?: Record<string, unknown>): InteractionEvent => ({ t, screenKey, type, payload })
const s = (t: number, o: Partial<SecondSample> = {}): SecondSample => ({ t, face: true, headSpeedMax: 0.1, talking: null, samples: 15, ...o })
const warmEvents = [1, 2, 3].flatMap((i) => [ev(i * 2, `w${i}`, 'screen'), ev(i * 2 + 1, `w${i}`, 'click')])

const base = (o: Partial<HealthInput> = {}): HealthInput => ({
  cameraOn: true,
  warmup: { samples: Array.from({ length: 30 }, (_, i) => s(i)), events: warmEvents },
  baseline: computeBaseline([], warmEvents),
  tasks: [
    {
      id: 't1',
      events: [ev(0, 'a', 'screen'), ev(2, 'a', 'click', { handled: true }), ev(2.01, 'b', 'screen'), ev(5, 'b', 'click', { handled: true })],
      samples: Array.from({ length: 10 }, (_, i) => s(i)),
      unknownScreens: [],
      questions: [{ dontRemember: false, skipped: false }],
      endSec: 10,
      reachedTargetAt: 2.01,
      hasTarget: true
    }
  ],
  sessionSec: 300,
  lastStep: 'summary',
  ...o
})

describe('session health', () => {
  it('summarises a healthy session with no flags except a missing transition', () => {
    const h = sessionHealth(base())
    expect(h.camera).toEqual({ on: true, fpsMedian: 15, fpsP10: 15, faceShare: 1 })
    expect(h.warmup).toEqual({ durationSec: 7, clicks: 3, baselineValid: true })
    expect(h.prototype).toEqual({ unknownScreens: 0, clicksWithoutTransition: 1 }) // the handled click at 5 s led nowhere
    expect(h.tasks).toEqual([{ id: 't1', durationSec: 10, reachedTarget: true }])
    expect(h.flags).toEqual(['missing-transitions'])
  })
  it('flags low fps, missing face, unknown screens, an invalid baseline and an unfinished session', () => {
    const h = sessionHealth(
      base({
        warmup: { samples: Array.from({ length: 30 }, (_, i) => s(i, { samples: 8, face: i % 2 === 0 })), events: [ev(0, 'w1', 'screen')] },
        baseline: computeBaseline([], []),
        tasks: [{ ...base().tasks[0], unknownScreens: ['9:9'], reachedTargetAt: null, questions: [{ dontRemember: true, skipped: false }, { dontRemember: true, skipped: false }] }],
        lastStep: 'task'
      })
    )
    expect(h.flags).toEqual(['low-fps', 'face-missing', 'unknown-screens', 'missing-transitions', 'baseline-invalid', 'not-completed', 'target-not-reached', 'many-dont-remember'])
  })
  it('camera off: no camera numbers and no camera flags', () => {
    const h = sessionHealth(base({ cameraOn: false, warmup: { samples: [], events: warmEvents } }))
    expect(h.camera).toEqual({ on: false, fpsMedian: null, fpsP10: null, faceShare: null })
    expect(h.flags).not.toContain('low-fps')
  })
})
