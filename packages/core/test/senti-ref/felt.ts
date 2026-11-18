// OWNER: sensing builder. Pure, deterministic felt-curve model. Unit tested with Vitest.
//
// How the felt curve works, in one paragraph. We never claim to read emotions; we read behaviour relative to
// the tester's own baseline. A startle is a second whose peak head speed (face-widths per second) exceeds
// max(1.0, 2 x the baseline 95th percentile); each such second adds an impulse of 70 x strength that decays
// linearly to zero over 4 s (impulses combine by taking the larger one). A voice reaction (talking in at
// least half a second, for a tester who is quiet at baseline) adds 20 while it lasts, and fear plus surprise
// expression confidence above the baseline mean adds up to 10. Seconds with no face are 0 (looking away).
// The result is smoothed with an exponential moving average (alpha 0.3) on the way down only, so a short
// startle keeps its full height instead of being flattened to 30% of it, and clamped to 0..100.
// Freeze is not reported: a tester who sits still in a calm level is not reacting, so it is not robust.
//
// Mismatches compare the designer's intended curve with what the player did, in windows around each beat
// (+/- 5 s) and in 10 s tiles elsewhere, and merge neighbouring windows of the same kind.
import type {
  Beat,
  FeltPoint,
  IntendedPoint,
  Mismatch,
  MismatchKind,
  Moment,
  Report,
  SecondSample,
  Session
} from '../../src/compat/senti-types'
import type { ComputeReport } from '../../src/compat/senti-types'

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))
const mean = (a: number[]): number => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0)
const percentile = (a: number[], p: number): number => {
  if (!a.length) return 0
  const s = [...a].sort((x, y) => x - y)
  return s[Math.floor(p * (s.length - 1))]
}

const MIN_BASELINE_SECONDS = 10
const FALLBACK_PLAY_SECONDS = 20
const STARTLE_FLOOR = 1.0
const DECAY_SEC = 4
const EMA_ALPHA = 0.3
const BEAT_RADIUS = 5
const TILE = 10

