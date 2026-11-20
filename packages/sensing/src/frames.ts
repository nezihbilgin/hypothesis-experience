// Per-frame face result -> one SecondSample per session second. Pure and deterministic (tested in Node).
// Only numbers come in: the worker never returns pixels (Principle 3).
// Blendshapes are raw muscle-movement scores, used only as supporting signals (decisions 2026-11-20, item 4).
import type { SecondSample } from '@hx/core'

/** What the worker returns for one frame. t = session seconds. */
export interface FrameResult {
  t: number
  face: boolean
  /** Face centre, normalised 0..1 frame coordinates. */
  cx?: number
  cy?: number
  /** Face width / frame width. */
  width?: number
  blink?: number // mean of eyeBlinkLeft/Right, 0..1
  browDown?: number // mean of browDownLeft/Right, 0..1
  jawOpen?: number
  /** Inner lip gap (landmarks 13-14) / face width. */
  mouthOpen?: number
}

/** Head speed below this (face-widths per second) counts as still. */
export const STILL_SPEED = 0.2
/** Blink: eye-closure score rises above HIGH, then falls below LOW (hysteresis). */
export const BLINK_HIGH = 0.5
export const BLINK_LOW = 0.35
/** Blink rate needs >= 15 frames per second (blinks last 100-400 ms). */
export const BLINK_MIN_FPS = 15
/** Voice counts as the participant talking only if the lips move within the second (or the previous one, for speech
 * crossing a second boundary). Lip gap range in face widths. Calibrated on two M1 runs (20 Nov): silent seconds
 * <= 0.009 even with head movement, talking >= 0.022. jawOpen is kept as a raw value only: it also moves with the head. */
export const MOUTH_MOVE_MIN = 0.015
/** Audio-visual sync: correlation between the lip gap and the voice loudness over the last 2 s. Your own speech
 * moves both together; another voice in the room does not follow your lips. Starting value, to be calibrated. */
export const AV_SYNC_MIN = 0.3
const AV_LAGS = [-0.1, 0, 0.1, 0.2] // seconds the sound may trail/lead the lips
const AV_ENV_HALF = 0.04 // loudness around each video frame: audio frames within +-40 ms
/** Trailing window for the blink rate, and the least valid seconds it needs. */
export const BLINK_WINDOW_SEC = 15
export const BLINK_MIN_SECONDS = 5

const median = (a: number[]): number | null => {
  if (!a.length) return null
  const s = [...a].sort((x, y) => x - y)
  return s[Math.floor((s.length - 1) / 2)]
}
const meanOf = (a: number[]): number | null => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null)
const r3 = (n: number | null): number | null => (n === null ? null : Math.round(n * 1000) / 1000)

function pearson(x: number[], y: number[]): number | null {
  const n = x.length
  if (n < 3) return null
  const mx = x.reduce((a, b) => a + b, 0) / n
  const my = y.reduce((a, b) => a + b, 0) / n
  let sxy = 0, sxx = 0, syy = 0
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my)
    sxx += (x[i] - mx) ** 2
    syy += (y[i] - my) ** 2
  }
  return sxx < 1e-12 || syy < 1e-12 ? null : sxy / Math.sqrt(sxx * syy)
}

/**
 * Best correlation (over a few small lags) between the lip gap per video frame and the voice loudness around it.
 * null when there is too little data or either signal is flat (no voice, mouth still).
 */
export function avSync(mouth: { t: number; v: number }[], audio: { t: number; rms: number }[]): number | null {
  if (mouth.length < 10 || audio.length < 20) return null
  let best: number | null = null
  for (const lag of AV_LAGS) {
    const xs: number[] = []
    const ys: number[] = []
    for (const m of mouth) {
      const near = audio.filter((a) => Math.abs(a.t - (m.t + lag)) <= AV_ENV_HALF)
      if (!near.length) continue
      xs.push(m.v)
      ys.push(near.reduce((a, b) => a + b.rms, 0) / near.length)
    }
    if (xs.length < 10) continue
    const r = pearson(xs, ys)
    if (r !== null && (best === null || r > best)) best = r
  }
  return best === null ? null : Math.round(best * 100) / 100
}

/** Streaming aggregator. Push frames in time order; whole seconds are emitted once a later second starts (or on flush). */
export class SecondAggregator {
  private sec: number | null = null
  private frames: FrameResult[] = []
  private prevFace: FrameResult | null = null
  private eyeClosed = false
  /** Per completed second: blinks and whether the second had enough fps. */
  private blinkHistory: { sec: number; blinks: number; valid: boolean }[] = []
  private talking = new Map<number, { active: number; total: number }>()
  private prevMouthActive = false
  private audioFrames: { t: number; rms: number }[] = []
  private prevMouth: { t: number; v: number }[] = []

  constructor(private readonly emit: (s: SecondSample) => void) {}

