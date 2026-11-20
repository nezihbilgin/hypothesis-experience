// Researcher report data helpers (pure, unit-tested): session files -> rows for tables, CSV and the click map.
import { computeScreenReport, taskOutcome, type Baseline, type HypothesisCard, type InteractionEvent, type ScreenReport, type SecondSample, type SessionHealth, type Study, type TaskOutcome } from '@hx/core'

export interface SessionTask {
  id: string
  prompt: string
  expectation: number | null
  seq: number | null
  events: InteractionEvent[]
  samples?: SecondSample[]
  endSec: number | null
  report: ScreenReport | null
  outcome?: TaskOutcome
  questions: { moment: { screenKey: string; source: string; probe?: string; mismatch?: { kind: string; text: string } }; answer: string | null; dontRemember: boolean; skipped: boolean }[]
}

export interface SessionFile {
  schema: string
  participant: string
  startedAt: string
  health?: SessionHealth
  baseline?: Baseline
  capabilities?: { hasCamera: boolean; hasHover: boolean; hasScreenVideo: boolean }
  consent?: { faceSignals: boolean }
  tasks: (SessionTask | null)[]
  hardestTask?: { answer: string | null; dontRemember: boolean; skipped: boolean } | null
}

export function parseSessionFile(text: string): SessionFile {
  const j = JSON.parse(text) as SessionFile
  if (j?.schema !== 'hx-session/1' || !Array.isArray(j.tasks)) throw new Error('Bu bir oturum dosyası değil (hx-session/1).')
  return j
}

/**
 * Recomputes each task's report and outcome with the current model and the current study file (cards, aliases,
 * expected path), so older session files read the same way as new ones. The stored report is kept when the task
 * is not in the study or has no events.
 */
export function recompute(s: SessionFile, study: Study | null, cardsOf: (taskId: string) => HypothesisCard[]): SessionFile {
  if (!study || !s.baseline) return s
  return {
    ...s,
    tasks: s.tasks.map((t) => {
      const st = t && study.tasks.find((x) => x.id === t.id)
      if (!t || !st || !t.events?.length) return t
      const cards = cardsOf(t.id)
      const endSec = t.endSec ?? t.events[t.events.length - 1].t
      const report = computeScreenReport({
        cards,
        events: t.events,
        samples: t.samples ?? [],
        baseline: s.baseline!,
        endSec,
        cameraEnabled: !!s.capabilities?.hasCamera,
        faceSignals: !!s.consent?.faceSignals && study.faceSignals,
        ...(s.capabilities ? { capabilities: s.capabilities } : {})
      })
      const outcome = taskOutcome({ cards, events: t.events, ...(st.targetScreen ? { targetScreen: st.targetScreen } : {}), finished: t.endSec !== null, endSec: t.endSec })
      return { ...t, report, outcome }
    })
  }
}

export interface ClickPoint {
  /** Node shown when clicking (state variant) or the logical screen key. */
  node: string
  x: number
  y: number
  dead: boolean
  /** Position is relative to this frame; drawable on a node image only when it equals the node. */
  frameId?: string
}

/** Clicks per logical screen with frame coordinates; clicks without a position are counted separately. */
export function clicksByScreen(events: InteractionEvent[]): Map<string, { points: ClickPoint[]; noPosition: number }> {
  const m = new Map<string, { points: ClickPoint[]; noPosition: number }>()
  for (const e of events) {
    if (e.type !== 'click') continue
    const g = m.get(e.screenKey) ?? { points: [], noPosition: 0 }
    const p = e.payload ?? {}
    if (typeof p.x === 'number' && typeof p.y === 'number')
      g.points.push({ node: typeof p.node === 'string' ? p.node : e.screenKey, x: p.x, y: p.y, dead: p.handled === false, ...(typeof p.frameId === 'string' ? { frameId: p.frameId } : {}) })
    else g.noPosition++
    m.set(e.screenKey, g)
  }
  return m
}

const csvCell = (v: unknown): string => {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** One row per participant × task × screen, plus task-level columns repeated (for spreadsheets). */
export function metricsCsv(sessions: SessionFile[], names: (taskId: string) => HypothesisCard[]): string {
  const head = ['participant', 'task', 'result', 'task_sec', 'orientation_sec', 'expectation', 'seq', 'screen', 'screen_name', 'off_path', 'duration_sec', 'effort', 'friction', 'first_action_sec', 'backs', 'loops', 'clicks', 'dead_clicks', 'misclick_rate', 'rage_clicks', 'away_sec', 'mismatches']
  const rows = [head.join(',')]
  for (const s of sessions)
    for (const t of s.tasks) {
      if (!t?.report) continue
      const cards = names(t.id)
      for (const st of t.report.screens) {
        const card = cards.find((c) => c.screenKey === st.screenKey)
        const mm = t.report.mismatches.filter((m) => m.screenKey === st.screenKey).map((m) => m.kind).join(' ')
        rows.push(
          [s.participant || s.startedAt, t.id, t.outcome?.result ?? '', t.endSec, t.report.orientationSec, t.expectation, t.seq, st.screenKey, card?.screenName ?? '', st.offPath ? 1 : 0, st.durationSec, st.observed.effort, st.observed.friction, st.firstActionSec, st.backs, st.loops ?? 0, st.clicks ?? '', st.deadClicks, st.misclickRate ?? '', st.rageClicks, st.awaySec, mm]
            .map(csvCell)
            .join(',')
        )
      }
    }
  return rows.join('\n') + '\n'
}
