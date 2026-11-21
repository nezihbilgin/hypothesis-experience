// Session health block (decisions 2026-11-20 "oturum sağlığı bloğu"): numbers only, computed from the session
// data, with simple automatic flags. Shown first in the session file (and at the top of the researcher report),
// so a broken session is spotted before its findings are read. Pure and deterministic.
import { median, percentile } from './engine'
import { MIN_SAMPLES } from './screens'
import { clicklessTransitions } from './signals'
import type { Baseline, InteractionEvent, SecondSample } from './types'

export const HEALTH_MIN_FPS = 10
export const HEALTH_MIN_FACE_SHARE = 0.7
export const HEALTH_MIN_WARMUP_CLICKS = 3
/** A handled click should be followed by a screen/state change within this time; otherwise an event went missing. */
const TRANSITION_WINDOW_SEC = 1

export interface HealthTaskInput {
  id: string
  events: InteractionEvent[]
  samples: SecondSample[]
  unknownScreens: string[]
  questions: { dontRemember: boolean; skipped: boolean }[]
  endSec: number | null
  reachedTargetAt: number | null
  hasTarget: boolean
}

export interface HealthInput {
  cameraOn: boolean
  warmup: { samples: SecondSample[]; events: InteractionEvent[] }
  baseline: Baseline
  tasks: HealthTaskInput[]
  sessionSec: number
  /** Flow step the session was on when the file was written; 'summary' = completed. */
  lastStep: string
}

export type HealthFlag = 'clickless-transitions' | 'low-fps' | 'face-missing' | 'unknown-screens' | 'missing-transitions' | 'baseline-invalid' | 'not-completed' | 'target-not-reached' | 'many-dont-remember'

export interface SessionHealth {
  sessionSec: number
  completed: boolean
  lastStep: string
  camera: { on: boolean; fpsMedian: number | null; fpsP10: number | null; faceShare: number | null }
  warmup: { durationSec: number; clicks: number; baselineValid: boolean }
  prototype: { unknownScreens: number; clicksWithoutTransition: number; clicklessTransitions: number }
  questions: { asked: number; skipped: number; dontRemember: number }
  tasks: { id: string; durationSec: number | null; reachedTarget: boolean | null }[]
  flags: HealthFlag[]
}

const r2 = (n: number): number => Math.round(n * 100) / 100

export function sessionHealth(h: HealthInput): SessionHealth {
  const seconds = [...h.warmup.samples, ...h.tasks.flatMap((t) => t.samples)]
  const fps = seconds.map((s) => s.samples)
  const usable = seconds.filter((s) => s.samples >= MIN_SAMPLES)
  const camera = {
    on: h.cameraOn,
    fpsMedian: h.cameraOn && fps.length ? median(fps) : null,
    fpsP10: h.cameraOn && fps.length ? percentile(fps, 0.1) : null,
    faceShare: h.cameraOn && usable.length ? r2(usable.filter((s) => s.face).length / usable.length) : null
  }

  const wClicks = h.warmup.events.filter((e) => e.type === 'click')
  const wTimes = h.warmup.events.map((e) => e.t)
  const warmup = {
    durationSec: wTimes.length ? r2(Math.max(...wTimes) - Math.min(0, ...wTimes)) : 0,
    clicks: wClicks.length,
    baselineValid: wClicks.length >= HEALTH_MIN_WARMUP_CLICKS && h.baseline.firstActionP95 > 0
  }

  let clicksWithoutTransition = 0
  const clickless = h.tasks.reduce((a, t) => a + clicklessTransitions(t.events).length, 0)
  for (const t of h.tasks) {
    const changes = t.events.filter((e) => e.type === 'screen' || e.type === 'state').map((e) => e.t)
    for (const c of t.events)
      if (c.type === 'click' && c.payload?.handled === true && !changes.some((x) => x >= c.t && x - c.t <= TRANSITION_WINDOW_SEC)) clicksWithoutTransition++
  }
  const unknown = new Set(h.tasks.flatMap((t) => t.unknownScreens))
  const qs = h.tasks.flatMap((t) => t.questions)
  const questions = { asked: qs.length, skipped: qs.filter((q) => q.skipped).length, dontRemember: qs.filter((q) => q.dontRemember).length }
  const tasks = h.tasks.map((t) => ({ id: t.id, durationSec: t.endSec === null ? null : r2(t.endSec), reachedTarget: t.hasTarget ? t.reachedTargetAt !== null : null }))
  const completed = h.lastStep === 'summary'

  const flags: HealthFlag[] = []
  if (camera.fpsMedian !== null && camera.fpsMedian < HEALTH_MIN_FPS) flags.push('low-fps')
  if (camera.faceShare !== null && camera.faceShare < HEALTH_MIN_FACE_SHARE) flags.push('face-missing')
  if (unknown.size) flags.push('unknown-screens')
  if (clicksWithoutTransition) flags.push('missing-transitions')
  if (clickless) flags.push('clickless-transitions')
  if (!warmup.baselineValid) flags.push('baseline-invalid')
  if (!completed) flags.push('not-completed')
  if (tasks.some((t) => t.reachedTarget === false)) flags.push('target-not-reached')
  if (questions.asked >= 2 && questions.dontRemember / questions.asked > 0.5) flags.push('many-dont-remember')

  return {
    sessionSec: r2(h.sessionSec),
    completed,
    lastStep: h.lastStep,
    camera,
    warmup,
    prototype: { unknownScreens: unknown.size, clicksWithoutTransition, clicklessTransitions: clickless },
    questions,
    tasks,
    flags
  }
}
