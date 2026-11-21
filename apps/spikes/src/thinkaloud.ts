// Think-aloud spike page: batch vs live on-device transcription, with optional camera analysis running at the same
// time (load measurement). Results are exposed on window.__ta for automated measurement runs.
import { SessionClock, absoluteNow, redact } from '@hx/core'
import { SensingClient } from '@hx/sensing'
import { $ } from './env.js'

type Chunk = { text: string; start: number; end: number }
type Result = { id: number; ms: number; seconds: number; text: string; chunks: Chunk[] }
const state: { loadMs?: number; results: Result[]; rafFps: number[]; sensingFps: number[]; lagSec: number[]; error?: string; done: boolean; totalMs?: number; audioSec?: number } = { results: [], rafFps: [], sensingFps: [], lagSec: [], done: false }
;(window as unknown as { __ta: typeof state }).__ta = state

let worker: Worker | null = null
let pcm: Float32Array | null = null
let sensing: SensingClient | null = null
let nextId = 0
const pending = new Map<number, (r: Result) => void>()

function stat(k: string, v: string): void {
  const tr = document.createElement('tr')
  tr.innerHTML = `<td>${k}</td><td>${v}</td>`
  $('#stats').append(tr)
}

async function ensureWorker(): Promise<void> {
  if (worker) return
  worker = new Worker(new URL('./asr-worker.js', import.meta.url), { type: 'module' })
  worker.onmessage = (e) => {
    const m = e.data
    if (m.type === 'result') pending.get(m.id)?.(m)
    if (m.type === 'error') {
      state.error = m.error
      $('#status').textContent = 'Hata: ' + m.error
    }
  }
  $('#status').textContent = 'Model yükleniyor…'
  const loaded = await new Promise<{ loadMs: number }>((ok) => {
    const prev = worker!.onmessage
    worker!.onmessage = (e) => {
      if (e.data.type === 'loaded') {
        worker!.onmessage = prev
        ok(e.data)
      } else prev?.call(worker!, e)
    }
    const model = ($('#model') as HTMLSelectElement).value
    const device = ($('#device') as HTMLSelectElement).value
    const dtype = model === 'whisper-large-v3-turbo' ? { encoder_model: 'q4f16', decoder_model_merged: 'q4f16' } : { encoder_model: 'fp16', decoder_model_merged: 'q4' }
    worker!.postMessage({ type: 'load', model, device, dtype })
  })
  state.loadMs = loaded.loadMs
  stat('Model yükleme', `${(loaded.loadMs / 1000).toFixed(1)} sn`)
}

function transcribe(audio: Float32Array, offsetSec: number): Promise<Result> {
  const id = nextId++
  return new Promise((ok) => {
    pending.set(id, ok)
    // Transfer the buffer: after this the page no longer holds this piece of audio.
    worker!.postMessage({ type: 'transcribe', id, audio, language: 'turkish', offsetSec }, [audio.buffer])
  })
}

async function decode(file: File): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, 16000, 16000)
  const buf = await ctx.decodeAudioData(await file.arrayBuffer())
  const off = new OfflineAudioContext(1, Math.ceil(buf.duration * 16000), 16000)
  const src = off.createBufferSource()
  src.buffer = buf
  src.connect(off.destination)
  src.start()
  return (await off.startRendering()).getChannelData(0).slice()
}

function show(chunks: Chunk[]): void {
  $('#out').innerHTML = chunks.map((c) => `<p><span class="lead">${c.start.toFixed(0)}–${c.end.toFixed(0)} sn</span> ${redact(c.text).text}</p>`).join('')
}

