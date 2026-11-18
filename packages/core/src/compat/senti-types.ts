// Shared contract between main (sensing, storage) and renderer (UI). Owned by the director.
// Change only with a written reason in the commit message.

/** One point of the designer's intended tension curve. t = seconds from play start, level 0..100. */
export interface IntendedPoint {
  t: number
  level: number
}

/** A named moment in the level the designer planned (e.g. "jump scare"), seconds from play start. */
export interface Beat {
  t: number
  label: string
}

/** A marker the playtest operator dropped with the hotkey during play, seconds from play start. */
export interface Marker {
  t: number
}

/**
 * Behaviour features for one second of camera data, produced by main-process sensing.
 * t = seconds from play start (negative during baseline). Null = no data that second.
 */
export interface SecondSample {
  t: number
  /** Face tracked for most of this second. */
  face: boolean
  /** Peak face-centre speed this second, in face-widths per second (startle signal). */
  headSpeedMax: number | null
  /** Median face-centre speed this second (stillness / freeze signal). */
  headSpeedMedian: number | null
  /** Fraction of this second the SDK detected talking, 0..1. */
  talking: number | null
  /** Mean SDK expression confidence this second, 0..100. */
  fear: number | null
  surprise: number | null
  neutral: number | null
  /** Landmark samples received this second (frame-rate proxy). */
  samples: number
}

export type SensingPhase = 'idle' | 'check' | 'baseline' | 'play'

export type SensingState = 'off' | 'starting' | 'running' | 'recovering' | 'busy' | 'error'

/** Pushed from main to renderer about once per second while sensing is on. */
export interface SensingStatus {
  state: SensingState
  /** Plain-language guidance from the SDK validation, e.g. "Increase light on face." Empty when OK. */
  hint: string
  /** True when the SDK reported OK validation for the last 3 seconds. */
  ready: boolean
  restarts: number
  /** Human-readable problem when state is 'busy' or 'error'. */
  message?: string
}

export interface SensingEvent {
  status: SensingStatus
  /** The latest completed second, if any. */
  sample?: SecondSample
}

/** Downscaled camera frame for the camera-check preview (only sent in phase 'check'). RGBA bytes. */
export interface PreviewFrame {
  width: number
  height: number
  rgba: Uint8Array
}

export interface Session {
  id: string
  name: string
  createdAt: string
  /** Planned play length the intended curve covers, seconds. */
  plannedSec: number
  intended: IntendedPoint[]
  beats: Beat[]
  markers: Marker[]
  baseline: SecondSample[]
  samples: SecondSample[]
  /** Epoch ms when gameplay recording started. Sample t is relative to this. */
  playStartedAtMs: number
  /** Actual play length, seconds. */
  playedSec: number
  recording: { file: string; bytes: number } | null
  sensing: { restarts: number; signals: string[] }
  consent: { acceptedAt: string }
}

/** Felt curve point, t seconds from play start, level 0..100. */
export interface FeltPoint {
  t: number
  level: number
}

export type MomentKind = 'startle' | 'voice' | 'lookaway' | 'freeze'

/** A specific behaviour the camera saw. strength is 0..1. */
export interface Moment {
  t: number
  kind: MomentKind
  strength: number
  durationSec: number
}

export type MismatchKind = 'missed-peak' | 'unplanned-spike' | 'looked-away'

/** A stretch where what the designer intended and what the player did disagree. */
export interface Mismatch {
  start: number
  end: number
  kind: MismatchKind
  /** Nearest beat label, if any. */
  beat?: string
  intended: number
  felt: number
  /** One plain sentence for the report, e.g. "Jump scare at 2:10: you planned a peak, the player barely moved." */
  text: string
}

export interface Report {
  felt: FeltPoint[]
  moments: Moment[]
  mismatches: Mismatch[]
  /** Baseline stats the felt curve is relative to. */
  baseline: { headSpeedP95: number; talkingMean: number; seconds: number }
}

/** Implemented in src/shared/felt.ts. Pure and deterministic. */
export type ComputeReport = (session: Session) => Report
