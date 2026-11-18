// Data contract for @hx/core. Pure types, no runtime code.
// Started from Senti's src/shared/session.ts (MIT, Techkeyy). Expression fields (fear/surprise/neutral) are
// intentionally absent: the product never infers emotion (Principle 1).

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
  /** Fraction of this second with voice activity, 0..1. */
  talking: number | null
  /** Landmark packets this second (frame-rate proxy / quality). */
  samples: number
}

export type Behavior = 'flow' | 'read' | 'decide'
export const BEHAVIOR_LEVEL: Record<Behavior, number> = { flow: 20, read: 50, decide: 80 }

export interface HypothesisCard {
  screenKey: string
  /** Display name used in sentences, e.g. "Teslimat". */
  screenName: string
  order: number
  behavior: Behavior
  expectedSec: [number, number]
  successCriterion?: string
  note?: string
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

/** Baseline learned from the warm-up task (Principle 2). */
export interface Baseline {
  headSpeedP95: number
  talkingMean: number
  faceWidthMedian: number
  /** p95 of "screen shown -> first meaningful action" during warm-up, seconds. */
  firstActionP95: number
  seconds: number
}

export type MismatchKind = 'unexpected-friction' | 'missed-decision' | 'disengagement' | 'over-time'

export interface ScreenStats {
  screenKey: string
  durationSec: number
  visits: { start: number; end: number }[]
  firstActionSec: number | null
  hesitation: boolean
  backs: number
  deadClicks: number
  rageClicks: number
  awaySec: number
}

export interface Mismatch {
  screenKey: string
  kind: MismatchKind
  start: number
  end: number
  /** Expected level from the card (20/50/80). */
  expected: number
  /** Observed friction level 0..100 (max of the real curve in the screen's windows). */
  felt: number
  /** Ranking weight for picking the 3-4 retro clips. */
  severity: number
  text: string
}

export interface CurvePoint {
  t: number
  level: number
}

export interface ScreenReport {
  baseline: Baseline
  expectedCurve: CurvePoint[]
  realCurve: CurvePoint[]
  screens: ScreenStats[]
  mismatches: Mismatch[]
}