  /** Voice-activity frame (from the audio analyser), t = session seconds; rms = loudness, for the lip sync check. */
  pushAudio(t: number, speech: boolean, rms?: number): void {
    if (rms !== undefined) this.audioFrames.push({ t, rms })
    const k = Math.floor(t)
    const a = this.talking.get(k) ?? { active: 0, total: 0 }
    a.total++
    if (speech) a.active++
    this.talking.set(k, a)
  }

  push(f: FrameResult): void {
    const k = Math.floor(f.t)
    if (this.sec !== null && k > this.sec) this.close()
    if (this.sec === null || k > this.sec) this.sec = k
    if (k < this.sec) return // late frame for a closed second
    this.frames.push(f)
  }

  /** Emit the open second (end of task / pause). */
  flush(): void {
    if (this.sec !== null && this.frames.length) this.close()
    this.prevFace = null
    this.prevMouthActive = false
    this.prevMouth = []
  }

  private close(): void {
    const sec = this.sec!
    const fr = this.frames
    this.frames = []
    const faced = fr.filter((f) => f.face && f.cx !== undefined && f.cy !== undefined && f.width)
    const face = faced.length * 2 > fr.length

    // Head speed and stillness from consecutive faced frames (continues across the second boundary).
    let speedMax: number | null = null
    let still = 0
    let intervals = 0
    for (const f of fr) {
      if (!(f.face && f.cx !== undefined && f.cy !== undefined && f.width)) {
        this.prevFace = null
        continue
      }
      const p = this.prevFace
      if (p && f.t > p.t) {
        const w = (f.width + (p.width ?? f.width)) / 2
        const v = Math.hypot(f.cx - p.cx!, f.cy - p.cy!) / w / (f.t - p.t)
        speedMax = Math.max(speedMax ?? 0, v)
        intervals++
        if (v < STILL_SPEED) still++
      }
      this.prevFace = f
    }

    // Blinks with hysteresis; state carries over seconds.
    let blinks = 0
    for (const f of fr) {
      if (!f.face || f.blink === undefined) continue
      if (!this.eyeClosed && f.blink >= BLINK_HIGH) this.eyeClosed = true
      else if (this.eyeClosed && f.blink <= BLINK_LOW) {
        this.eyeClosed = false
        blinks++
      }
    }
    const valid = fr.length >= BLINK_MIN_FPS && face
    this.blinkHistory.push({ sec, blinks, valid })
    this.blinkHistory = this.blinkHistory.filter((h) => h.sec > sec - BLINK_WINDOW_SEC)
    const win = this.blinkHistory.filter((h) => h.valid)
    const blinkRate = valid && win.length >= BLINK_MIN_SECONDS ? Math.round((win.reduce((a, h) => a + h.blinks, 0) / win.length) * 60 * 10) / 10 : null

    const blendFaced = fr.filter((f) => f.face)
    const brow = blendFaced.map((f) => f.browDown).filter((v): v is number => v !== undefined)
    const audio = this.talking.get(sec)
    this.talking.delete(sec)
    for (const k of this.talking.keys()) if (k < sec) this.talking.delete(k)
    const voice = audio && audio.total ? r3(audio.active / audio.total) : null
    // Voice is the participant's only if the mouth moves (decisions 2026-11-20: mouth movement confirms talking).
    const range = (k: 'jawOpen' | 'mouthOpen'): number | null => {
      const v = blendFaced.map((f) => f[k]).filter((x): x is number => x !== undefined)
      return face && v.length >= 2 ? r3(Math.max(...v) - Math.min(...v)) : null
    }
    const jawMovement = range('jawOpen')
    const mouthMovement = range('mouthOpen')
    const mouthActive = mouthMovement !== null && mouthMovement >= MOUTH_MOVE_MIN
    const mouthOk = mouthActive || this.prevMouthActive
    // Lip-voice sync over this and the previous second (decisions 2026-11-20).
    const mouthNow = blendFaced.filter((f) => f.mouthOpen !== undefined).map((f) => ({ t: f.t, v: f.mouthOpen! }))
    const mouthWin = [...this.prevMouth, ...mouthNow]
    const audioWin = this.audioFrames.filter((a) => a.t >= sec - 1 - 0.3 && a.t < sec + 1 + 0.3)
    const sync = voice !== null && voice > 0 && face ? avSync(mouthWin, audioWin) : null
    const talking =
      voice === null || mouthMovement === null ? null : voice === 0 ? 0 : sync !== null ? (mouthOk && sync >= AV_SYNC_MIN ? voice : 0) : mouthOk ? voice : 0
    this.prevMouthActive = mouthActive
    this.prevMouth = face ? mouthNow : []
    this.audioFrames = this.audioFrames.filter((a) => a.t >= sec - 0.5)

    this.emit({
      t: sec,
      face,
      headSpeedMax: face ? r3(speedMax) : null,
      faceWidthRatio: face ? r3(median(faced.map((f) => f.width!))) : null,
      talking,
      voice,
      jawMovement,
      mouthMovement,
      avSync: sync,
      samples: fr.length,
      blinkRate,
      browDown: face ? r3(meanOf(brow)) : null,
      stillness: face && intervals ? r3(still / intervals) : null
    })
  }
}
