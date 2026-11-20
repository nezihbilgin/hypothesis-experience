// Faz 1 page for @hx/sensing: live per-second numbers and the quality decision, then a JSON download.
import { SessionClock, absoluteNow, type SecondSample } from '@hx/core'
import { QualityProbe, SensingClient } from '@hx/sensing'
import { $, download, envInfo } from './env.js'

const DURATION = 60
const WARMUP_SEC = 3
let client: SensingClient | null = null
let samples: SecondSample[] = []
let decision: unknown = null
const errors: string[] = []
const fmt = (v: unknown): string => (v === null || v === undefined ? '–' : typeof v === 'number' ? String(Math.round(v * 100) / 100) : String(v))

function row(s: SecondSample): void {
  const tr = document.createElement('tr')
  tr.innerHTML = [s.t, s.samples, s.face ? 'evet' : 'hayır', s.headSpeedMax, s.stillness, s.faceWidthRatio, s.blinkRate, s.browDown, s.talking].map((v) => `<td>${fmt(v)}</td>`).join('')
  $('#rows').prepend(tr)
}

async function start(): Promise<void> {
  samples = []
  decision = null
  $('#rows').innerHTML = ''
  $('#quality').innerHTML = ''
  $('#start').disabled = true
  $('#status').textContent = 'Kamera ve model açılıyor…'
  const clock = new SessionClock(() => absoluteNow(performance))
  const probe = new QualityProbe(WARMUP_SEC)
  client = new SensingClient({
    createWorker: () => new Worker(new URL('../../../packages/sensing/src/worker.ts', import.meta.url), { type: 'module' }),
    assetBase: new URL('./', location.href).href,
    clock,
    audio: $('#audio').checked,
    onError: (t) => errors.push(t),
    onSample: (s) => {
      samples.push(s)
      row(s)
      if (!decision) {
        probe.push(s)
        if (probe.done) {
          const d = probe.decide()
          decision = d
          $('#quality').innerHTML = `<tr><td>Kalite kararı</td><td>${d.cameraEnabled ? 'kamera açık' : 'kamerasız mod'} (${d.reason}), medyan ${d.medianFps} fps, göz kırpma ${d.blinkEnabled ? 'açık' : d.cameraEnabled ? 'kapalı (< 15 fps)' : 'kapalı'}</td></tr>`
        }
      }
      if (s.t >= DURATION - 1) stop()
    }
  })
  try {
    await client.start()
  } catch (err) {
    $('#status').textContent = 'Başlatılamadı: ' + err
    $('#start').disabled = false
    return
  }
  clock.start()
  $('#status').textContent = `Ölçülüyor (delegate: ${client.delegate}). İlk ${WARMUP_SEC} sn GPU ısınması, sonraki 5 sn kalite kontrolü.`
  $('#stop').disabled = false
}

function stop(): void {
  client?.stop()
  client = null
  $('#stop').disabled = true
  $('#start').disabled = false
  $('#dl').disabled = false
  $('#status').textContent = `Bitti: ${samples.length} saniye.`
}

$('#start').onclick = () => void start()
// ?smoke=N: start automatically, stop after N seconds and print a summary (headless check with a fake camera).
const smoke = Number(new URLSearchParams(location.search).get('smoke') || 0)
if (smoke > 0) {
  void start()
  const timer = setInterval(() => {
    if (samples.length < smoke) return
    clearInterval(timer)
    stop()
    const out = document.createElement('pre')
    out.id = 'smoke'
    out.textContent = JSON.stringify({ delegate: client?.delegate ?? null, decision, seconds: samples.length, first: samples[0], last: samples[samples.length - 1], errors })
    document.body.append(out)
  }, 200)
}
$('#stop').onclick = stop
$('#dl').onclick = () => download(`sensing-${Date.now()}.json`, { env: envInfo(), decision, samples, errors })
