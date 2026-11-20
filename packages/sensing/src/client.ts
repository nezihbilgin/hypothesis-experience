// Main-thread controller: camera + microphone -> worker / VAD -> SecondAggregator -> SecondSample callback.
// Browser only (not unit-tested; the pure parts are frames.ts, vad.ts, quality.ts).
// - Frames go to the worker as ImageBitmaps (transferred) at most `targetFps`; one in flight at a time.
// - All timestamps on the session clock (performance.timeOrigin + now, zero at task start, paused during questions).
// - Nothing is recorded: no video frames and no audio leave this module, only per-second numbers.
import { SessionClock, absoluteNow, shouldTryCpuDelegate, type SecondSample } from '@hx/core'
import { SecondAggregator } from './frames'
import { EnergyVad } from './vad'
import type { WorkerIn, WorkerOut } from './worker'

export interface SensingOptions {
  /** Creates the module worker, e.g. () => new Worker(new URL('@hx/sensing/worker', import.meta.url), { type: 'module' }). */
  createWorker: () => Worker
  /** Base URL that holds mediapipe/wasm and mediapipe/face_landmarker.task. */
  assetBase: string
  clock: SessionClock
  onSample: (s: SecondSample) => void
  onError?: (text: string) => void
  /** Calibration only: raw per-frame lip gap and per-frame loudness (numbers, never pixels or audio). */
  onRaw?: (r: { kind: 'mouth'; t: number; v: number | null } | { kind: 'audio'; t: number; rms: number }) => void
  targetFps?: number
  /** Microphone for voice activity (talking ratio). */
  audio?: boolean
  /** Downscale frames to this width before inference. */
  frameWidth?: number
}

export class SensingClient {
  private worker: Worker | null = null
  private stream: MediaStream | null = null
  private video: HTMLVideoElement | null = null
  private audioCtx: AudioContext | null = null
  private timers: number[] = []
  private busy = false
  /** Phase counter: a frame still in flight when a new phase starts carries the old clock's time and is dropped. */
  private phase = 0
  private inflightPhase = -1
  private agg: SecondAggregator
  private vad: EnergyVad | null = null
  delegate: 'GPU' | 'CPU' | null = null

  constructor(private readonly o: SensingOptions) {
    this.agg = new SecondAggregator(o.onSample)
  }

  private now = (): number => absoluteNow(performance)

  async start(): Promise<void> {
    const fps = this.o.targetFps ?? 15
    // Create the AudioContext before any await, while the click's user activation is still valid;
    // otherwise Chrome may start it suspended and the analyser reads silence.
    if (this.o.audio) this.audioCtx = new AudioContext()
    this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, frameRate: 30 }, audio: this.o.audio ?? false })
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.srcObject = this.stream
    await video.play()
    this.video = video

    const worker = this.o.createWorker()
    this.worker = worker
    await new Promise<void>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<WorkerOut>) => {
        if (e.data.type === 'ready') {
          this.delegate = e.data.delegate
          resolve()
        } else if (e.data.type === 'error') reject(new Error(e.data.text))
      }
      worker.postMessage({ type: 'init', base: this.o.assetBase, allowCpu: shouldTryCpuDelegate(navigator.hardwareConcurrency) } satisfies WorkerIn)
    })
    worker.onmessage = (e: MessageEvent<WorkerOut>) => {
      if (e.data.type === 'result') {
        this.busy = false
        if (this.inflightPhase === this.phase && this.o.clock.started && !this.o.clock.paused) {
          this.agg.push(e.data.frame)
          this.o.onRaw?.({ kind: 'mouth', t: e.data.frame.t, v: e.data.frame.mouthOpen ?? null })
        }
      } else if (e.data.type === 'error') this.o.onError?.(e.data.text)
    }
    this.timers.push(window.setInterval(() => void this.pump(), 1000 / fps))

    if (this.o.audio) this.startVad()
  }

  private async pump(): Promise<void> {
    const v = this.video
    if (!v || !this.worker || this.busy || v.readyState < 2) return
    if (!this.o.clock.started || this.o.clock.paused) return
    this.busy = true
    this.inflightPhase = this.phase
    const abs = this.now()
    try {
      const width = this.o.frameWidth ?? 320
      const bitmap = await createImageBitmap(v, { resizeWidth: width, resizeHeight: Math.round((width * v.videoHeight) / Math.max(1, v.videoWidth)) })
      const msg: WorkerIn = { type: 'frame', bitmap, videoMs: performance.now(), t: this.o.clock.at(abs) }
      this.worker.postMessage(msg, [bitmap])
    } catch (err) {
      this.busy = false
      this.o.onError?.(String(err))
    }
  }

  private startVad(): void {
    const track = this.stream?.getAudioTracks()[0]
    if (!track) return
    const ac = this.audioCtx ?? new AudioContext()
    this.audioCtx = ac
    void ac.resume()
    const src = ac.createMediaStreamSource(new MediaStream([track]))
    const an = ac.createAnalyser()
    an.fftSize = 1024
    src.connect(an) // not connected to destination: nothing is played or recorded
    const buf = new Float32Array(an.fftSize)
    const vad = new EnergyVad()
    this.vad = vad
    this.timers.push(
      window.setInterval(() => {
        if (!this.o.clock.started || this.o.clock.paused) return
        an.getFloatTimeDomainData(buf)
        const rms = EnergyVad.rms(buf)
        const t = this.o.clock.t()
        this.agg.pushAudio(t, vad.push(rms), rms)
        this.o.onRaw?.({ kind: 'audio', t, rms })
      }, 20)
    )
  }

  /** Close the open second, e.g. before a question pauses the clock or at task end. */
  flush(): void {
    this.agg.flush()
  }

  /** Start a new phase (warm-up, next task): closes the open second and starts a fresh aggregator, so seconds
   * restart from the clock's new zero. Call right before SessionClock.start(). */
  newPhase(): void {
    this.phase++
    this.agg.flush()
    this.agg = new SecondAggregator(this.o.onSample)
  }

  /** Room background loudness (VAD noise floor, RMS 0..1), for the "quiet place" hint. null without a microphone. */
  get ambientRms(): number | null {
    return this.vad ? this.vad.floor : null
  }

  /** Mean brightness 0..1 of the current camera frame (tiny canvas, stays in this tab), for the lighting hint. */
  brightness(): number | null {
    const v = this.video
    if (!v || v.readyState < 2) return null
    const c = document.createElement('canvas')
    c.width = 32
    c.height = 24
    const ctx = c.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(v, 0, 0, c.width, c.height)
    const d = ctx.getImageData(0, 0, c.width, c.height).data
    let sum = 0
    for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
    return Math.round((sum / (d.length / 4) / 255) * 1000) / 1000
  }

  /** Microphone track, for the calibration page's optional audio file. Never used by the product flow. */
  get audioTrack(): MediaStreamTrack | null {
    return this.stream?.getAudioTracks()[0] ?? null
  }

  stop(): void {
    this.flush()
    for (const id of this.timers) clearInterval(id)
    this.timers = []
    this.worker?.terminate()
    this.worker = null
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    void this.audioCtx?.close()
    this.audioCtx = null
    this.video = null
  }
}
