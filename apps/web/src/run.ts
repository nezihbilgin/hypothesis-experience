// Session controller for the participant flow. Framework-free: the React steps call it, it owns the clock,
// sensing, event intake and the session JSON. Nothing leaves the browser in v1 (the participant downloads the file).
import {
  FigmaAdapter,
  SessionClock,
  absoluteNow,
  aliasMap,
  cardsFromTask,
  computeBaseline,
  computeScreenReport,
  endOfTaskQuestions,
  fromEmbedMessage,
  questionAtTransition,
  sessionHealth,
  taskOutcome,
  type TaskOutcome,
  type AskedSoFar,
  type Baseline,
  type Capabilities,
  type HypothesisCard,
  type InteractionEvent,
  type QualityDecision,
  type QuestionMoment,
  type ScreenReport,
  type SecondSample,
  type Study, redact } from '@hx/core'
import { detectHover } from '@hx/embed-sdk'
import { QualityProbe, SensingClient } from '@hx/sensing'

export const SESSION_SCHEMA = 'hx-session/1'
const CAMERA_STREAM = 'laptop-cam'
const PROTO_STREAM = 'prototype'
const QUALITY_WARMUP_SEC = 3
/** Public Figma OAuth app client-id (appears in every embed URL), same as the spikes. */
export const FIGMA_CLIENT_ID = 'jq77fE5G89W5KAxgriPyAd'

export interface Consent {
  camera: boolean
  microphone: boolean
  faceSignals: boolean
  at: string
}

export interface QuestionRecord {
  moment: QuestionMoment
  answer: string | null
  dontRemember: boolean
  skipped: boolean
  answeredAt: string
}

export interface TaskRecord {
  id: string
  prompt: string
  expectation: number | null
  seq: number | null
  events: InteractionEvent[]
  samples: SecondSample[]
  questions: QuestionRecord[]
  endSec: number | null
  report: ScreenReport | null
  /** direct / indirect / failed / dropped, last screen and end time (metric set, decisions 2026-11-20). */
  outcome?: TaskOutcome
  /** Session time the target screen was first reached (null if never or no target defined). */
  reachedTargetAt: number | null
  /** Comments the participant pinned on the prototype (clock paused while writing). */
  comments: CommentRecord[]
  /** Connection lost during the task (QA KA-28): task time where it happened and how long it lasted (wall seconds);
   * the clock was stopped, so the gap is in no duration. */
  connectionGaps?: { t: number; sec: number }[]
  /** Screens seen that the study JSON does not define (helps the researcher fill in node ids). */
  unknownScreens: string[]
  blocked: string | null
}

export interface CommentRecord {
  t: number
  screenKey: string
  /** State node shown when commenting (Figma), else the screen key. */
  node: string
  /** Point in the prototype iframe, CSS px, and the iframe size (the report maps it onto the frame image). */
  point: { ix: number; iy: number; iw: number; ih: number }
  /** Scroll offset of that frame from the last click on it (Figma sends it only with clicks), or null. */
  scroll: { x: number; y: number } | null
  /** true when the scroll offset is known from a click on the same node shortly before; otherwise approximate. */
  precise: boolean
  text: string
}

export interface FiveSecondResult {
  id: string
  screen: string
  shown: boolean
  answers: { question: string; answer: string | null }[]
}

export interface QualityResult extends QualityDecision {
  hints: ('dark' | 'noise')[]
}

/** Figma prototype link -> embed URL (embed.figma.com + embed-host + client-id), as in Spike 1. */
export function figmaEmbedUrl(raw: string, host: string, startNode?: string): string {
  const u = new URL(raw)
  if (!/(^|\.)figma\.com$/.test(u.hostname)) return raw
  if (startNode) {
    // Start this task's prototype at a given flow starting point (task.startScreen).
    u.searchParams.set('node-id', startNode.replace(':', '-'))
    u.searchParams.set('starting-point-node-id', startNode)
  }
  u.hostname = 'embed.figma.com'
  u.searchParams.set('embed-host', host || 'localhost')
  u.searchParams.set('client-id', FIGMA_CLIENT_ID)
  // Participant view: no Figma toolbar/footer over the prototype (it covered sticky buttons in the first pilot),
  // and no hotspot hints, which would flash clickable areas after a miss and change dead-click behaviour.
  u.searchParams.set('hide-ui', '1')
  u.searchParams.set('footer', 'false')
  u.searchParams.set('hotspot-hints', '0')
  // Keyboard navigation (arrow keys) lets participants skip screens without clicking; turn it off where the embed
  // supports it. Click-less transitions are still detected and flagged in case it does not (decisions 2026-11-21).
  u.searchParams.set('disable-default-keyboard-nav', '1')
  return u.toString()
}

