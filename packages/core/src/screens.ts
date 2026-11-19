// Screen-window model: the product port of Senti's felt.ts.
// Senti compared an intended curve with felt tension in time windows. Here each *screen* is a window, the
// expectation comes from a hypothesis card, and interaction signals are primary (camera/mic secondary).
// Principle 1: sentences describe observed behaviour only, never emotion or intent.
// Principle 2: thresholds come from the participant's own warm-up distribution.
import { bucket, clamp, impulseCurve, mean, median, mergeSameKind, percentile, personalThreshold, runs } from './engine'
import {
  BEHAVIOR_LEVEL,
  type Baseline,
  type CurvePoint,
  type HypothesisCard,
  type InteractionEvent,
  type Mismatch,
  type MismatchKind,
  type ScreenReport,
  type ScreenStats,
  type SecondSample
} from './types'

export const HESITATION_FLOOR_SEC = 3
export const STARTLE_FLOOR = 1.0
export const AWAY_MIN_SEC = 2
/** Seconds with fewer processed frames than this carry no camera data (Faz 0: old GPUs dip to 5-7 fps). */
export const MIN_SAMPLES = 5
const DECAY_SEC = 4
const EMA_ALPHA = 0.3
const MEANINGFUL: InteractionEvent['type'][] = ['click', 'dead-click', 'rage-click', 'input-edit', 'input-delete']

// ---- Baseline ----------------------------------------------------------------------------------------
/** Keep one sample per second and drop seconds below MIN_SAMPLES: they are "no data", not "away". */
export function usableSeconds(samples: SecondSample[]): Map<number, SecondSample> {
  const m = bucket(samples)
  for (const [k, s] of m) if (s.samples < MIN_SAMPLES) m.delete(k)
  return m
}

export function computeBaseline(warmupSamples: SecondSample[], warmupEvents: InteractionEvent[]): Baseline {
  const faced = [...usableSeconds(warmupSamples).values()].filter((s) => s.face)
  return {
    headSpeedP95: percentile(faced.map((s) => s.headSpeedMax).filter((v): v is number => v !== null), 0.95),
    talkingMean: mean(faced.map((s) => s.talking).filter((v): v is number => v !== null)),
    faceWidthMedian: median(faced.map((s) => s.faceWidthRatio).filter((v): v is number => v != null)),
    firstActionP95: percentile(firstActionLatencies(warmupEvents), 0.95),
    seconds: faced.length
  }
}

/** For each screen shown, seconds until the first meaningful action on it. */
export function firstActionLatencies(events: InteractionEvent[]): number[] {
  const ev = [...events].sort((a, b) => a.t - b.t)
  const out: number[] = []
  let shownAt: number | null = null
  for (const e of ev) {
    if (e.type === 'screen') shownAt = e.t
    else if (shownAt !== null && MEANINGFUL.includes(e.type)) {
      out.push(e.t - shownAt)
      shownAt = null
    }
  }
  return out
}

// ---- Visits -------------------------------------------------------------------------------------------
export interface Visit {
  screenKey: string
  start: number
  end: number
}

export function visitsFrom(events: InteractionEvent[], endSec: number): Visit[] {
  const screens = events.filter((e) => e.type === 'screen').sort((a, b) => a.t - b.t)
  return screens.map((e, i) => ({ screenKey: e.screenKey, start: e.t, end: i + 1 < screens.length ? screens[i + 1].t : endSec }))
}

// ---- Report -------------------------------------------------------------------------------------------
export interface ScreenSessionInput {
  cards: HypothesisCard[]
  events: InteractionEvent[]
  samples: SecondSample[]
  baseline: Baseline
  endSec: number
  cameraEnabled: boolean
}

