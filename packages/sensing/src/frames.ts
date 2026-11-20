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
/** Voice counts as the participant talking only if the lips or jaw move within the second (or the previous one,
 * for speech crossing a second boundary). Lip gap range in face widths; jawOpen range. Calibrated on one M1 run
 * (20 Nov): jawOpen moved only 0.01-0.05 while talking, so the lips are the primary check. */
export const MOUTH_MOVE_MIN = 0.015
export const JAW_MOVE_MIN = 0.03
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

/** Streaming aggregator. Push frames in time order; whole seconds are emitted once a later second starts (or on flush). */
export class SecondAggregator {
  private sec: number | null = null
  private frames: FrameResult[] = []
  private prevFace: FrameResult | null = null
  private eyeClosed = false
  /** Per completed second: blinks and whether the second had enough fps. */
  private blinkHistory: { sec: number; blinks: number; valid: boolean }[] = []
  private talking = new Map<number, { active: number; total: number }>()
  private prevJawActive = false

  constructor(private readonly emit: (s: SecondSample) => void) {}

  /** Voice-activity frame (from the audio analyser), t = session seconds. */
  pushAudio(t: number, speech: boolean): void {
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
    this.prevJawActive = false
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
    const mouthActive = (mouthMovement !== null && mouthMovement >= MOUTH_MOVE_MIN) || (jawMovement !== null && jawMovement >= JAW_MOVE_MIN)
    const talking = voice === null || (jawMovement === null && mouthMovement === null) ? null : mouthActive || this.prevJawActive ? voice : 0
    this.prevJawActive = mouthActive

    this.emit({
      t: sec,
      face,
      headSpeedMax: face ? r3(speedMax) : null,
      faceWidthRatio: face ? r3(median(faced.map((f) => f.width!))) : null,
      talking,
      voice,
      jawMovement,
      mouthMovement,
      samples: fr.length,
      blinkRate,
      browDown: face ? r3(meanOf(brow)) : null,
      stillness: face && intervals ? r3(still / intervals) : null
    })
  }
}
