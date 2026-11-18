// Module worker: FaceLandmarker. Receives ImageBitmaps, returns timing + 3 numbers. Frames never leave this thread.
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

let lm = null
let delegate = null

self.onmessage = async (e) => {
  const msg = e.data
  if (msg.type === 'init') {
    const t = performance.now()
    try {
      const fileset = await FilesetResolver.forVisionTasks(msg.base + 'mediapipe/wasm', true) // module variant: classic loader's global is lost in a module worker
      const make = (d) =>
        FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: msg.base + 'mediapipe/face_landmarker.task', delegate: d },
          canvas: typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : undefined,
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false
        })
      try {
        lm = await make(msg.cpu ? 'CPU' : 'GPU')
        delegate = msg.cpu ? 'CPU' : 'GPU'
      } catch (err) {
        self.postMessage({ type: 'log', text: 'GPU delegate başarısız, CPU deneniyor: ' + err })
        lm = await make('CPU')
        delegate = 'CPU (fallback)'
      }
      self.postMessage({ type: 'ready', delegate, loadMs: Math.round(performance.now() - t) })
    } catch (err) {
      self.postMessage({ type: 'error', text: String(err) })
    }
    return
  }
  if (msg.type === 'frame') {
    const t = performance.now()
    let face = false
    let cx = null
    let width = null
    try {
      const r = lm.detectForVideo(msg.bitmap, msg.ts)
      const pts = r.faceLandmarks?.[0]
      if (pts) {
        face = true
        let minX = 1, maxX = 0, sx = 0, sy = 0
        for (const p of pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); sx += p.x; sy += p.y }
        width = maxX - minX
        cx = [sx / pts.length, sy / pts.length]
      }
    } catch (err) {
      self.postMessage({ type: 'log', text: String(err) })
    }
    msg.bitmap.close()
    self.postMessage({ type: 'result', inferMs: performance.now() - t, face, cx, width })
  }
}