export function computeScreenReport(input: ScreenSessionInput): ScreenReport {
  const { cards, baseline, cameraEnabled } = input
  const events = [...input.events].sort((a, b) => a.t - b.t)
  const end = Math.max(1, Math.ceil(input.endSec))
  const visits = visitsFrom(events, input.endSec)
  const order = new Map(cards.map((c) => [c.screenKey, c.order]))
  const play = usableSeconds(cameraEnabled ? input.samples : [])
  const hesThr = personalThreshold(HESITATION_FLOOR_SEC, baseline.firstActionP95)
  const headThr = personalThreshold(STARTLE_FLOOR, baseline.headSpeedP95)

  // Per-second signals
  const away = new Array<boolean>(end).fill(false)
  for (let t = 0; t < end; t++) {
    const s = play.get(t)
    if (s && !s.face) away[t] = true
  }
  let hiddenAt: number | null = null
  for (const e of events.filter((x) => x.type === 'visibility')) {
    if (e.payload?.hidden) hiddenAt = e.t
    else if (hiddenAt !== null) {
      for (let t = Math.floor(hiddenAt); t < Math.min(end, Math.ceil(e.t)); t++) away[t] = true
      hiddenAt = null
    }
  }
  const awayRuns = runs(away, AWAY_MIN_SEC)

  const impulse = new Array<number>(end).fill(0)
  const bump = (t: number, v: number): void => {
    const k = Math.floor(t)
    if (k >= 0 && k < end) impulse[k] = Math.max(impulse[k], v)
  }
  for (const e of events) {
    if (e.type === 'dead-click') bump(e.t, 0.6)
    if (e.type === 'rage-click') bump(e.t, 1)
  }
  const stats: ScreenStats[] = []
  for (const card of cards) {
    const vs = visits.filter((v) => v.screenKey === card.screenKey)
    if (!vs.length) continue
    const inV = (t: number): boolean => vs.some((v) => t >= v.start && t < v.end)
    const evs = events.filter((e) => e.screenKey === card.screenKey && inV(e.t))
    const first = evs.find((e) => MEANINGFUL.includes(e.type))
    const firstActionSec = first ? first.t - vs[0].start : null
    const hesitation = (firstActionSec ?? vs[0].end - vs[0].start) > hesThr
    if (hesitation) bump(vs[0].start + hesThr, 0.5)
    let backs = 0
    for (const v of vs) {
      const next = visits.find((x) => x.start === v.end)
      if (next && (order.get(next.screenKey) ?? Infinity) < card.order) {
        backs++
        bump(v.end, 0.7)
      }
    }
    let awaySec = 0
    for (const r of awayRuns) for (let t = r.start; t <= r.end; t++) if (inV(t)) awaySec++
    stats.push({
      screenKey: card.screenKey,
      durationSec: Math.round(vs.reduce((a, v) => a + (v.end - v.start), 0) * 10) / 10,
      visits: vs.map(({ start, end }) => ({ start, end })),
      firstActionSec: firstActionSec === null ? null : Math.round(firstActionSec * 10) / 10,
      hesitation,
      backs,
      deadClicks: evs.filter((e) => e.type === 'dead-click').length,
      rageClicks: evs.filter((e) => e.type === 'rage-click').length,
      awaySec
    })
  }
  // Camera startle adds a weaker impulse (secondary signal).
  for (let t = 0; t < end; t++) {
    const s = play.get(t)
    if (s?.face && s.headSpeedMax !== null && s.headSpeedMax > headThr) impulse[t] = Math.max(impulse[t], 0.4 * clamp((s.headSpeedMax - headThr) / (4 * headThr), 0, 1))
  }
  const levels = impulseCurve({
    len: end,
    impulse,
    peak: 80,
    decaySec: DECAY_SEC,
    alpha: EMA_ALPHA,
    state: (t) => (away[t] ? 'away' : 'data'),
    add: (t) => {
      const s = play.get(t)
      return s?.face && baseline.talkingMean < 0.3 && (s.talking ?? 0) >= 0.5 ? 10 : 0
    }
  })
  const realCurve: CurvePoint[] = levels.map((level, t) => ({ t, level }))
  const expectedCurve = expectedCurveFrom(cards, visits, end)

  // Mismatches
  const found: Mismatch[] = []
  for (const st of stats) {
    const card = cards.find((c) => c.screenKey === st.screenKey)!
    const [minS, maxS] = card.expectedSec
    let felt = 0
    for (const v of st.visits) for (let t = Math.floor(v.start); t < Math.ceil(v.end) && t < end; t++) felt = Math.max(felt, levels[t])
    const base = { screenKey: st.screenKey, start: st.visits[0].start, end: st.visits[st.visits.length - 1].end, expected: BEHAVIOR_LEVEL[card.behavior], felt: Math.round(felt) }
    const add = (kind: MismatchKind, severity: number): void => {
      found.push({ ...base, kind, severity, text: describe(kind, card, st) })
    }
    const friction = st.hesitation || st.backs > 0 || st.deadClicks > 0 || st.rageClicks > 0
    if (card.behavior === 'flow' && friction) add('unexpected-friction', 1 + st.backs + st.deadClicks + 2 * st.rageClicks + (st.hesitation ? 1 : 0))
    if (card.behavior === 'decide' && st.durationSec < minS && !friction) add('missed-decision', (minS - st.durationSec) / Math.max(1, minS))
    if (st.awaySec >= AWAY_MIN_SEC) add('disengagement', st.awaySec / 4)
    if (st.durationSec > maxS) add('over-time', (st.durationSec - maxS) / Math.max(1, maxS))
  }
  const mismatches = mergeSameKind(found, (m) => `${m.kind}|${m.screenKey}`, (a, b) => {
    a.felt = Math.max(a.felt, b.felt)
    a.severity = Math.max(a.severity, b.severity)
  }).sort((a, b) => a.start - b.start)

  let covered = 0
  for (let t = 0; t < end; t++) if (play.has(t)) covered++
  const cameraCoverage = Math.round((covered / end) * 100) / 100

  return { baseline, expectedCurve, realCurve, screens: stats, mismatches, cameraCoverage }
}

