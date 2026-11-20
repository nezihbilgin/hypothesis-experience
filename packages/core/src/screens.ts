// Screen-window model: the product model built on Senti's felt.ts ideas, adapted to interfaces (decisions 2026-11-20).
// - Each screen is a window; the expectation comes from a hypothesis card on two axes: effort and friction.
// - Rates and durations inside a screen, not Senti's 4 s impulse decay (that stays only in compat/).
// - Interaction signals decide mismatches. Face signals (blink, brow, stillness, lean-in) are optional per study,
//   never create a mismatch on their own and only raise its severity. Camera-less mode is a complete mode.
// Principle 1: sentences describe observed behaviour only, never emotion or intent.
// Principle 2: thresholds come from the participant's own warm-up distribution.
import { bucket, clamp, mean, median, mergeSameKind, percentile, personalThreshold, runs } from './engine'
import {
  AXIS_LEVEL,
  BEHAVIOR_EXPECT,
  type AxisCurves,
  type AxisScores,
  type Baseline,
  type Capabilities,
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
export const AWAY_MIN_SEC = 2
/** Seconds with fewer processed frames than this carry no camera data (Faz 0: old GPUs dip to 5-7 fps). */
export const MIN_SAMPLES = 5
/** Blink rate needs >= 15 fps; below that only the blink signal is off (decisions 2026-11-20, item 4). */
export const MIN_BLINK_SAMPLES = 15
export const REPLAY_PAD_SEC = 5
const MEANINGFUL: InteractionEvent['type'][] = ['click', 'dead-click', 'rage-click', 'input-edit', 'input-delete']
// Starting values, to be calibrated on retrospective validation and the first 5 sessions.
const BLINK_DROP_MIN = 0.25
const STILLNESS_RISE_MIN = 0.15
const LEAN_IN_MIN = 0.1
const BROW_RISE_MIN = 0.1

// ---- Baseline ----------------------------------------------------------------------------------------
/** Keep one sample per second and drop seconds below MIN_SAMPLES: they are "no data", not "away". */
export function usableSeconds(samples: SecondSample[]): Map<number, SecondSample> {
  const m = bucket(samples)
  for (const [k, s] of m) if (s.samples < MIN_SAMPLES) m.delete(k)
  return m
}

const blinkOf = (s: SecondSample): number | null => (s.samples >= MIN_BLINK_SAMPLES && s.blinkRate != null ? s.blinkRate : null)
const nums = (a: (number | null | undefined)[]): number[] => a.filter((v): v is number => v != null && Number.isFinite(v))

/**
 * Baseline from the 30 s warm-up (neutral reading + a few clicks). `firstScreenSamples` (the first screen of the
 * first task) only extends the blink baseline: 30 s holds just 5-10 blinks.
 */
export function computeBaseline(warmupSamples: SecondSample[], warmupEvents: InteractionEvent[], firstScreenSamples: SecondSample[] = []): Baseline {
  const faced = [...usableSeconds(warmupSamples).values()].filter((s) => s.face)
  const blinkSrc = [...faced, ...[...usableSeconds(firstScreenSamples).values()].filter((s) => s.face)]
  return {
    headSpeedP95: percentile(nums(faced.map((s) => s.headSpeedMax)), 0.95),
    talkingMean: mean(nums(faced.map((s) => s.talking))),
    faceWidthMedian: median(nums(faced.map((s) => s.faceWidthRatio))),
    firstActionP95: percentile(firstActionLatencies(warmupEvents), 0.95),
    blinkRateMedian: median(nums(blinkSrc.map(blinkOf))),
    browDownMedian: median(nums(faced.map((s) => s.browDown))),
    stillnessMedian: median(nums(faced.map((s) => s.stillness))),
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

// ---- Logical screens (state variants) ------------------------------------------------------------------
/** State-variant node id -> logical screen key, from the cards' aliases. */
export function aliasMap(cards: HypothesisCard[]): Record<string, string> {
  const m: Record<string, string> = {}
  for (const c of cards) for (const a of c.aliases ?? []) m[a] = c.screenKey
  return m
}

/**
 * Maps every event to its logical screen and turns a 'screen' event that does not change the logical screen into
 * a 'state' event, so state variants neither split visits nor count as transitions. Idempotent.
 */
export function logicalEvents(events: InteractionEvent[], cards: HypothesisCard[]): InteractionEvent[] {
  const m = aliasMap(cards)
  if (!Object.keys(m).length) return events
  let current: string | null = null
  return [...events]
    .sort((a, b) => a.t - b.t)
    .map((e) => {
      const key = m[e.screenKey] ?? e.screenKey
      if (e.type !== 'screen') return key === e.screenKey ? e : { ...e, screenKey: key }
      const node = (e.payload?.node as string | undefined) ?? e.screenKey
      if (key === current) return { ...e, screenKey: key, type: 'state' as const, payload: { ...e.payload, node } }
      current = key
      const from = typeof e.payload?.from === 'string' ? m[e.payload.from] ?? e.payload.from : undefined
      return { ...e, screenKey: key, payload: { ...e.payload, ...(from ? { from } : {}), ...(node !== key ? { node } : {}) } }
    })
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
  /** Camera on and passed the quality check: enables face-lost disengagement. */
  cameraEnabled: boolean
  /** Study setting + participant consent for face signals (blink, brow, stillness, lean-in). Default off. */
  faceSignals?: boolean
  /** What the setup can measure. Missing = desktop defaults (hover yes, camera = cameraEnabled, no screen video). */
  capabilities?: Partial<Capabilities>
  /** The pause before the first action on the task's first screen is orientation (reading the task, looking
   * around), not hesitation: excluded from hesitation and effort, reported as orientationSec. Default true. */
  excludeOrientation?: boolean
}

/** Friction added for visiting a screen that is not on the task's expected path (first visit). */
export const OFF_PATH_FRICTION = 40

const r1 = (n: number): number => Math.round(n * 10) / 10

export function computeScreenReport(input: ScreenSessionInput): ScreenReport {
  const { cards, baseline } = input
  const caps: Capabilities = { hasHover: true, hasScreenVideo: false, ...input.capabilities, hasCamera: input.cameraEnabled && input.capabilities?.hasCamera !== false }
  const cameraEnabled = caps.hasCamera
  const faceOn = cameraEnabled && input.faceSignals === true
  const events = logicalEvents(input.events, cards).sort((a, b) => a.t - b.t)
  const end = Math.max(1, Math.ceil(input.endSec))
  const visits = visitsFrom(events, input.endSec)
  const order = new Map(cards.map((c) => [c.screenKey, c.order]))
  const play = usableSeconds(cameraEnabled ? input.samples : [])
  const hesThr = personalThreshold(HESITATION_FLOOR_SEC, baseline.firstActionP95)

  // Away seconds: face lost (camera) or tab hidden (always).
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

  const stats: ScreenStats[] = []
  const found: Mismatch[] = []
  const firstScreen = visits[0]?.screenKey
  let orientationSec: number | null = null
  for (const card of cards) {
    const vs = visits.filter((v) => v.screenKey === card.screenKey)
    if (!vs.length) continue
    const inV = (t: number): boolean => vs.some((v) => t >= v.start && t < v.end)
    const evs = events.filter((e) => e.screenKey === card.screenKey && inV(e.t))
    const first = evs.find((e) => MEANINGFUL.includes(e.type))
    const firstActionSec = first ? first.t - vs[0].start : null
    const rawPause = firstActionSec ?? vs[0].end - vs[0].start
    const orienting = input.excludeOrientation !== false && card.screenKey === firstScreen
    if (orienting) orientationSec = r1(rawPause)
    const pauseSec = orienting ? 0 : rawPause
    const hesitation = pauseSec > hesThr
    const backAt: number[] = []
    for (const v of vs) {
      const next = visits.find((x) => x.start === v.end)
      if (!card.offPath && next && (order.get(next.screenKey) ?? Infinity) < card.order) backAt.push(v.end)
    }
    const deads = evs.filter((e) => e.type === 'dead-click')
    const rages = evs.filter((e) => e.type === 'rage-click')
    let awaySec = 0
    let awayStart: number | null = null
    for (const r of awayRuns)
      for (let t = r.start; t <= r.end; t++)
        if (inV(t)) {
          awaySec++
          awayStart ??= t
        }
    const durationSec = r1(vs.reduce((a, v) => a + (v.end - v.start), 0))

    // Face support (only with face signals on): screen values against the participant's baseline.
    const faced: SecondSample[] = []
    if (faceOn) for (const v of vs) for (let t = Math.floor(v.start); t < Math.ceil(v.end); t++) {
      const s = play.get(t)
      if (s?.face) faced.push(s)
    }
    const support: ScreenStats['faceSupport'] = []
    const comps: number[] = []
    if (faced.length) {
      const blink = nums(faced.map(blinkOf))
      if (blink.length && baseline.blinkRateMedian > 0) {
        const drop = clamp((baseline.blinkRateMedian - mean(blink)) / baseline.blinkRateMedian, 0, 1)
        comps.push(drop)
        if (drop >= BLINK_DROP_MIN) support.push('blink-drop')
      }
      const still = nums(faced.map((s) => s.stillness))
      if (still.length) {
        const rise = clamp((mean(still) - baseline.stillnessMedian) / Math.max(0.05, 1 - baseline.stillnessMedian), 0, 1)
        comps.push(rise)
        if (rise >= STILLNESS_RISE_MIN) support.push('stillness')
      }
      const fw = nums(faced.map((s) => s.faceWidthRatio))
      if (fw.length && baseline.faceWidthMedian > 0) {
        const lean = mean(fw) / baseline.faceWidthMedian - 1
        comps.push(clamp(lean / 0.25, 0, 1))
        if (lean >= LEAN_IN_MIN) support.push('lean-in')
      }
    }
    const brow = faced.length ? nums(faced.map((s) => s.browDown)) : []
    const browUp = brow.length > 0 && mean(brow) - baseline.browDownMedian >= BROW_RISE_MIN

    const pauseComp = clamp(pauseSec / (2 * hesThr), 0, 1)
    const faceMean = comps.length ? mean(comps) : null
    const effort = Math.round(100 * (faceMean === null ? pauseComp : 0.6 * pauseComp + 0.4 * faceMean))
    const interactionFriction = clamp(25 * backAt.length + 20 * deads.length + 35 * rages.length + (card.offPath ? OFF_PATH_FRICTION : 0), 0, 100)
    if (interactionFriction > 0 && browUp) support.push('brow')
    const friction = Math.round(clamp(interactionFriction + (interactionFriction > 0 && browUp ? 10 : 0), 0, 100))

    const st: ScreenStats = {
      screenKey: card.screenKey,
      durationSec,
      visits: vs.map(({ start, end }) => ({ start, end })),
      firstActionSec: firstActionSec === null ? null : r1(firstActionSec),
      hesitation,
      backs: backAt.length,
      deadClicks: deads.length,
      rageClicks: rages.length,
      awaySec,
      observed: { effort, friction },
      faceSupport: support,
      ...(card.offPath ? { offPath: true } : {})
    }
    stats.push(st)

    // Mismatches: interaction/time decides, face support only raises severity.
    const exp = BEHAVIOR_EXPECT[card.behavior]
    const expected: AxisScores = { effort: AXIS_LEVEL[exp.effort], friction: AXIS_LEVEL[exp.friction] }
    const [minS, maxS] = card.expectedSec
    const span = { start: vs[0].start, end: vs[vs.length - 1].end }
    const add = (kind: MismatchKind, at: number, severity: number, direction?: 'low' | 'high'): void => {
      const m: Mismatch = {
        screenKey: card.screenKey,
        kind,
        ...(direction ? { direction } : {}),
        ...span,
        at: r1(at),
        replay: [r1(Math.max(0, at - REPLAY_PAD_SEC)), r1(at + REPLAY_PAD_SEC)],
        expected,
        observed: { effort, friction },
        severity: Math.round(severity * 100) / 100,
        text: ''
      }
      m.text = describe(m, card, st)
      found.push(m)
    }
    const hasFriction = interactionFriction > 0
    if (hasFriction) {
      const at = Math.min(...[...deads, ...rages].map((e) => e.t), ...backAt, ...(card.offPath ? [vs[0].start] : []))
      add('unexpected-friction', at, 1 + backAt.length + deads.length + 2 * rages.length + (card.offPath ? 1 : 0) + (browUp ? 0.5 : 0))
    }
    if (exp.effort === 'high' && durationSec < minS && !hasFriction && !hesitation) {
      add('effort-mismatch', vs[0].start, (minS - durationSec) / Math.max(1, minS) + (faceMean === null ? 0 : 0.5 * (1 - faceMean)), 'low')
    }
    if (exp.effort === 'low' && hesitation) {
      add('effort-mismatch', vs[0].start + hesThr, 1 + (pauseSec - hesThr) / hesThr + (faceMean ?? 0), 'high')
    }
    if (awaySec >= AWAY_MIN_SEC) add('disengagement', awayStart ?? span.start, awaySec / 4)
    if (durationSec > maxS) add('over-time', crossTime(vs, maxS), (durationSec - maxS) / Math.max(1, maxS))
  }

  const mismatches = mergeSameKind(found, (m) => `${m.kind}|${m.direction ?? ''}|${m.screenKey}`, (a, b) => {
    a.severity = Math.max(a.severity, b.severity)
  }).sort((a, b) => a.start - b.start || a.at - b.at)

  let covered = 0
  for (let t = 0; t < end; t++) if (play.has(t)) covered++

  return {
    signals: { camera: cameraEnabled, face: faceOn, hover: caps.hasHover, screenVideo: caps.hasScreenVideo },
    baseline,
    expected: expectedCurvesFrom(cards, visits, end),
    observed: stepCurves(stats, visits, end),
    screens: stats,
    mismatches,
    cameraCoverage: Math.round((covered / end) * 100) / 100,
    orientationSec,
    offPathScreens: stats.filter((s) => s.offPath).map((s) => s.screenKey)
  }
}

/** Moment when cumulative time on the screen passes `sec`. */
function crossTime(vs: { start: number; end: number }[], sec: number): number {
  let acc = 0
  for (const v of vs) {
    if (acc + (v.end - v.start) >= sec) return v.start + (sec - acc)
    acc += v.end - v.start
  }
  return vs[vs.length - 1].end
}

const curveFrom = (visits: Visit[], len: number, level: (screenKey: string) => number | undefined): CurvePoint[] => {
  const out: CurvePoint[] = []
  for (let t = 0; t < len; t++) {
    const v = visits.find((x) => t >= Math.floor(x.start) && t < x.end)
    out.push({ t, level: (v && level(v.screenKey)) ?? 0 })
  }
  return out
}

/** Expected curves generated from cards (no hand drawing): each visit holds its card's expected axis levels. */
export function expectedCurvesFrom(cards: HypothesisCard[], visits: Visit[], len: number): AxisCurves {
  const exp = (k: string) => cards.find((c) => c.screenKey === k)
  return {
    effort: curveFrom(visits, len, (k) => { const c = exp(k); return c && AXIS_LEVEL[BEHAVIOR_EXPECT[c.behavior].effort] }),
    friction: curveFrom(visits, len, (k) => { const c = exp(k); return c && AXIS_LEVEL[BEHAVIOR_EXPECT[c.behavior].friction] })
  }
}

function stepCurves(stats: ScreenStats[], visits: Visit[], len: number): AxisCurves {
  const by = new Map(stats.map((s) => [s.screenKey, s.observed]))
  return { effort: curveFrom(visits, len, (k) => by.get(k)?.effort), friction: curveFrom(visits, len, (k) => by.get(k)?.friction) }
}

// ---- Sentences (researcher report, Turkish, behaviour only) --------------------------------------------
const TIMES = ['', 'bir kez', 'iki kez', 'üç kez', 'dört kez', 'beş kez']
const times = (n: number): string => TIMES[n] ?? `${n} kez`
const sec = (n: number): string => `${Math.round(n)} sn`
const EXPECT: Record<HypothesisCard['behavior'], string> = { flow: 'akıcı bekledin', read: 'dikkatli okuma bekledin', decide: 'karar bekledin' }

export function describe(m: Pick<Mismatch, 'kind' | 'direction'>, card: HypothesisCard, st: ScreenStats): string {
  const name = card.screenName
  if (m.kind === 'unexpected-friction') {
    const parts: string[] = []
    if (st.offPath) parts.push('beklenen yolun dışındaki bu ekrana geldi')
    if (st.backs) parts.push(`${times(st.backs)} geri döndü`)
    if (st.deadClicks) parts.push(`${times(st.deadClicks)} tepkisiz bir yere tıkladı`)
    if (st.rageClicks) parts.push(`${times(st.rageClicks)} aynı yere art arda tıkladı`)
    return `${name}: ${EXPECT[card.behavior]}, katılımcı ${joinTr(parts)}.`
  }
  if (m.kind === 'effort-mismatch') {
    if (m.direction === 'high') return `${name}: ${EXPECT.flow}, katılımcı ilk aksiyondan önce ${sec(st.firstActionSec ?? st.visits[0].end - st.visits[0].start)} durdu.`
    return `${name}: ${EXPECT[card.behavior]}, katılımcı ${sec(st.durationSec)}'de geçti.`
  }
  if (m.kind === 'disengagement') return `${name}: katılımcı ${sec(st.awaySec)} ekrandan uzaklaştı.`
  return `${name}: en fazla ${sec(card.expectedSec[1])} bekledin, ${sec(st.durationSec)} sürdü.`
}

function joinTr(p: string[]): string {
  if (p.length <= 1) return p.join('')
  return `${p.slice(0, -1).join(', ')} ve ${p[p.length - 1]}`
}