/** v1 supports desktop Chrome and Edge (QA PK-17): other browsers and phones get a clear message, not a block. */
export function supportedBrowser(ua: string, maxTouchPoints = 0): boolean {
  const mobile = /Mobi|Android|iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)
  const chromium = /Chrome\/|Edg\//.test(ua) && !/OPR\/|SamsungBrowser|CriOS|FxiOS/.test(ua)
  return chromium && !mobile
}

/** Written answers and comments are masked on the device before they are kept (names, phone, e-mail, address,
 * card number; decisions 2026-11-21). Empty -> null. */
export function maskAnswer(text: string | null | undefined): string | null {
  const t = text?.trim()
  return t ? redact(t).text : null
}

export class SessionRun {
  readonly clock = new SessionClock(() => absoluteNow(performance))
  readonly startedAt = new Date().toISOString()
  /** Current flow step (set by the app); written into the health block. */
  step = 'welcome'
  consent: Consent = { camera: false, microphone: false, faceSignals: false, at: '' }
  quality: QualityResult | null = null
  sensing: SensingClient | null = null
  delegate: 'GPU' | 'CPU' | null = null
  warmup = { events: [] as InteractionEvent[], samples: [] as SecondSample[] }
  baseline: Baseline = computeBaseline([], [])
  tasks: TaskRecord[] = []
  /** First few raw Figma messages per type (ids and numbers only), to check the embed payload format. */
  figmaRaw: Record<string, unknown[]> = {}
  hardestTask: { answer: string | null; dontRemember: boolean; skipped: boolean } | null = null
  /** Context questions (after the warm-up, not timed). */
  contextAnswers: { id: string; text: string; answer: string | null }[] = []
  fiveSecondResults: FiveSecondResult[] = []
  asked: AskedSoFar = { inTask: [], inSession: [] }
  private phase: 'idle' | 'quality' | 'warmup' | 'task' = 'idle'
  private probe: QualityProbe | null = null
  private adapter: FigmaAdapter | null = null
  private taskIndex = -1
  /** The task clock restarts at zero when the prototype is ready (first screen), so loading time is not measured. */
  private protoReady = false

  constructor(readonly study: Study, readonly participant: string) {}

  get cameraOn(): boolean {
    return this.quality?.cameraEnabled === true
  }

  get capabilities(): Capabilities {
    return { hasHover: detectHover(), hasCamera: this.cameraOn, hasScreenVideo: false }
  }

  get faceSignalsOn(): boolean {
    return this.study.faceSignals && this.consent.faceSignals && this.cameraOn
  }

  cards(i = this.taskIndex): HypothesisCard[] {
    return cardsFromTask(this.study.tasks[i])
  }

  get task(): TaskRecord {
    return this.tasks[this.taskIndex]
  }

  /** Camera or microphone lost mid-session (QA PK-16): the session goes on; later seconds count as "not measured". */
  deviceLosses: { kind: 'camera' | 'microphone'; at: string; step: string; taskIndex: number; t: number | null }[] = []
  private micLost = false
  private deviceLost(kind: 'video' | 'audio'): void {
    const k = kind === 'video' ? 'camera' : 'microphone'
    if (this.deviceLosses.some((d) => d.kind === k)) return
    this.deviceLosses.push({ kind: k, at: new Date().toISOString(), step: this.step, taskIndex: this.taskIndex, t: this.clock.started ? Math.round(this.clock.t() * 10) / 10 : null })
    if (k === 'microphone') this.micLost = true
    if (k === 'camera') {
      // No frames any more: stop the analysis and release the rest; seconds without samples are "no data", not "away".
      this.sensing?.stop()
      this.sensing = null
    }
  }

