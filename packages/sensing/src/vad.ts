// Energy-based voice activity detection (handoff: "enerji tabanlı yeterli"). Pure: takes RMS per audio frame.
// The audio itself is never stored or sent during the task; only the speech/no-speech flag per frame is used.
//
// Noise floor = the quietest frame of the last few seconds ("minimum statistics"). An earlier version adapted the
// floor towards every non-speech frame; with a video playing nearby the floor climbed onto the video's level and
// the participant's own speech over it was missed (Nezih's calibration run, 20 Nov). Speech and video both have
// short pauses, so the minimum stays at the room's real background level. Deciding *whose* voice it is belongs to
// the lip-voice sync check, not to the VAD.

export interface VadOptions {
  /** Absolute floor for speech, RMS 0..1. */
  minRms: number
  /** Speech when rms > noiseFloor * ratio. */
  ratio: number
  /** Frames the noise-floor minimum looks back over (150 frames x 20 ms = 3 s). */
  floorWindow: number
  /** Frames a speech decision is held after energy drops (avoids flicker between syllables). */
  hangover: number
}

export const DEFAULT_VAD: VadOptions = { minRms: 0.01, ratio: 3, floorWindow: 150, hangover: 8 }

export class EnergyVad {
  private recent: number[] = []
  private hold = 0

  constructor(private readonly o: VadOptions = DEFAULT_VAD) {}

  /** RMS of a frame of samples in -1..1. */
  static rms(samples: ArrayLike<number>): number {
    let s = 0
    for (let i = 0; i < samples.length; i++) s += samples[i] * samples[i]
    return samples.length ? Math.sqrt(s / samples.length) : 0
  }

  /** Current noise floor estimate. */
  get floor(): number {
    return this.recent.length ? Math.min(...this.recent) : 0
  }

  push(rms: number): boolean {
    this.recent.push(rms)
    if (this.recent.length > this.o.floorWindow) this.recent.shift()
    const loud = rms > Math.max(this.o.minRms, this.floor * this.o.ratio)
    if (loud) {
      this.hold = this.o.hangover
      return true
    }
    if (this.hold > 0) {
      this.hold--
      return true
    }
    return false
  }
}
