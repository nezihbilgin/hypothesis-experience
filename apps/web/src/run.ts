// Session controller for the participant flow. Framework-free: the React steps call it, it owns the clock,
// sensing, event intake and the session JSON. Nothing leaves the browser in v1 (the participant downloads the file).
import {
  FigmaAdapter,
  SessionClock,
  absoluteNow,
  cardsFromTask,
  computeBaseline,
  computeScreenReport,
  endOfTaskQuestions,
  fromEmbedMessage,
  questionAtTransition,
  type AskedSoFar,
  type Baseline,
  type Capabilities,
  type HypothesisCard,
  type InteractionEvent,
  type QualityDecision,
  type QuestionMoment,
  type ScreenReport,
  type SecondSample,
  type Study
} from '@hx/core'
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
  /** Screens seen that the study JSON does not define (helps the researcher fill in node ids). */
  unknownScreens: string[]
  blocked: string | null
}

export interface QualityResult extends QualityDecision {
  hints: ('dark' | 'noise')[]
}

/** Figma prototype link -> embed URL (embed.figma.com + embed-host + client-id), as in Spike 1. */
export function figmaEmbedUrl(raw: string, host: string): string {
  const u = new URL(raw)
  if (!/(^|\.)figma\.com$/.test(u.hostname)) return raw
  u.hostname = 'embed.figma.com'
  u.searchParams.set('embed-host', host || 'localhost')
  u.searchParams.set('client-id', FIGMA_CLIENT_ID)
  return u.toString()
}

export class SessionRun {
  readonly clock = new SessionClock(() => absoluteNow(performance))
  readonly startedAt = new Date().toISOString()
  consent: Consent = { camera: false, microphone: false, faceSignals: false, at: '' }
  quality: QualityResult | null = null
  sensing: SensingClient | null = null
  delegate: 'GPU' | 'CPU' | null = null
  warmup = { events: [] as InteractionEvent[], samples: [] as SecondSample[] }
  baseline: Baseline = computeBaseline([], [])
  tasks: TaskRecord[] = []
  hardestTask: { answer: string | null; dontRemember: boolean; skipped: boolean } | null = null
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

  private onSample = (s: SecondSample): void => {
    const x = { ...s, streamId: CAMERA_STREAM }
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
      onSample: this.onSample
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
    if (!d.cameraEnabled) {
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
    const rec: TaskRecord = { id: t.id, prompt: t.prompt, expectation: null, seq: null, events: [], samples: [], questions: [], endSec: null, report: null, unknownScreens: [], blocked: null }
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
    })
    this.protoReady = false
    this.sensing?.newPhase()
    this.clock.start()
    this.phase = 'task'
  }

  private markReady(): void {
    if (this.protoReady) return
    this.protoReady = true
    this.task.samples = []
    this.sensing?.newPhase()
    this.clock.start()
  }

  /** Intake of a postMessage from the prototype iframe. Returns a question to ask now, or a blocking error. */
  handleMessage(e: MessageEvent): { question?: QuestionMoment; blocked?: string; ready?: boolean } {
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
      if (ev.type !== 'screen') continue
      const known = this.cards().some((c) => c.screenKey === ev.screenKey)
      if (!known && !this.task.unknownScreens.includes(ev.screenKey)) this.task.unknownScreens.push(ev.screenKey)
      const from = ev.payload?.from
      if (typeof from === 'string' && this.study.questions.atTransitions && !question) question = this.transitionQuestion(from, ev.t) ?? undefined
    }
    return { ...(question ? { question } : {}), ...(ready ? { ready } : {}) }
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
  pauseForQuestion(): void {
    this.sensing?.flush()
    this.clock.pause()
  }

  answer(moment: QuestionMoment, a: { answer?: string; dontRemember?: boolean; skipped?: boolean }, inTask = true): void {
    this.task.questions.push({ moment, answer: a.answer?.trim() || null, dontRemember: !!a.dontRemember, skipped: !!a.skipped, answeredAt: new Date().toISOString() })
    this.asked = { inTask: inTask ? [...this.asked.inTask, moment] : this.asked.inTask, inSession: [...this.asked.inSession, moment] }
    this.clock.resume()
  }

  /** Ends the task ("Bitirdim"): closes the measurement, builds the report and any end-of-task retro questions. */
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
    if (!this.study.questions.endOfTask) return []
    return endOfTaskQuestions({ report: this.task.report, endedAt: endSec, asked: this.asked, limits: this.study.questions.limits })
  }

  stopSensing(): void {
    this.sensing?.stop()
    this.sensing = null
  }

  toJSON(): unknown {
    return {
      schema: SESSION_SCHEMA,
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
      tasks: this.tasks,
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