export function mmss(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Linear interpolation of the intended curve; flat before the first and after the last point. */
export function intendedAt(points: IntendedPoint[], t: number): number {
  if (!points.length) return 0
  const p = [...points].sort((a, b) => a.t - b.t)
  if (t <= p[0].t) return p[0].level
  if (t >= p[p.length - 1].t) return p[p.length - 1].level
  for (let i = 1; i < p.length; i++) {
    if (t <= p[i].t) {
      const a = p[i - 1]
      const b = p[i]
      return b.t === a.t ? b.level : a.level + ((b.level - a.level) * (t - a.t)) / (b.t - a.t)
    }
  }
  return p[p.length - 1].level
}

/** One sample per whole second; if duplicates exist, keep the one with more landmark packets. */
function bucket(samples: SecondSample[]): Map<number, SecondSample> {
  const m = new Map<number, SecondSample>()
  for (const s of samples) {
    const k = Math.floor(s.t)
    const old = m.get(k)
    if (!old || s.samples > old.samples) m.set(k, s)
  }
  return m
}

interface Run {
  start: number
  end: number // inclusive seconds
}

function runs(flags: boolean[], minLen: number): Run[] {
  const out: Run[] = []
  let i = 0
  while (i < flags.length) {
    if (!flags[i]) {
      i++
      continue
    }
    let j = i
    while (j + 1 < flags.length && flags[j + 1]) j++
    if (j - i + 1 >= minLen) out.push({ start: i, end: j })
    i = j + 1
  }
  return out
}

interface InternalMismatch extends Mismatch {
  at?: number // beat time, for the text
}

function describe(m: InternalMismatch): string {
  const what =
    m.kind === 'missed-peak'
      ? 'you planned a peak, the player barely moved.'
      : m.kind === 'unplanned-spike'
        ? 'you planned calm, the player startled.'
        : 'you planned tension, the player looked away.'
  if (m.beat !== undefined && m.at !== undefined) {
    const label = m.beat.charAt(0).toUpperCase() + m.beat.slice(1)
    return `${label} at ${mmss(m.at)}: ${what}`
  }
  return `${mmss(m.start)} to ${mmss(m.end)}: ${what}`
}

export const computeReport: ComputeReport = (session: Session): Report => {
  const empty: Report = {
    felt: [],
    moments: [],
    mismatches: [],
    baseline: { headSpeedP95: 0, talkingMean: 0, seconds: 0 }
  }
  const play = bucket(session.samples ?? [])
  if (play.size === 0) return empty

  const keys = [...play.keys()]
  const lastT = Math.max(...keys)
  const end = Math.max(lastT + 1, Math.ceil(session.playedSec || 0))

  // ---- Baseline ---------------------------------------------------------------------------------------
  let baseSamples = (session.baseline ?? []).filter((s) => s.face)
  if (baseSamples.length < MIN_BASELINE_SECONDS) {
    baseSamples = [...play.values()].filter((s) => s.t >= 0 && s.t < FALLBACK_PLAY_SECONDS && s.face)
  }
  const bSpeeds = baseSamples.map((s) => s.headSpeedMax).filter((v): v is number => v !== null)
  const bTalk = baseSamples.map((s) => s.talking).filter((v): v is number => v !== null)
  const bFS = baseSamples.map((s) => (s.fear ?? 0) + (s.surprise ?? 0))
  const headSpeedP95 = percentile(bSpeeds, 0.95)
  const talkingMean = mean(bTalk)
  const baseFS = mean(bFS)
  const baseline = { headSpeedP95, talkingMean, seconds: baseSamples.length }

  const thr = Math.max(STARTLE_FLOOR, 2 * headSpeedP95)

  // ---- Per-second flags -------------------------------------------------------------------------------
  const face: boolean[] = []
  const hasData: boolean[] = []
  const startleStrength: number[] = []
  const talk: boolean[] = []
  const looked: boolean[] = []
  for (let t = 0; t < end; t++) {
    const s = play.get(t)
    hasData.push(!!s)
    const f = !!s && s.face
    face.push(f)
    looked.push(!!s && !s.face)
    startleStrength.push(f && s!.headSpeedMax !== null && s!.headSpeedMax > thr ? clamp((s!.headSpeedMax - thr) / (4 * thr), 0, 1) : 0)
    talk.push(f && talkingMean < 0.3 && (s!.talking ?? 0) >= 0.5)
  }

  // ---- Moments ----------------------------------------------------------------------------------------
  const moments: Moment[] = []
  for (const r of runs(startleStrength.map((v) => v > 0), 1)) {
    let strength = 0
    for (let t = r.start; t <= r.end; t++) {
      strength = Math.max(strength, startleStrength[t])
    }
    moments.push({ t: r.start, kind: 'startle', strength, durationSec: r.end - r.start + 1 })
  }
  for (const r of runs(talk, 1)) {
    const vals: number[] = []
    for (let t = r.start; t <= r.end; t++) vals.push(play.get(t)!.talking ?? 0)
    moments.push({ t: r.start, kind: 'voice', strength: clamp(mean(vals), 0, 1), durationSec: r.end - r.start + 1 })
  }
  const lookRuns = runs(looked, 2)
  for (const r of lookRuns) moments.push({ t: r.start, kind: 'lookaway', strength: 1, durationSec: r.end - r.start + 1 })
  moments.sort((a, b) => a.t - b.t || a.kind.localeCompare(b.kind))

  // ---- Felt curve -------------------------------------------------------------------------------------
  const felt: FeltPoint[] = []
  let ema = 0
  for (let t = 0; t < end; t++) {
    let raw = 0
    if (face[t]) {
      for (let k = 0; k < DECAY_SEC; k++) {
        const st = startleStrength[t - k] ?? 0
        raw = Math.max(raw, 70 * st * (1 - k / DECAY_SEC))
      }
      if (talk[t]) raw += 20
      const s = play.get(t)!
      raw += 10 * clamp(((s.fear ?? 0) + (s.surprise ?? 0) - baseFS) / 50, 0, 1)
      raw = clamp(raw, 0, 100)
      ema = raw >= ema ? raw : ema + EMA_ALPHA * (raw - ema)
    } else if (looked[t]) {
      ema = 0
      raw = 0
    } else {
      ema = ema + EMA_ALPHA * (0 - ema) // no data: let the level decay
    }
    felt.push({ t, level: Math.round(clamp(ema, 0, 100) * 10) / 10 })
  }

  // ---- Mismatches -------------------------------------------------------------------------------------
  const windows: { start: number; end: number; beat?: Beat }[] = []
  const covered: Run[] = []
  for (const b of [...(session.beats ?? [])].sort((x, y) => x.t - y.t)) {
    const w = { start: Math.max(0, Math.floor(b.t - BEAT_RADIUS)), end: Math.min(end - 1, Math.ceil(b.t + BEAT_RADIUS)), beat: b }
    if (w.start <= w.end) {
      windows.push(w)
      covered.push({ start: w.start, end: w.end })
    }
  }
  for (let s = 0; s < end; s += TILE) {
    const e = Math.min(end - 1, s + TILE - 1)
    if (!covered.some((c) => s <= c.end && e >= c.start)) windows.push({ start: s, end: e })
  }
  windows.sort((a, b) => a.start - b.start)

  const found: InternalMismatch[] = []
  if (session.intended?.length) {
    for (const w of windows) {
      let iMax = 0
      let fMax = 0
      let withData = 0
      for (let t = w.start; t <= w.end; t++) {
        iMax = Math.max(iMax, intendedAt(session.intended, t))
        fMax = Math.max(fMax, felt[t]?.level ?? 0)
        if (hasData[t]) withData++
      }
      const len = w.end - w.start + 1
      if (withData < len / 2) continue // not enough camera data to judge
      const startles = moments.filter((m) => m.kind === 'startle' && m.t <= w.end && m.t + m.durationSec - 1 >= w.start)
      const lookedAway = lookRuns.some((r) => r.start <= w.end && r.end >= w.start)
      const base = { start: w.start, end: w.end + 1, beat: w.beat?.label, at: w.beat?.t, intended: Math.round(iMax), felt: Math.round(fMax) }
      const add = (kind: MismatchKind): void => {
        const m: InternalMismatch = { ...base, kind, text: '' }
        if (m.beat === undefined) delete m.beat
        if (m.at === undefined) delete m.at
        found.push(m)
      }
      if (iMax >= 50 && lookedAway) add('looked-away')
      else if (iMax >= 65 && fMax < 25 && startles.length === 0) add('missed-peak')
      // Unplanned spike: the whole window is calm in the plan (max <= 35).
      if (iMax <= 35 && (startles.some((m) => m.strength >= 0.3) || fMax >= 60)) add('unplanned-spike')
    }
  }

  // Merge overlapping or touching mismatches of the same kind (beat windows that overlap tiles included).
  found.sort((a, b) => a.start - b.start)
  const merged: InternalMismatch[] = []
  for (const m of found) {
    const prev = [...merged].reverse().find((x) => x.kind === m.kind)
    if (prev && m.start <= prev.end) {
      prev.end = Math.max(prev.end, m.end)
      prev.intended = Math.max(prev.intended, m.intended)
      prev.felt = Math.max(prev.felt, m.felt)
      if (prev.beat === undefined && m.beat !== undefined) {
        prev.beat = m.beat
        prev.at = m.at
      }
    } else merged.push({ ...m })
  }
  const mismatches: Mismatch[] = merged.map((m) => {
    const text = describe(m)
    const { at, ...rest } = m
    void at
    return { ...rest, text }
  })

  return { felt, moments, mismatches, baseline }
}
