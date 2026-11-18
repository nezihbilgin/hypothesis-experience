// Senti-compat model: Senti's time-window felt curve rebuilt on @hx/core's engine.
// Exists only as a regression harness: it must reproduce Senti's computeReport bit-for-bit on docs/evidence,
// which proves the engine helpers (baseline, runs, impulse curve, merge, describe flow) were ported faithfully.
// The product model (screen windows, hypothesis cards) is in ../screens.ts.
import { bucket, clamp, impulseCurve, mean, mergeSameKind, mmss, percentile, personalThreshold, runs, type Run } from '../engine'
import type { Beat, Mismatch, MismatchKind, Moment, Report, Session } from './senti-types'
import { intendedAt } from './intended'

export { intendedAt }

const MIN_BASELINE_SECONDS = 10
const FALLBACK_PLAY_SECONDS = 20
const STARTLE_FLOOR = 1.0
const DECAY_SEC = 4
const EMA_ALPHA = 0.3
const BEAT_RADIUS = 5
const TILE = 10

interface Internal extends Mismatch {
  at?: number
}

function describe(m: Internal): string {
  const what =
    m.kind === 'missed-peak'
      ? 'you planned a peak, the player barely moved.'
      : m.kind === 'unplanned-spike'
        ? 'you planned calm, the player startled.'
        : 'you planned tension, the player looked away.'
  if (m.beat !== undefined && m.at !== undefined) return `${m.beat.charAt(0).toUpperCase() + m.beat.slice(1)} at ${mmss(m.at)}: ${what}`
  return `${mmss(m.start)} to ${mmss(m.end)}: ${what}`
}

export function computeSentiReport(session: Session): Report {
  const empty: Report = { felt: [], moments: [], mismatches: [], baseline: { headSpeedP95: 0, talkingMean: 0, seconds: 0 } }
  const play = bucket(session.samples ?? [])
  if (play.size === 0) return empty
  const end = Math.max(Math.max(...play.keys()) + 1, Math.ceil(session.playedSec || 0))

  let base = (session.baseline ?? []).filter((s) => s.face)
  if (base.length < MIN_BASELINE_SECONDS) base = [...play.values()].filter((s) => s.t >= 0 && s.t < FALLBACK_PLAY_SECONDS && s.face)
  const headSpeedP95 = percentile(base.map((s) => s.headSpeedMax).filter((v): v is number => v !== null), 0.95)
  const talkingMean = mean(base.map((s) => s.talking).filter((v): v is number => v !== null))
  const baseFS = mean(base.map((s) => (s.fear ?? 0) + (s.surprise ?? 0)))
  const thr = personalThreshold(STARTLE_FLOOR, headSpeedP95)

  const face: boolean[] = []
  const hasData: boolean[] = []
  const strength: number[] = []
  const talk: boolean[] = []
  const looked: boolean[] = []
  for (let t = 0; t < end; t++) {
    const s = play.get(t)
    const f = !!s && s.face
    hasData.push(!!s)
    face.push(f)
    looked.push(!!s && !s.face)
    strength.push(f && s!.headSpeedMax !== null && s!.headSpeedMax > thr ? clamp((s!.headSpeedMax - thr) / (4 * thr), 0, 1) : 0)
    talk.push(f && talkingMean < 0.3 && (s!.talking ?? 0) >= 0.5)
  }

  const moments: Moment[] = []
  for (const r of runs(strength.map((v) => v > 0), 1)) {
    let st = 0
    for (let t = r.start; t <= r.end; t++) st = Math.max(st, strength[t])
    moments.push({ t: r.start, kind: 'startle', strength: st, durationSec: r.end - r.start + 1 })
  }
  for (const r of runs(talk, 1)) {
    const vals: number[] = []
    for (let t = r.start; t <= r.end; t++) vals.push(play.get(t)!.talking ?? 0)
    moments.push({ t: r.start, kind: 'voice', strength: clamp(mean(vals), 0, 1), durationSec: r.end - r.start + 1 })
  }
  const lookRuns = runs(looked, 2)
  for (const r of lookRuns) moments.push({ t: r.start, kind: 'lookaway', strength: 1, durationSec: r.end - r.start + 1 })
  moments.sort((a, b) => a.t - b.t || a.kind.localeCompare(b.kind))

  const levels = impulseCurve({
    len: end,
    impulse: strength,
    peak: 70,
    decaySec: DECAY_SEC,
    alpha: EMA_ALPHA,
    state: (t) => (face[t] ? 'data' : looked[t] ? 'away' : 'none'),
    add: (t) => {
      const s = play.get(t)!
      return (talk[t] ? 20 : 0) + 10 * clamp(((s.fear ?? 0) + (s.surprise ?? 0) - baseFS) / 50, 0, 1)
    }
  })
  const felt = levels.map((level, t) => ({ t, level }))

  // Windows: beats +/- 5 s, 10 s tiles elsewhere.
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

  const found: Internal[] = []
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
      if (withData < (w.end - w.start + 1) / 2) continue
      const startles = moments.filter((m) => m.kind === 'startle' && m.t <= w.end && m.t + m.durationSec - 1 >= w.start)
      const lookedAway = lookRuns.some((r) => r.start <= w.end && r.end >= w.start)
      const add = (kind: MismatchKind): void => {
        const m: Internal = { start: w.start, end: w.end + 1, kind, intended: Math.round(iMax), felt: Math.round(fMax), text: '' }
        if (w.beat) {
          m.beat = w.beat.label
          m.at = w.beat.t
        }
        found.push(m)
      }
      if (iMax >= 50 && lookedAway) add('looked-away')
      else if (iMax >= 65 && fMax < 25 && startles.length === 0) add('missed-peak')
      if (iMax <= 35 && (startles.some((m) => m.strength >= 0.3) || fMax >= 60)) add('unplanned-spike')
    }
  }

  const merged = mergeSameKind(found, (m) => m.kind, (prev, m) => {
    prev.intended = Math.max(prev.intended, m.intended)
    prev.felt = Math.max(prev.felt, m.felt)
    if (prev.beat === undefined && m.beat !== undefined) {
      prev.beat = m.beat
      prev.at = m.at
    }
  })
  const mismatches: Mismatch[] = merged.map((m) => {
    const text = describe(m)
    const { at: _at, ...rest } = m
    return { ...rest, text }
  })
  return { felt, moments, mismatches, baseline: { headSpeedP95, talkingMean, seconds: base.length } }
}
