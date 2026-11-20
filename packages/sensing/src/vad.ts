// Energy-based voice activity detection (handoff: "enerji tabanlı yeterli"). Pure: takes RMS per audio frame.
// The audio itself is never stored or sent during the task; only the speech/no-speech flag per frame is used.

export interface VadOptions {
  /** Absolute floor for speech, RMS 0..1. */
  minRms: number
  /** Speech when rms > noiseFloor * ratio. */
  ratio: number
  /** Noise floor adaptation per non-speech frame (0..1). */
  adapt: number
  /** Frames a speech decision is held after energy drops (avoids flicker between syllables). */
  hangover: number
}

export const DEFAULT_VAD: VadOptions = { minRms: 0.01, ratio: 3, adapt: 0.05, hangover: 8 }

export class EnergyVad {
  private noise: number | null = null
  private hold = 0

  constructor(private readonly o: VadOptions = DEFAULT_VAD) {}

  /** RMS of a frame of samples in -1..1. */
  static rms(samples: ArrayLike<number>): number {
    let s = 0
    for (let i = 0; i < samples.length; i++) s += samples[i] * samples[i]
    return samples.length ? Math.sqrt(s / samples.length) : 0
  }

  push(rms: number): boolean {
    if (this.noise === null) this.noise = rms
    const loud = rms > Math.max(this.o.minRms, this.noise * this.o.ratio)
    if (loud) {
      this.hold = this.o.hangover
      return true
    }
    this.noise += this.o.adapt * (rms - this.noise)
    if (this.hold > 0) {
      this.hold--
      return true
    }
    return false
  }
}