  private onSample = (s: SecondSample): void => {
    // Without the microphone the voice fields would read as silence: drop them so they count as not measured.
    const base = this.micLost ? { ...s, talking: null, voice: null, avSync: null } : s
    const x = { ...base, streamId: CAMERA_STREAM }
    if (this.phase === 'quality') this.probe?.push(x)
    else if (this.phase === 'warmup') this.warmup.samples.push(x)
    else if (this.phase === 'task' && this.task) this.task.samples.push(x)
  }

  // ---- Camera: start + quality check (3 s warm-up + 5 s measurement) ------------------------------------
  /** Starts sensing if the participant allowed the camera. Returns false when it could not start (denied, error). */
  async startSensing(): Promise<boolean> {
    if (!this.consent.camera) return false
    const client = new SensingClient({
      createWorker: () => new Worker(new URL('../../../packages/sensing/src/worker.ts', import.meta.url), { type: 'module' }),
      assetBase: new URL('./', location.href).href,
      clock: this.clock,
      audio: this.consent.microphone,
      onSample: this.onSample,
      onTrackEnded: (kind) => this.deviceLost(kind)
    })
    try {
      await client.start()
      this.sensing = client
      this.delegate = client.delegate
      return true
    } catch {
      client.stop()
      return false
    }
  }

  /** Runs the quality check; resolves with the decision. Camera-less mode when sensing is off or too slow. */
  async qualityCheck(): Promise<QualityResult> {
    if (!this.sensing) {
      this.quality = { cameraEnabled: false, blinkEnabled: false, reason: 'no-frames', medianFps: 0, hints: [] }
      return this.quality
    }
    this.probe = new QualityProbe(QUALITY_WARMUP_SEC)
    this.phase = 'quality'
    this.sensing.newPhase()
    this.clock.start()
    const t0 = performance.now()
    while (!this.probe.done && performance.now() - t0 < 15000) await new Promise((r) => setTimeout(r, 250))
    const brightness = this.sensing.brightness() ?? undefined
    const d = this.probe.decide(brightness)
    const hints: QualityResult['hints'] = []
    if (d.hint === 'dark') hints.push('dark')
    const ambient = this.sensing.ambientRms
    if (ambient !== null && ambient > 0.02) hints.push('noise')
    this.quality = { ...d, hints }
    this.phase = 'idle'
    // Test hook for automated privacy checks with a fake camera (no face): keep the camera on. Debug only.
    const keep = new URLSearchParams(location.search).has('debug') && new URLSearchParams(location.search).has('keepCamera')
    if (keep && !d.cameraEnabled) this.quality = { ...this.quality, cameraEnabled: true, reason: 'ok' }
    if (!d.cameraEnabled && !keep) {
      this.sensing.stop() // camera-less mode: release the camera right away
      this.sensing = null
    }
    return this.quality
  }

  // ---- Warm-up ------------------------------------------------------------------------------------------
  startWarmup(): void {
    this.sensing?.newPhase()
    this.clock.start()
    this.phase = 'warmup'
  }

  warmupEvent(type: 'screen' | 'click', screenKey: string): void {
    this.warmup.events.push({ t: this.clock.t(), screenKey, type, pointerType: lastPointer })
  }

  finishWarmup(): void {
    this.sensing?.flush()
    this.phase = 'idle'
    this.baseline = computeBaseline(this.warmup.samples, this.warmup.events)
  }

  // ---- Tasks --------------------------------------------------------------------------------------------
  prepareTask(i: number): TaskRecord {
    this.taskIndex = i
    const t = this.study.tasks[i]
    const rec: TaskRecord = { id: t.id, prompt: t.prompt, expectation: null, seq: null, events: [], samples: [], questions: [], endSec: null, report: null, reachedTargetAt: null, comments: [], unknownScreens: [], blocked: null }
    this.tasks[i] = rec
    this.asked = { inTask: [], inSession: this.asked.inSession }
    return rec
  }

  startTask(viewport: { w: number; h: number }): void {
    this.adapter = new FigmaAdapter({
      pointerType: matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse',
      viewport,
      orientation: viewport.h > viewport.w ? 'portrait' : 'landscape',
      streamId: PROTO_STREAM
    }, aliasMap(this.cards()))
    this.protoReady = false
    this.sensing?.newPhase()
    this.clock.start()
    this.phase = 'task'
  }

