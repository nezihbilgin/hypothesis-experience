// Quality check measurement (participant flow step 3): warms the GPU, then measures fps and face ratio for 5 s
// from the SecondSamples the aggregator produces, and hands them to core's pure decision.
import { QUALITY_WINDOW_SEC, cameraQuality, type QualityDecision, type SecondSample } from '@hx/core'

export class QualityProbe {
  private seconds: SecondSample[] = []

  /** Seconds before this session time are GPU warm-up and are ignored. */
  constructor(private readonly warmupUntil = 0) {}

  push(s: SecondSample): void {
    if (s.t >= this.warmupUntil) this.seconds.push(s)
  }

  get done(): boolean {
    return this.seconds.length >= QUALITY_WINDOW_SEC
  }

  decide(brightness?: number): QualityDecision {
    const win = this.seconds.slice(-QUALITY_WINDOW_SEC)
    const faced = win.filter((s) => s.face).length
    return cameraQuality({ fpsPerSecond: win.map((s) => s.samples), faceRatio: win.length ? faced / win.length : 0, ...(brightness !== undefined ? { brightness } : {}) })
  }
}
