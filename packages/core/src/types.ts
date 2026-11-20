// Data contract for @hx/core. Pure types, no runtime code.
// Started from Senti's src/shared/session.ts (MIT, Techkeyy). Emotion/expression classification scores are
// intentionally absent (Principle 1). Raw muscle-movement blendshapes (blink, brow) are allowed only as
// supporting signals, relative to the participant's baseline, and never interpreted in text (decisions 2026-11-20).

/** One second of camera/mic behaviour, produced by the sensing worker. t = seconds from task start (negative = warm-up). */
export interface SecondSample {
  t: number
  /** Screen shown for most of this second (filled by the app, not by sensing). */
  screenKey?: string
  /** Face tracked for most of this second. */
  face: boolean
  /** Peak face-centre speed, face-widths per second. */
  headSpeedMax: number | null
  /** Face width / frame width, median this second (leaning-in signal). */
  faceWidthRatio?: number | null
  /** Fraction of this second the participant was talking, 0..1: voice activity confirmed by jaw movement.
   * null when it cannot be confirmed (no face this second, or no microphone). */
  talking: number | null
  /** Raw voice activity from the microphone, 0..1, before the jaw check (also picks up other people and noise). */
  voice?: number | null
  /** Range of the raw jawOpen blendshape within this second, 0..1 (mouth movement). */
  jawMovement?: number | null
  /** Frames processed this second, with or without a face (frame-rate proxy). Below 5 the second counts as no data. */
  samples: number
  /** Blinks per minute, estimated over a short window. null when fps < 15 (blinks last 100-400 ms). */
  blinkRate?: number | null
  /** Raw browDownLeft/Right blendshape, mean this second, 0..1. Supporting signal only. */
  browDown?: number | null
  /** Fraction of this second the head was still (below a small speed), 0..1. */
  stillness?: number | null
}

export type Behavior = 'flow' | 'read' | 'decide'
export type AxisLevel = 'low' | 'high'

/** Two axes: effort can be fine, friction is not (decisions 2026-11-20, item 1). */
export const BEHAVIOR_EXPECT: Record<Behavior, { effort: AxisLevel; friction: AxisLevel }> = {
  flow: { effort: 'low', friction: 'low' },
  read: { effort: 'high', friction: 'low' },
  decide: { effort: 'high', friction: 'low' }
}
/** Level drawn for an expected axis value on the 0..100 chart scale. */
export const AXIS_LEVEL: Record<AxisLevel, number> = { low: 20, high: 80 }

export interface HypothesisCard {
  screenKey: string
  /** Display name used in sentences, e.g. "Teslimat". */
  screenName: string
  order: number
  behavior: Behavior
  expectedSec: [number, number]
  successCriterion?: string
  note?: string
  /** Planned question, asked when the participant leaves this screen. */
  probe?: string
}

export type InteractionType =
  | 'screen' // payload: { from?: string }
  | 'click' // payload: { x, y, selector? }
  | 'dead-click'
  | 'rage-click'
  | 'input-edit'
  | 'input-delete'
  | 'scroll'
  | 'visibility' // payload: { hidden: boolean }
  | 'js-error'

export interface InteractionEvent {
  t: number
  screenKey: string
  type: InteractionType
  payload?: Record<string, unknown>
  v?: number
}

/** Baseline learned from the warm-up task (Principle 2). Camera fields are 0 when there was no usable data. */
export interface Baseline {
  headSpeedP95: number
  talkingMean: number
  faceWidthMedian: number
  /** p95 of "screen shown -> first meaningful action" during warm-up, seconds. */
  firstActionP95: number
  /** Median blinks/min (warm-up, optionally + first screen of the first task). 0 = unknown. */
  blinkRateMedian: number
  browDownMedian: number
  stillnessMedian: number
  seconds: number
}

export type MismatchKind = 'unexpected-friction' | 'effort-mismatch' | 'disengagement' | 'over-time'

export interface AxisScores {
  effort: number
  friction: number
}

export interface ScreenStats {
  screenKey: string
  durationSec: number
  visits: { start: number; end: number }[]
  firstActionSec: number | null
  /** Pause before the first action is above the personal threshold. */
  hesitation: boolean
  backs: number
  deadClicks: number
  rageClicks: number
  awaySec: number
  /** Observed levels 0..100. Effort is interaction-based, face signals only add when enabled. */
  observed: AxisScores
  /** Face signals that moved against the baseline here (empty when face signals are off). Never shown as text. */
  faceSupport: ('blink-drop' | 'stillness' | 'lean-in' | 'brow')[]
}

export interface Mismatch {
  screenKey: string
  kind: MismatchKind
  /** effort-mismatch only: 'low' = passed without reading/deciding, 'high' = effort on a flow screen. */
  direction?: AxisLevel
  start: number
  end: number
  /** Anchor moment for replay (first friction event, away start, etc.). */
  at: number
  /** Frame-replay range: 5 s before to 5 s after `at`. */
  replay: [number, number]
  expected: AxisScores
  observed: AxisScores
  /** Ranking weight for picking questions. */
  severity: number
  /** Researcher-facing sentence (behaviour only, Turkish). Never shown to the participant. */
  text: string
}

export interface CurvePoint {
  t: number
  level: number
}

export interface AxisCurves {
  effort: CurvePoint[]
  friction: CurvePoint[]
}

export interface ScreenReport {
  baseline: Baseline
  expected: AxisCurves
  observed: AxisCurves
  screens: ScreenStats[]
  mismatches: Mismatch[]
  /** Fraction of task seconds with usable camera data (0 when the camera is off). */
  cameraCoverage: number
}
