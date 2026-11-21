// Think-aloud spike: Whisper on the participant's device (transformers.js + onnxruntime-web, WebGPU or wasm).
// Audio arrives as Float32 PCM (16 kHz) in messages, is transcribed and the buffer is zeroed right after.
// Model and runtime files come from this origin only (public/models.local, public/vendor.local); remote
// model download and the default CDN wasm paths are switched off, so nothing leaves the device.
let pipe = null
let lib = null

async function load({ model, device, dtype }) {
  lib ??= await import(/* @vite-ignore */ '/vendor.local/transformers.min.js')
  const { env, pipeline } = lib
  env.allowRemoteModels = false
  env.allowLocalModels = true
  env.localModelPath = '/models.local/'
  env.useBrowserCache = false
  env.backends.onnx.wasm.wasmPaths = '/vendor.local/ort/'
  const t0 = performance.now()
  pipe = await pipeline('automatic-speech-recognition', `onnx-community/${model}`, { device, dtype })
  return { loadMs: Math.round(performance.now() - t0) }
}

async function transcribe({ id, audio, language, offsetSec }) {
  const t0 = performance.now()
  const out = await pipe(audio, { language, task: 'transcribe', chunk_length_s: 30, stride_length_s: 5, return_timestamps: true })
  const ms = Math.round(performance.now() - t0)
  const seconds = audio.length / 16000
  audio.fill(0) // the PCM copy in this worker is wiped right after use
  const chunks = (out.chunks ?? [{ text: out.text, timestamp: [0, seconds] }]).map((c) => ({ text: c.text, start: (c.timestamp?.[0] ?? 0) + offsetSec, end: (c.timestamp?.[1] ?? seconds) + offsetSec }))
  return { id, ms, seconds, text: out.text, chunks }
}

self.onmessage = async (e) => {
  const m = e.data
  try {
    if (m.type === 'load') self.postMessage({ type: 'loaded', ...(await load(m)) })
    else if (m.type === 'transcribe') self.postMessage({ type: 'result', ...(await transcribe(m)) })
  } catch (err) {
    self.postMessage({ type: 'error', id: m.id, error: String(err?.stack ?? err) })
  }
}