  private markReady(): void {
    if (this.protoReady) return
    this.protoReady = true
    this.sensing?.newPhase() // flushes the loading-time second first...
    this.task.samples = [] // ...so it is cleared here, not appended after
    this.clock.start()
  }

  /** Intake of a postMessage from the prototype iframe. Returns a question to ask now, or a blocking error. */
  handleMessage(e: MessageEvent): { question?: QuestionMoment; blocked?: string; ready?: boolean; reachedTarget?: boolean } {
    if (this.phase !== 'task' || this.clock.paused) return {}
    const events: InteractionEvent[] = []
    const src = this.study.sourceType
    let ready = false
    if (src === 'figma') {
      if (!/(^|\.)figma\.com$/.test(new URL(e.origin).hostname) || !this.adapter) return {}
      if (!this.protoReady && e.data && typeof e.data === 'object' && (e.data as { type?: unknown }).type === 'PRESENTED_NODE_CHANGED') {
        this.markReady()
        ready = true
      }
      const type = typeof e.data === 'string' ? e.data : (e.data as { type?: unknown })?.type
      if (typeof type === 'string' && (this.figmaRaw[type]?.length ?? 0) < 3) (this.figmaRaw[type] ??= []).push(e.data)
      const r = this.adapter.push(e.data, this.clock.at(absoluteNow(performance)))
      if (r.status === 'login-required' || r.status === 'password-required') {
        this.task.blocked = r.status
        return { blocked: r.status }
      }
      events.push(...r.events)
    } else {
      if (e.origin !== new URL(this.study.sourceUrl).origin) return {}
      if (!this.protoReady && e.data && typeof e.data === 'object' && (e.data as { type?: unknown }).type === 'screen') {
        this.markReady()
        ready = true
      }
      const ev = fromEmbedMessage(e.data, (ms) => this.clock.at(ms))
      if (ev) events.push({ ...ev, t: Math.max(0, ev.t), streamId: ev.streamId ?? PROTO_STREAM })
    }
    let question: QuestionMoment | undefined
    for (const ev of events) {
      this.task.events.push(ev)
      // Target can be a logical screen or one of its state variants (aliases): compare the raw node too.
      const target = this.study.tasks[this.taskIndex].targetScreen
      const node = typeof ev.payload?.node === 'string' ? ev.payload.node : ev.screenKey
      if (target && (ev.type === 'screen' || ev.type === 'state') && (node === target || ev.screenKey === target) && this.task.reachedTargetAt === null) this.task.reachedTargetAt = ev.t
      if (ev.type !== 'screen') continue
      const known = this.cards().some((c) => c.screenKey === ev.screenKey)
      if (!known && !this.task.unknownScreens.includes(ev.screenKey)) this.task.unknownScreens.push(ev.screenKey)
      const from = ev.payload?.from
      if (typeof from === 'string' && this.study.questions.atTransitions && !question) question = this.transitionQuestion(from, ev.t) ?? undefined
    }
    const reachedTarget = this.task.reachedTargetAt !== null
    return { ...(question ? { question } : {}), ...(ready ? { ready } : {}), ...(reachedTarget ? { reachedTarget } : {}) }
  }

  private reportUntil(endSec: number): ScreenReport {
    return computeScreenReport({
      cards: this.cards(),
      events: this.task.events,
      samples: this.task.samples,
      baseline: this.baseline,
      endSec,
      cameraEnabled: this.cameraOn,
      faceSignals: this.faceSignalsOn,
      capabilities: this.capabilities
    })
  }

  private transitionQuestion(fromKey: string, leftAt: number): QuestionMoment | null {
    const card = this.cards().find((c) => c.screenKey === fromKey)
    if (!card) return null
    return questionAtTransition({ card, report: this.reportUntil(leftAt), leftAt, asked: this.asked, limits: this.study.questions.limits })
  }

  /** The session clock stops while a question is on screen; the screen's measurement is already closed. */
  /** Comment mode: the clock stops while the participant picks a point and writes. */
  startComment(): void {
    this.sensing?.flush()
    this.clock.pause()
  }

