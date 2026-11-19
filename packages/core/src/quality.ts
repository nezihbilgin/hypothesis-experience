// Camera quality check before the warm-up (participant flow step 3). Pure decision; the sensing worker measures.
// Faz 0: on an old Intel Mac the GPU delegate gave a median of 13 fps with single seconds at 5-7 fps, and the CPU
// fallback was too slow on 2 cores. Thresholds below are starting values, to be calibrated on the first sessions.

export const MIN_MEDIAN_FPS = 10
export const MIN_FACE_RATIO = 0.7
export const QUALITY_WINDOW_SEC = 5
export const DARK_BRIGHTNESS = 0.25
export const CPU_MIN_CORES = 4

export interface QualityProbe {
  /** Frames processed per second during the check, after GPU warm-up. Only the last QUALITY_WINDOW_SEC are used. */
  fpsPerSecond: number[]
  /** Fraction of processed frames with a face, 0..1. */
  faceRatio: number
  /** Mean frame brightness 0..1, if measured (only used for a lighting hint). */
  brightness?: number
}

export type QualityReason = 'ok' | 'low-fps' | 'no-face' | 'no-frames'

export interface QualityDecision {
  cameraEnabled: boolean
  reason: QualityReason
  medianFps: number
  /** Advice for the participant, independent of the decision. */
  hint?: 'dark'
}

export function cameraQuality(p: QualityProbe): QualityDecision {
  const win = p.fpsPerSecond.slice(-QUALITY_WINDOW_SEC)
  const sorted = [...win].sort((a, b) => a - b)
  const medianFps = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) : 0
  const hint = p.brightness !== undefined && p.brightness < DARK_BRIGHTNESS ? ('dark' as const) : undefined
  const reason: QualityReason = !win.length || medianFps === 0 ? 'no-frames' : medianFps < MIN_MEDIAN_FPS ? 'low-fps' : p.faceRatio < MIN_FACE_RATIO ? 'no-face' : 'ok'
  return { cameraEnabled: reason === 'ok', reason, medianFps, ...(hint ? { hint } : {}) }
}

/** CPU delegate is only worth trying when the GPU delegate fails and the machine has 4+ cores. */
export const shouldTryCpuDelegate = (hardwareConcurrency: number | undefined): boolean => (hardwareConcurrency ?? 0) >= CPU_MIN_CORES