/** Expected curve generated from cards (no hand drawing): each visit holds its card's level. */
export function expectedCurveFrom(cards: HypothesisCard[], visits: Visit[], len: number): CurvePoint[] {
  const out: CurvePoint[] = []
  for (let t = 0; t < len; t++) {
    const v = visits.find((x) => t >= Math.floor(x.start) && t < x.end)
    const c = v && cards.find((x) => x.screenKey === v.screenKey)
    out.push({ t, level: c ? BEHAVIOR_LEVEL[c.behavior] : 0 })
  }
  return out
}

/** The 3-4 largest mismatches for the retrospective, each as a <= 10 s clip range. */
export function retroMoments(r: ScreenReport, n = 4, clipSec = 10): (Mismatch & { clip: [number, number] })[] {
  return [...r.mismatches]
    .sort((a, b) => b.severity - a.severity || a.start - b.start)
    .slice(0, n)
    .map((m) => {
      const mid = m.kind === 'over-time' ? m.end - clipSec / 2 : m.start + Math.min(clipSec, m.end - m.start) / 2
      const s = Math.max(0, mid - clipSec / 2)
      return { ...m, clip: [Math.round(s * 10) / 10, Math.round((s + clipSec) * 10) / 10] as [number, number] }
    })
    .sort((a, b) => a.start - b.start)
}

// ---- Sentences (Turkish, behaviour only) ---------------------------------------------------------------
const TIMES = ['', 'bir kez', 'iki kez', 'üç kez', 'dört kez', 'beş kez']
const times = (n: number): string => TIMES[n] ?? `${n} kez`
const sec = (n: number): string => `${Math.round(n)} sn`
const EXPECT: Record<HypothesisCard['behavior'], string> = { flow: 'akıcı bekledin', read: 'dikkatli okuma bekledin', decide: 'karar bekledin' }

export function describe(kind: MismatchKind, card: HypothesisCard, st: ScreenStats): string {
  const name = card.screenName
  if (kind === 'unexpected-friction') {
    const parts: string[] = []
    if (st.hesitation) parts.push(`${sec(st.firstActionSec ?? st.visits[0].end - st.visits[0].start)} durdu`)
    if (st.backs) parts.push(`${times(st.backs)} geri döndü`)
    if (st.deadClicks) parts.push(`${times(st.deadClicks)} tepkisiz bir yere tıkladı`)
    if (st.rageClicks) parts.push(`${times(st.rageClicks)} aynı yere art arda tıkladı`)
    return `${name}: ${EXPECT.flow}, katılımcı ${joinTr(parts)}.`
  }
  if (kind === 'missed-decision') return `${name}: ${EXPECT.decide}, katılımcı ${sec(st.durationSec)}'de geçti.`
  if (kind === 'disengagement') return `${name}: katılımcı ${sec(st.awaySec)} ekrandan uzaklaştı.`
  return `${name}: en fazla ${sec(card.expectedSec[1])} bekledin, ${sec(st.durationSec)} sürdü.`
}

function joinTr(p: string[]): string {
  if (p.length <= 1) return p.join('')
  return `${p.slice(0, -1).join(', ')} ve ${p[p.length - 1]}`
}
