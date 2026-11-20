// Study-level summary across participants (researcher report, "çalışma bazında"): per screen, how many
// participants reached it, how many had each mismatch kind, the median time and observed axis levels; per task,
// the participants' own expected-vs-experienced difficulty (Albert & Dixon), normalised so any scale compares.
import { mean, median } from './engine'
import { normalizeRating, type RatingScale } from './texts'
import type { AxisScores, HypothesisCard, MismatchKind, ScreenReport } from './types'

const KINDS: MismatchKind[] = ['unexpected-friction', 'effort-mismatch', 'disengagement', 'over-time']

export interface TaskRatings {
  expectation?: number
  seq?: number
}

export interface ParticipantReport {
  participant: string
  report: ScreenReport
  ratings?: TaskRatings
}

export interface ScreenSummary {
  screenKey: string
  screenName: string
  /** Participants who saw this screen. */
  reached: number
  /** Participants with at least one mismatch here. */
  withMismatch: number
  /** Participants per mismatch kind (a participant counts once per kind). */
  byKind: Record<MismatchKind, number>
  medianDurationSec: number | null
  medianObserved: AxisScores | null
}

export interface RatingSummary {
  /** Participants with both ratings. */
  n: number
  /** Means on 0..1 (0 = scale minimum). */
  expectation: number | null
  seq: number | null
  /** Mean of (seq - expectation) per participant, 0..1 units; > 0 = easier than expected (with the default scale direction). */
  gap: number | null
}

export interface TaskSummary {
  participants: number
  screens: ScreenSummary[]
  ratings: RatingSummary
}

export function summarizeTask(cards: HypothesisCard[], reports: ParticipantReport[], scales?: { expectation: RatingScale; seq: RatingScale }): TaskSummary {
  const screens = [...cards]
    .sort((a, b) => a.order - b.order)
    .map((card): ScreenSummary => {
      const byKind = Object.fromEntries(KINDS.map((k) => [k, 0])) as Record<MismatchKind, number>
      const durations: number[] = []
      const effort: number[] = []
      const friction: number[] = []
      let withMismatch = 0
      for (const { report } of reports) {
        const st = report.screens.find((s) => s.screenKey === card.screenKey)
        if (!st) continue
        durations.push(st.durationSec)
        effort.push(st.observed.effort)
        friction.push(st.observed.friction)
        const kinds = new Set(report.mismatches.filter((m) => m.screenKey === card.screenKey).map((m) => m.kind))
        if (kinds.size) withMismatch++
        for (const k of kinds) byKind[k]++
      }
      return {
        screenKey: card.screenKey,
        screenName: card.screenName,
        reached: durations.length,
        withMismatch,
        byKind,
        medianDurationSec: durations.length ? median(durations) : null,
        medianObserved: durations.length ? { effort: median(effort), friction: median(friction) } : null
      }
    })

  const exp: number[] = []
  const seq: number[] = []
  const gaps: number[] = []
  if (scales)
    for (const { ratings } of reports) {
      const e = ratings?.expectation !== undefined ? normalizeRating(ratings.expectation, scales.expectation) : null
      const s = ratings?.seq !== undefined ? normalizeRating(ratings.seq, scales.seq) : null
      if (e !== null) exp.push(e)
      if (s !== null) seq.push(s)
      if (e !== null && s !== null) gaps.push(s - e)
    }
  const r2 = (n: number): number => Math.round(n * 100) / 100
  return {
    participants: reports.length,
    screens,
    ratings: {
      n: gaps.length,
      expectation: exp.length ? r2(mean(exp)) : null,
      seq: seq.length ? r2(mean(seq)) : null,
      gap: gaps.length ? r2(mean(gaps)) : null
    }
  }
}
