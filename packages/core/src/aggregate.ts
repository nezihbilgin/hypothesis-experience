// Study-level summary across participants (researcher report, "çalışma bazında"): per screen, how many
// participants reached it, how many had each mismatch kind, the median time and observed axis levels; per task,
// the participants' own expected-vs-experienced difficulty (Albert & Dixon), normalised so any scale compares.
import { mean, median } from './engine'
import { normalizeRating, type RatingScale } from './texts'
import type { TaskOutcome, TaskResult } from './outcome'
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
  outcome?: TaskOutcome
  /** Task seconds (Done or last seen). */
  taskSec?: number | null
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
  /** Rage clicks summed over participants. */
  rageClicks: number
  /** Unresponsive clicks / all clicks, over all participants (null without clicks). */
  misclickRate: number | null
  /** Participants who looped (A→B→A→B) with this screen as B. */
  loops: number
  /** Participants who were off the expected path here. */
  offPath: number
  /** Participants whose task was dropped while on this screen (drop-off funnel). */
  droppedHere: number
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
  /** Participants per task result (only those with an outcome). */
  results: Record<TaskResult, number>
  medianTaskSec: number | null
  medianOrientationSec: number | null
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
      let rageClicks = 0
      let clicks = 0
      let deads = 0
      let loops = 0
      let offPath = 0
      const droppedHere = reports.filter((p) => p.outcome?.result === 'dropped' && p.outcome.lastScreen === card.screenKey).length
      for (const { report } of reports) {
        const st = report.screens.find((s) => s.screenKey === card.screenKey)
        if (!st) continue
        rageClicks += st.rageClicks
        clicks += st.clicks ?? 0
        deads += st.deadClicks
        if (st.loops) loops++
        if (st.offPath) offPath++
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
        medianObserved: durations.length ? { effort: median(effort), friction: median(friction) } : null,
        rageClicks,
        misclickRate: clicks ? Math.round((deads / clicks) * 100) / 100 : null,
        loops,
        offPath,
        droppedHere
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
  const results: Record<TaskResult, number> = { direct: 0, indirect: 0, failed: 0, dropped: 0 }
  for (const p of reports) if (p.outcome?.result) results[p.outcome.result]++
  const taskSecs = reports.map((p) => p.taskSec).filter((v): v is number => typeof v === 'number')
  const orient = reports.map((p) => p.report.orientationSec).filter((v): v is number => typeof v === 'number')
  return {
    participants: reports.length,
    screens,
    results,
    medianTaskSec: taskSecs.length ? median(taskSecs) : null,
    medianOrientationSec: orient.length ? median(orient) : null,
    ratings: {
      n: gaps.length,
      expectation: exp.length ? r2(mean(exp)) : null,
      seq: seq.length ? r2(mean(seq)) : null,
      gap: gaps.length ? r2(mean(gaps)) : null
    }
  }
}