  /** Saves a comment (or cancels when text is null) and resumes the clock. */
  endComment(point: CommentRecord['point'] | null, text: string | null): void {
    if (point && text?.trim() && this.task) {
      const t = this.clock.t()
      const lastScreen = [...this.task.events].reverse().find((e) => e.type === 'screen' || e.type === 'state')
      const screenKey = this.adapter?.screenKey ?? lastScreen?.screenKey ?? ''
      const node = this.adapter?.currentNode ?? screenKey
      const ls = this.adapter?.lastScroll
      const scroll = ls && ls.node === node ? { x: ls.x, y: ls.y } : null
      const precise = !!(ls && ls.node === node && t - ls.t <= 10)
      this.task.comments.push({ t: Math.round(t * 1000) / 1000, screenKey, node, point, scroll, precise, text: maskAnswer(text) ?? '' })
    }
    this.clock.resume()
  }

  private offlineSince: number | null = null
  /** Connection lost: stop the task clock (only if it was running) until it comes back. */
  connectionLost(): void {
    if (this.phase !== 'task' || this.offlineSince !== null || this.clock.paused) return
    this.sensing?.flush()
    this.clock.pause()
    this.offlineSince = performance.now()
  }
  connectionBack(): void {
    if (this.offlineSince === null) return
    const sec = Math.round((performance.now() - this.offlineSince) / 100) / 10
    this.offlineSince = null
    ;(this.task.connectionGaps ??= []).push({ t: Math.round(this.clock.t() * 10) / 10, sec })
    this.clock.resume()
  }

  pauseForQuestion(): void {
    this.sensing?.flush()
    this.clock.pause()
  }

  answer(moment: QuestionMoment, a: { answer?: string; dontRemember?: boolean; skipped?: boolean }, inTask = true): void {
    this.task.questions.push({ moment, answer: maskAnswer(a.answer), dontRemember: !!a.dontRemember, skipped: !!a.skipped, answeredAt: new Date().toISOString() })
    this.asked = { inTask: inTask ? [...this.asked.inTask, moment] : this.asked.inTask, inSession: [...this.asked.inSession, moment] }
    this.clock.resume()
  }

  /** Ends the task ("Bitirdim"): closes the measurement, builds the report and any end-of-task retro questions. */
  /** The prototype could not be opened (login/password screen or never loaded): end the task as not measurable, not
   * as a participant failure (QA PK-13). */
  skipBlockedTask(reason: string): QuestionMoment[] {
    this.task.blocked = this.task.blocked ?? reason
    return this.finishTask()
  }

  finishTask(): QuestionMoment[] {
    const endSec = this.clock.t()
    this.sensing?.flush()
    this.phase = 'idle'
    this.task.endSec = Math.round(endSec * 1000) / 1000
    if (this.taskIndex === 0) {
      // Blink baseline: warm-up + first screen of the first task (decisions 2026-11-20).
      const firstShown = this.task.events.find((e) => e.type === 'screen')
      const next = firstShown && this.task.events.find((e) => e.type === 'screen' && e.t > firstShown.t)
      const firstScreen = firstShown ? this.task.samples.filter((s) => s.t >= firstShown.t && s.t < (next?.t ?? endSec)) : []
      this.baseline = computeBaseline(this.warmup.samples, this.warmup.events, firstScreen)
    }
    this.task.report = this.reportUntil(endSec)
    this.task.outcome = this.outcomeOf(this.taskIndex, true)
    if (!this.study.questions.endOfTask) return []
    return endOfTaskQuestions({ report: this.task.report, endedAt: endSec, asked: this.asked, limits: this.study.questions.limits })
  }

  private outcomeOf(i: number, finished: boolean): TaskOutcome {
    const t = this.tasks[i]
    return taskOutcome({ cards: this.cards(i), events: t.events, targetScreen: this.study.tasks[i].targetScreen, finished, endSec: t.endSec })
  }

  stopSensing(): void {
    this.sensing?.stop()
    this.sensing = null
  }

