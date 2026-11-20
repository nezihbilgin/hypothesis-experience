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
  private agg: SecondAggregator
  delegate: 'GPU' | 'CPU' | null = null

  constructor(private readonly o: SensingOptions) {
    this.agg = new SecondAggregator(o.onSample)
  }

  private now = (): number => absoluteNow(performance)

  async start(): Promise<void> {
    const fps = this.o.targetFps ?? 15
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
        if (this.o.clock.started && !this.o.clock.paused) this.agg.push(e.data.frame)
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
    const ac = new AudioContext()
    this.audioCtx = ac
    const src = ac.createMediaStreamSource(new MediaStream([track]))
    const an = ac.createAnalyser()
    an.fftSize = 1024
    src.connect(an) // not connected to destination: nothing is played or recorded
    const buf = new Float32Array(an.fftSize)
    const vad = new EnergyVad()
    this.timers.push(
      window.setInterval(() => {
        if (!this.o.clock.started || this.o.clock.paused) return
        an.getFloatTimeDomainData(buf)
        this.agg.pushAudio(this.o.clock.t(), vad.push(EnergyVad.rms(buf)))
      }, 20)
    )
  }

  /** Close the open second, e.g. before a question pauses the clock or at task end. */
  flush(): void {
    this.agg.flush()
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
