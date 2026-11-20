// Question engine (decisions 2026-11-20, "Sorular ekran geçişinde"): replaces end-of-session retro clips.
// - Planned question: the card's `probe`, asked when the participant leaves that screen.
// - Signal-triggered question: an unexpected mismatch, also asked at the screen transition, never mid-screen.
// - At most `perTask` transition questions per task; remaining mismatches go to a short end-of-task retro;
//   at most `perSession` question moments per session. The end-of-task retro is off by default (endOfTask: 0).
// The participant sees no numbers: question wording comes from the text catalog; `mismatch.text` is for the researcher.
// Pure: the app calls these with a report computed on the data so far (computeScreenReport with endSec = now).
import type { HypothesisCard, Mismatch, ScreenReport } from './types'
import { REPLAY_PAD_SEC } from './screens'

export interface QuestionLimits {
  perTask: number
  endOfTask: number
  perSession: number
}
/** End-of-task retro is off by default (decisions 2026-11-20): task end asks only SEQ. A study can turn it on. */
export const DEFAULT_QUESTION_LIMITS: QuestionLimits = { perTask: 2, endOfTask: 0, perSession: 6 }

export interface QuestionMoment {
  screenKey: string
  /** When the question is asked (session clock is paused during the question). */
  askedAt: number
  source: 'planned' | 'signal' | 'end-of-task'
  /** Researcher's planned question text (planned only); otherwise the catalog's neutral question is used. */
  probe?: string
  mismatch?: Mismatch
  /** Frame-replay range shown with the question. */
  replay: [number, number]
}

export interface AskedSoFar {
  /** Transition questions asked in the current task. */
  inTask: QuestionMoment[]
  /** All question moments in the session (all tasks). */
  inSession: QuestionMoment[]
}

const sameMismatch = (a: Mismatch, b: Mismatch): boolean => a.kind === b.kind && a.screenKey === b.screenKey && a.direction === b.direction
const askedAbout = (asked: QuestionMoment[], m: Mismatch): boolean => asked.some((q) => q.mismatch && sameMismatch(q.mismatch, m))
const bySeverity = (a: Mismatch, b: Mismatch): number => b.severity - a.severity || a.at - b.at

/** Called when the participant leaves `card`'s screen at `leftAt`. Returns the question to ask now, or null. */
export function questionAtTransition(opts: {
  card: HypothesisCard
  report: ScreenReport
  leftAt: number
  asked: AskedSoFar
  limits?: QuestionLimits
}): QuestionMoment | null {
  const { card, report, leftAt, asked } = opts
  const limits = opts.limits ?? DEFAULT_QUESTION_LIMITS
  if (asked.inTask.length >= limits.perTask || asked.inSession.length >= limits.perSession) return null
  const lastReplay: [number, number] = [Math.max(0, leftAt - 2 * REPLAY_PAD_SEC), leftAt]
  const plannedDone = asked.inSession.some((q) => q.source === 'planned' && q.screenKey === card.screenKey)
  if (card.probe && !plannedDone) return { screenKey: card.screenKey, askedAt: leftAt, source: 'planned', probe: card.probe, replay: lastReplay }
  const m = report.mismatches
    .filter((x) => x.screenKey === card.screenKey && x.kind !== 'over-time' && !askedAbout(asked.inSession, x))
    .sort(bySeverity)[0]
  return m ? { screenKey: card.screenKey, askedAt: leftAt, source: 'signal', mismatch: m, replay: m.replay } : null
}

/** Short retro after the task: the largest mismatches not asked yet, within the session budget. */
export function endOfTaskQuestions(opts: { report: ScreenReport; endedAt: number; asked: AskedSoFar; limits?: QuestionLimits }): QuestionMoment[] {
  const limits = opts.limits ?? DEFAULT_QUESTION_LIMITS
  const budget = Math.max(0, Math.min(limits.endOfTask, limits.perSession - opts.asked.inSession.length))
  return opts.report.mismatches
    .filter((m) => !askedAbout(opts.asked.inSession, m))
    .sort(bySeverity)
    .slice(0, budget)
    .sort((a, b) => a.at - b.at)
    .map((m) => ({ screenKey: m.screenKey, askedAt: opts.endedAt, source: 'end-of-task' as const, mismatch: m, replay: m.replay }))
}