  health(): ReturnType<typeof sessionHealth> {
    return sessionHealth({
      cameraOn: this.cameraOn,
      warmup: this.warmup,
      baseline: this.baseline,
      tasks: this.tasks.filter(Boolean).map((t, i) => ({
        id: t.id,
        events: t.events,
        samples: t.samples,
        unknownScreens: t.unknownScreens,
        questions: t.questions,
        endSec: t.endSec,
        reachedTargetAt: t.reachedTargetAt,
        hasTarget: !!this.study.tasks[i]?.targetScreen
      })),
      sessionSec: (Date.now() - Date.parse(this.startedAt)) / 1000,
      lastStep: this.step
    })
  }

  /** "Oturumumu sil": stops the camera/microphone and drops every collected value from this tab's memory.
   * A file the participant already downloaded is outside the page's reach; the UI text tells them to delete it. */
  wipe(): void {
    this.stopSensing()
    this.phase = 'idle'
    this.probe = null
    this.adapter = null
    this.taskIndex = -1
    this.protoReady = false
    this.consent = { camera: false, microphone: false, faceSignals: false, at: '' }
    this.quality = null
    this.delegate = null
    this.warmup = { events: [], samples: [] }
    this.baseline = computeBaseline([], [])
    this.tasks = []
    this.figmaRaw = {}
    this.hardestTask = null
    this.contextAnswers = []
    this.fiveSecondResults = []
    this.asked = { inTask: [], inSession: [] }
    this.wiped = true
  }

  wiped = false

  toJSON(): unknown {
    return {
      schema: SESSION_SCHEMA,
      // Session health first: numbers only, with automatic flags (decisions 2026-11-20).
      health: this.health(),
      study: { orgId: this.study.orgId, name: this.study.name, sourceType: this.study.sourceType, sourceUrl: this.study.sourceUrl, faceSignals: this.study.faceSignals, locale: this.study.locale },
      participant: this.participant,
      startedAt: this.startedAt,
      endedAt: new Date().toISOString(),
      device: { userAgent: navigator.userAgent, cores: navigator.hardwareConcurrency ?? null, viewport: { w: innerWidth, h: innerHeight } },
      consent: this.consent,
      capabilities: this.capabilities,
      quality: this.quality,
      delegate: this.delegate,
      warmup: this.warmup,
      baseline: this.baseline,
      // A task without an outcome never ended: dropped (with its last screen for the drop-off funnel).
      tasks: this.tasks.map((t, i) => (t && !t.outcome ? { ...t, outcome: this.outcomeOf(i, false) } : t)),
      figmaRaw: this.figmaRaw,
      // Evidence for "nothing leaves the device": every request this page made (iframe internals not included),
      // grouped by origin and type. A fetch/xhr/beacon entry here would be an upload.
      network: networkSummary(),
      contextAnswers: this.contextAnswers,
      deviceLosses: this.deviceLosses,
      fiveSecondResults: this.fiveSecondResults,
      hardestTask: this.hardestTask
    }
  }
}

// Last pointer type, for warm-up events (the participant app's own clicks).
let lastPointer: 'mouse' | 'touch' | 'pen' | undefined
if (typeof window !== 'undefined')
  window.addEventListener(
    'pointerdown',
    (e) => {
      lastPointer = e.pointerType === 'touch' ? 'touch' : e.pointerType === 'pen' ? 'pen' : 'mouse'
    },
    true
  )

/** Saves the session JSON through a short-lived blob URL that is revoked right after the click, so no copy of
 * the file stays addressable in the page. */
export function downloadJson(name: string, data: unknown, doc: Document = document): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const a = doc.createElement('a')
  a.href = url
  a.download = name
  a.rel = 'noopener'
  doc.body.appendChild(a)
  try {
    a.click()
  } finally {
    a.remove()
    // Revoking in the same task can cancel the download in some browsers; the next tick is enough.
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}

function networkSummary(): { origin: string; type: string; count: number }[] {
  const m = new Map<string, number>()
  for (const e of performance.getEntriesByType('resource') as PerformanceResourceTiming[]) {
    let origin = 'other'
    try {
      origin = new URL(e.name).origin
    } catch {
      /* data: or blob: */
    }
    const k = `${origin}|${e.initiatorType}`
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return [...m].map(([k, count]) => ({ origin: k.split('|')[0], type: k.split('|')[1], count }))
}