/** rAF fps per second on the main thread while transcription runs. */
function watchFps(): () => void {
  let frames = 0
  let last = performance.now()
  let on = true
  const loop = (t: number): void => {
    frames++
    if (t - last >= 1000) {
      state.rafFps.push(Math.round((frames * 1000) / (t - last)))
      frames = 0
      last = t
    }
    if (on) requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
  return () => {
    on = false
  }
}

async function startCamera(): Promise<void> {
  if (!($('#camera') as HTMLInputElement).checked || sensing) return
  const clock = new SessionClock(() => absoluteNow(performance))
  sensing = new SensingClient({
    createWorker: () => new Worker(new URL('../../../packages/sensing/src/worker.ts', import.meta.url), { type: 'module' }),
    assetBase: new URL('./', location.href).href,
    clock,
    audio: false,
    onSample: (s) => state.sensingFps.push(s.samples)
  })
  await sensing.start()
  clock.start()
}

async function run(audio: Float32Array): Promise<void> {
  state.results = []
  state.rafFps = []
  state.sensingFps = []
  state.lagSec = []
  state.done = false
  $('#stats').innerHTML = ''
  await startCamera()
  await ensureWorker()
  const stop = watchFps()
  const mode = ($('#mode') as HTMLSelectElement).value
  const seconds = audio.length / 16000
  state.audioSec = seconds
  const t0 = performance.now()
  if (mode === 'batch') {
    $('#status').textContent = 'Toplu çeviriliyor…'
    const r = await transcribe(audio, 0)
    state.results.push(r)
  } else {
    // Live: a 10 s piece becomes available every 10 s (real-time); each is transcribed as soon as it arrives.
    const PIECE = 10
    const jobs: Promise<void>[] = []
    for (let i = 0; i * PIECE < seconds; i++) {
      const at = t0 + (i + 1) * PIECE * 1000
      await new Promise((r) => setTimeout(r, Math.max(0, at - performance.now())))
      const piece = audio.slice(i * PIECE * 16000, Math.min(audio.length, (i + 1) * PIECE * 16000))
      $('#status').textContent = `Canlı: ${i * PIECE}–${(i + 1) * PIECE} sn çevriliyor…`
      jobs.push(
        transcribe(piece, i * PIECE).then((r) => {
          state.results.push(r)
          // Lag: how long after this piece ended (real time) its text was ready.
          state.lagSec.push(Math.round((performance.now() - at) / 100) / 10)
          show(state.results.flatMap((x) => x.chunks).sort((a, b) => a.start - b.start))
        })
      )
    }
    await Promise.all(jobs)
  }
  audio.fill(0) // the page's copy of the audio is wiped as well
  pcm = null
  state.totalMs = Math.round(performance.now() - t0)
  stop()
  const chunks = state.results.flatMap((x) => x.chunks).sort((a, b) => a.start - b.start)
  show(chunks)
  const procMs = state.results.reduce((a, r) => a + r.ms, 0)
  stat('Ses süresi', `${seconds.toFixed(1)} sn`)
  stat('Çevirme (işlem) süresi', `${(procMs / 1000).toFixed(1)} sn (gerçek zamanın ${(procMs / 1000 / seconds).toFixed(2)} katı)`)
  if (state.lagSec.length) stat('Canlı gecikme (parça bitişinden metne)', `medyan ${median(state.lagSec)} sn, en çok ${Math.max(...state.lagSec)} sn`)
  stat('Ana iş parçacığı fps (medyan / en düşük)', `${median(state.rafFps)} / ${Math.min(...state.rafFps)}`)
  if (state.sensingFps.length) stat('Kamera analizi fps (medyan / en düşük)', `${median(state.sensingFps)} / ${Math.min(...state.sensingFps)}`)
  state.done = true
  $('#status').textContent = 'Bitti. Ses bellekten silindi.'
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : 0
}

$('#file').addEventListener('change', async (e: Event) => {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  pcm = await decode(f)
  ;($('#run') as HTMLButtonElement).disabled = false
  $('#status').textContent = `Ses hazır: ${(pcm.length / 16000).toFixed(1)} sn (bellekte).`
})
$('#run').addEventListener('click', () => pcm && void run(pcm))

// Microphone: raw PCM collected in memory only (no MediaRecorder, nothing written anywhere).
let micCtx: AudioContext | null = null
let micParts: Float32Array[] = []
let micStream: MediaStream | null = null
$('#mic').addEventListener('click', async () => {
  micStream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })
  micCtx = new AudioContext({ sampleRate: 16000 })
  const src = micCtx.createMediaStreamSource(micStream)
  const proc = micCtx.createScriptProcessor(4096, 1, 1)
  micParts = []
  proc.onaudioprocess = (ev) => micParts.push(ev.inputBuffer.getChannelData(0).slice())
  src.connect(proc)
  proc.connect(micCtx.destination)
  ;($('#mic') as HTMLButtonElement).disabled = true
  ;($('#micstop') as HTMLButtonElement).disabled = false
  $('#status').textContent = 'Kaydediliyor (sadece bellekte)…'
})
$('#micstop').addEventListener('click', async () => {
  micStream?.getTracks().forEach((t) => t.stop())
  await micCtx?.close()
  const n = micParts.reduce((a, p) => a + p.length, 0)
  const all = new Float32Array(n)
  let o = 0
  for (const p of micParts) {
    all.set(p, o)
    o += p.length
    p.fill(0)
  }
  micParts = []
  ;($('#mic') as HTMLButtonElement).disabled = false
  ;($('#micstop') as HTMLButtonElement).disabled = true
  void run(all)
})
