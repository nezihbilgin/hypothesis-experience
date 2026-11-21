// Researcher report data helpers (pure, unit-tested): session files -> rows for tables, CSV and the click map.
import { computeScreenReport, taskOutcome, type Baseline, type HypothesisCard, type InteractionEvent, type Mismatch, type ScreenReport, type ScreenStats, type SecondSample, type SessionHealth, type Study, type TaskOutcome } from '@hx/core'

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

// ---- Readable report text (report layer only; core numbers unchanged) ---------------------------------------

const BEHAVIOR_HYPOTHESIS: Record<HypothesisCard['behavior'], string> = {
  flow: 'akış ekranı (takılmadan geçmesi beklendi)',
  read: 'okuma ekranı (dikkatle okuması beklendi)',
  decide: 'karar ekranı (seçenekleri tartması beklendi)'
}
const times = (k: number): string => (k === 1 ? 'bir kez' : `${k} kez`)
const sec = (v: number): string => `${Math.round(v)} sn`

/** Two-line mismatch text: what the researcher hypothesised, what was observed. Behaviour only (Principle 1). */
export function mismatchLines(m: Mismatch, card: HypothesisCard | undefined, st: ScreenStats | undefined): { hypothesis: string; observation: string } {
  const hyp = card ? BEHAVIOR_HYPOTHESIS[card.behavior] : 'ekran'
  if (m.kind === 'over-time') {
    const max = card?.expectedSec[1]
    return { hypothesis: `${hyp}, en fazla ${max !== undefined ? sec(max) : '?'}`, observation: `${sec(st?.timedSec ?? st?.durationSec ?? 0)} sürdü` }
  }
  if (m.kind === 'disengagement') return { hypothesis: hyp, observation: `${sec(st?.awaySec ?? 0)} ekrandan uzaklaştı` }
  if (m.kind === 'effort-mismatch') {
    if (m.direction === 'high') return { hypothesis: hyp, observation: `ilk tıklamadan önce ${sec(st?.firstActionSec ?? 0)} durdu` }
    return { hypothesis: hyp, observation: `${sec(st?.durationSec ?? 0)}'de geçti` }
  }
  const parts: string[] = []
  if (st?.offPath) parts.push('beklenen yolun dışındaki bu ekrana geldi')
  if (st?.backs) parts.push(`${times(st.backs)} geri döndü`)
  if (st?.deadClicks) parts.push(`${times(st.deadClicks)} tepkisiz bir yere tıkladı`)
  if (st?.rageClicks) parts.push(`${times(st.rageClicks)} aynı yere art arda tıkladı`)
  if (st?.loops) parts.push(`${times(st.loops)} bir önceki ekranla arasında gidip geldi`)
  return { hypothesis: hyp, observation: parts.join(', ') || 'takıldı' }
}

export interface Highlight {
  kind: 'mismatch' | 'dropped' | 'rage' | 'loop' | 'keyboard'
  screenKey: string
  title: string
  hypothesis?: string
  observation: string
  /** Answer the participant gave about this screen, if any. */
  answer?: string
}

/** "Öne çıkan anlar": the 3 heaviest mismatches, the drop-off screen, rage clicks and loops, with answers. */
export function highlights(task: SessionTask, cards: HypothesisCard[]): Highlight[] {
  const r = task.report
  if (!r) return []
  const name = (k: string): string => cards.find((c) => c.screenKey === k)?.participantName ?? cards.find((c) => c.screenKey === k)?.screenName ?? k
  const answerFor = (k: string): string | undefined => {
    const q = task.questions.find((x) => x.moment.screenKey === k)
    return q ? (q.answer ?? (q.dontRemember ? '(hatırlamıyorum)' : '(geçti)')) : undefined
  }
  const st = (k: string) => r.screens.find((s) => s.screenKey === k)
  const out: Highlight[] = []
  const seen = new Set<string>()
  for (const m of [...r.mismatches].sort((a, b) => b.severity - a.severity).slice(0, 3)) {
    const l = mismatchLines(m, cards.find((c) => c.screenKey === m.screenKey), st(m.screenKey))
    out.push({ kind: 'mismatch', screenKey: m.screenKey, title: name(m.screenKey), ...l, answer: answerFor(m.screenKey) })
    seen.add(`${m.screenKey}|${m.kind}`)
  }
  if (task.outcome?.result === 'dropped' && task.outcome.lastScreen)
    out.push({ kind: 'dropped', screenKey: task.outcome.lastScreen, title: name(task.outcome.lastScreen), observation: 'görevi bu ekranda yarıda bıraktı', answer: answerFor(task.outcome.lastScreen) })
  for (const s of r.screens) {
    if (s.rageClicks && !seen.has(`${s.screenKey}|unexpected-friction`))
      out.push({ kind: 'rage', screenKey: s.screenKey, title: name(s.screenKey), observation: `${times(s.rageClicks)} aynı yere art arda tıkladı`, answer: answerFor(s.screenKey) })
    if (s.loops && !seen.has(`${s.screenKey}|unexpected-friction`))
      out.push({ kind: 'loop', screenKey: s.screenKey, title: name(s.screenKey), observation: `${times(s.loops)} bir önceki ekranla arasında gidip geldi`, answer: answerFor(s.screenKey) })
    if (s.clicklessArrivals)
      out.push({ kind: 'keyboard', screenKey: s.screenKey, title: name(s.screenKey), observation: `${times(s.clicklessArrivals)} tıklamasız geçişle bu ekrana ya da durumuna geldi (muhtemelen klavye)` })
  }
  return out
}

/** Click counts for the legend under a click map. */
export function clickLegend(points: ClickPoint[], size: { w: number; h: number } | undefined, node: string): { working: number; dead: number; outside: number; drawable: ClickPoint[] } {
  const inFrame = (p: ClickPoint): boolean => !p.frameId || p.frameId === node
  const fits = (p: ClickPoint): boolean => !size || (p.x >= 0 && p.y >= 0 && p.x <= size.w && p.y <= size.h)
  const drawable = points.filter((p) => inFrame(p) && fits(p))
  return { working: drawable.filter((p) => !p.dead).length, dead: drawable.filter((p) => p.dead).length, outside: points.length - drawable.length, drawable }
}
