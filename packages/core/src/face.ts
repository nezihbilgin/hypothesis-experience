// Face behaviour timeline for the report (decisions 2026-11-21, item D): behaviour moments only, each against the
// participant's own warm-up baseline. No emotion labels and no images (Principle 1). Pure and deterministic.
import { mean } from './engine'
import { MIN_BLINK_SAMPLES, MIN_SAMPLES } from './screens'
import type { Baseline, SecondSample } from './types'

export type FaceMomentKind = 'still' | 'lean-in' | 'brow' | 'blink-drop' | 'talk' | 'away'

export interface FaceMoment {
  kind: FaceMomentKind
  /** Start, task seconds. */
  t: number
  sec: number
}

export const FACE_STILL_MIN_SEC = 5
export const FACE_RUN_MIN_SEC = 2
const STILL_LEVEL = 0.9
const LEAN_RATIO = 1.1
const BROW_RISE = 0.1
const BLINK_DROP_RATIO = 0.6
const TALK_LEVEL = 0.3

function runs(seconds: SecondSample[], test: (s: SecondSample) => boolean, minSec: number, kind: FaceMomentKind, breaks: number[] = []): FaceMoment[] {
  const out: FaceMoment[] = []
  let start: number | null = null
  let last = -Infinity
  const close = (): void => {
    if (start !== null && last - start + 1 >= minSec) out.push({ kind, t: start, sec: last - start + 1 })
    start = null
  }
  // A pause (question or comment) between two seconds ends a run: the participant did something else in between.
  const crossesBreak = (a: number, b: number): boolean => breaks.some((x) => x > a && x <= b)
  for (const s of seconds) {
    if (test(s) && (start === null || (s.t === last + 1 && !crossesBreak(last, s.t)))) {
      if (start === null) start = s.t
      last = s.t
    } else {
      close()
      if (test(s)) {
        start = s.t
        last = s.t
      }
    }
  }
  close()
  return out
}

/**
 * Moments within one screen's seconds. `faceSignals` gates the blendshape/pose moments (still, lean-in, brow,
 * blink-drop); 'away' needs only the camera and 'talk' the microphone.
 * 'still' counts only seconds without interaction (`activeSeconds`: seconds with a click): sitting still while
 * clicking through is the norm at a screen (first real session: stillness was ~1 most of the time), so the moment
 * means "held still without doing anything", at least max(5 s, 2 x the personal first-action time).
 */
export interface FaceTimelineOptions {
  /** Blendshape/pose moments need the participant's face-signal consent. */
  faceSignals: boolean
  /** Seconds with a click (they end a 'still' run). */
  activeSeconds?: Iterable<number>
  /** Task times where the clock was paused for a question or a comment: no run spans one. */
  breaks?: number[]
}

export function faceTimeline(samples: SecondSample[], baseline: Baseline, opts: FaceTimelineOptions): FaceMoment[] {
  const { faceSignals } = opts
  const active = new Set(opts.activeSeconds ?? [])
  const br = opts.breaks ?? []
  const sec = [...samples].filter((s) => s.samples >= MIN_SAMPLES).sort((a, b) => a.t - b.t)
  const faced = (s: SecondSample): boolean => s.face
  const out: FaceMoment[] = []
  out.push(...runs(sec, (s) => !s.face, FACE_RUN_MIN_SEC, 'away', br))
  out.push(...runs(sec, (s) => faced(s) && (s.talking ?? 0) >= TALK_LEVEL, FACE_RUN_MIN_SEC, 'talk', br))
  if (faceSignals) {
    const stillMin = Math.max(FACE_STILL_MIN_SEC, Math.ceil(2 * baseline.firstActionP95))
    out.push(...runs(sec, (s) => faced(s) && !active.has(s.t) && (s.stillness ?? 0) >= STILL_LEVEL, stillMin, 'still', br))
    if (baseline.faceWidthMedian > 0) out.push(...runs(sec, (s) => faced(s) && (s.faceWidthRatio ?? 0) >= baseline.faceWidthMedian * LEAN_RATIO, FACE_RUN_MIN_SEC, 'lean-in', br))
    out.push(...runs(sec, (s) => faced(s) && s.browDown != null && s.browDown - baseline.browDownMedian >= BROW_RISE, FACE_RUN_MIN_SEC, 'brow', br))
    const blink = sec.filter((s) => faced(s) && s.samples >= MIN_BLINK_SAMPLES && s.blinkRate != null)
    if (baseline.blinkRateMedian > 0 && blink.length >= 5 && mean(blink.map((s) => s.blinkRate!)) < baseline.blinkRateMedian * BLINK_DROP_RATIO)
      out.push({ kind: 'blink-drop', t: blink[0].t, sec: blink.length })
  }
  return out.sort((a, b) => a.t - b.t || a.kind.localeCompare(b.kind))
}
