// Module Web Worker: MediaPipe FaceLandmarker. Receives ImageBitmaps, returns only numbers (FrameResult).
// Frames are closed here and never leave this thread (Principle 3).
// Faz 0: in a module worker the classic wasm loader hangs silently; forVisionTasks(base, true) uses the module variant.
// Delegate: GPU first; CPU only when allowed (4+ cores, decided by the caller).
import { FaceLandmarker, FilesetResolver, type FaceLandmarkerResult } from '@mediapipe/tasks-vision'
import type { FrameResult } from './frames'

export type WorkerIn =
  | { type: 'init'; base: string; allowCpu: boolean }
  | { type: 'frame'; bitmap: ImageBitmap; videoMs: number; t: number }
export type WorkerOut =
  | { type: 'ready'; delegate: 'GPU' | 'CPU'; loadMs: number }
  | { type: 'error'; text: string }
  | { type: 'result'; frame: FrameResult; inferMs: number }

const ctx = self as unknown as { onmessage: ((e: MessageEvent<WorkerIn>) => void) | null; postMessage(m: WorkerOut): void }
let lm: FaceLandmarker | null = null
let lastVideoMs = -1

const score = (r: FaceLandmarkerResult, names: string[]): number | undefined => {
  const cats = r.faceBlendshapes?.[0]?.categories
  if (!cats) return undefined
  const v = names.map((n) => cats.find((c) => c.categoryName === n)?.score).filter((x): x is number => x !== undefined)
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined
}

export function toFrame(r: FaceLandmarkerResult, t: number): FrameResult {
  const pts = r.faceLandmarks?.[0]
  if (!pts?.length) return { t, face: false }
  let minX = 1, maxX = 0, sx = 0, sy = 0
  for (const p of pts) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    sx += p.x
    sy += p.y
  }
  const width = maxX - minX
  const f: FrameResult = { t, face: true, cx: sx / pts.length, cy: sy / pts.length, width }
  // Lip gap: inner upper lip (13) to inner lower lip (14), in face widths. More sensitive than jawOpen for small speech.
  const up = pts[13]
  const lo = pts[14]
  if (up && lo && width > 0) f.mouthOpen = Math.hypot(up.x - lo.x, up.y - lo.y) / width
  const blink = score(r, ['eyeBlinkLeft', 'eyeBlinkRight'])
  const brow = score(r, ['browDownLeft', 'browDownRight'])
  const jaw = score(r, ['jawOpen'])
  if (blink !== undefined) f.blink = blink
  if (brow !== undefined) f.browDown = brow
  if (jaw !== undefined) f.jawOpen = jaw
  return f
}

ctx.onmessage = async (e) => {
  const msg = e.data
  if (msg.type === 'init') {
    const t0 = performance.now()
    try {
      const fileset = await FilesetResolver.forVisionTasks(msg.base + 'mediapipe/wasm', true)
      const make = (delegate: 'GPU' | 'CPU') =>
        FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: msg.base + 'mediapipe/face_landmarker.task', delegate },
          canvas: typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : undefined,
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: false
        })
      let delegate: 'GPU' | 'CPU' = 'GPU'
      try {
        lm = await make('GPU')
      } catch (err) {
        if (!msg.allowCpu) throw err
        lm = await make('CPU')
        delegate = 'CPU'
      }
      ctx.postMessage({ type: 'ready', delegate, loadMs: Math.round(performance.now() - t0) })
    } catch (err) {
      ctx.postMessage({ type: 'error', text: String(err) })
    }
    return
  }
  if (msg.type === 'frame') {
    const t0 = performance.now()
    let frame: FrameResult = { t: msg.t, face: false }
    try {
      // detectForVideo needs strictly increasing timestamps.
      const ts = Math.max(msg.videoMs, lastVideoMs + 1)
      lastVideoMs = ts
      if (lm) frame = toFrame(lm.detectForVideo(msg.bitmap, ts), msg.t)
    } catch (err) {
      ctx.postMessage({ type: 'error', text: String(err) })
    } finally {
      msg.bitmap.close()
    }
    ctx.postMessage({ type: 'result', frame, inferMs: performance.now() - t0 })
  }
}
