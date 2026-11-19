// Study-level summary across participants (researcher report, "çalışma bazında"): per screen, how many
// participants reached it, how many had each mismatch kind, and the median time spent.
import { median } from './engine'
import type { HypothesisCard, MismatchKind, ScreenReport } from './types'

const KINDS: MismatchKind[] = ['unexpected-friction', 'missed-decision', 'disengagement', 'over-time']

export interface ParticipantReport {
  participant: string
  report: ScreenReport
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
}

export interface StudySummary {
  participants: number
  screens: ScreenSummary[]
}

export function summarizeStudy(cards: HypothesisCard[], reports: ParticipantReport[]): StudySummary {
  const screens = [...cards]
    .sort((a, b) => a.order - b.order)
    .map((card): ScreenSummary => {
      const byKind = Object.fromEntries(KINDS.map((k) => [k, 0])) as Record<MismatchKind, number>
      const durations: number[] = []
      let withMismatch = 0
      for (const { report } of reports) {
        const st = report.screens.find((s) => s.screenKey === card.screenKey)
        if (!st) continue
        durations.push(st.durationSec)
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
        medianDurationSec: durations.length ? median(durations) : null
      }
    })
  return { participants: reports.length, screens }
}
