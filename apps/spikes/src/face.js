import { $, clientId, download, envInfo, load, pct, save } from './env.js'

const DURATION = 60
const TARGET_FPS = 15
let worker, stream, running = false, busy = false
let perSecond = [], inferMs = [], faceFrames = 0, frames = 0, longFrames = 0, maxGap = 0
let secFrames = 0, secStart = 0, startedAt = 0, info = {}, logs = []
$('#url').value = load('hx.figma.url')

function toEmbed(raw) {
  try {
    const u = new URL(raw)
    if (!/(^|\.)figma\.com$/.test(u.hostname)) return raw
    u.hostname = 'embed.figma.com'
    u.searchParams.set('embed-host', location.hostname || 'localhost')
    const cid = clientId()
    if (cid) u.searchParams.set('client-id', cid)
    return u.toString()
  } catch { return '' }
}

function summary() {
  const steady = perSecond.slice(3) // ilk 3 sn ısınma
  return {
    medianFps: pct(steady, 0.5),
    p10Fps: pct(steady, 0.1),
    inferP50: Math.round(pct(inferMs, 0.5) * 10) / 10,
    inferP95: Math.round(pct(inferMs, 0.95) * 10) / 10,
    faceRate: frames ? Math.round((faceFrames / frames) * 100) : 0,
    longFrames,
    maxMainGapMs: Math.round(maxGap),
    seconds: perSecond.length
  }
}

function render() {
  const s = summary()
  $('#fps').innerHTML = `<span class="${s.medianFps >= 10 ? 'ok' : 'bad'}">${s.medianFps} fps</span> <span class="lead" style="font-size:14px">medyan</span>`
  const rows = [
    ['Delegate', info.delegate ?? '–'], ['Model yükleme', info.loadMs ? info.loadMs + ' ms' : '–'],
    ['fps p10 (en kötü %10)', s.p10Fps], ['Çıkarım süresi p50 / p95', `${s.inferP50} / ${s.inferP95} ms`],
    ['Yüz bulunan kare', s.faceRate + '%'], ['Ana thread takılma (>50 ms kare)', s.longFrames],
    ['En uzun ana thread boşluğu', s.maxMainGapMs + ' ms'], ['Süre', `${s.seconds} / ${DURATION} sn`]
  ]
  $('#stats').innerHTML = rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')
}

async function start() {
  save('hx.figma.url', $('#url').value.trim())
  if ($('#url').value.trim()) $('#frame').src = toEmbed($('#url').value.trim())
  perSecond = []; inferMs = []; faceFrames = frames = longFrames = maxGap = 0; logs = []
  $('#start').disabled = true
  stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, frameRate: 30 }, audio: false })
  const video = $('#video')
  video.srcObject = stream
  await video.play()
  worker = new Worker(new URL('./face-worker.js', import.meta.url), { type: 'module' })
  const base = new URL('./', location.href).href
  await new Promise((resolve, reject) => {
    worker.onmessage = (e) => {
      if (e.data.type === 'ready') { info = e.data; resolve() }
      else if (e.data.type === 'error') reject(new Error(e.data.text))
      else if (e.data.type === 'log') logs.push(e.data.text)
    }
    worker.postMessage({ type: 'init', base, cpu: $('#cpu').checked })
  })
  worker.onmessage = (e) => {
    if (e.data.type === 'log') return logs.push(e.data.text)
    busy = false
    frames++; secFrames++
    if (e.data.face) faceFrames++
    inferMs.push(e.data.inferMs)
  }
  running = true
  $('#stop').disabled = false
  startedAt = secStart = performance.now()
  const interval = 1000 / TARGET_FPS
  let last = 0
  const tick = async () => {
    if (!running) return
    const now = performance.now()
    if (now - secStart >= 1000) {
      perSecond.push(secFrames); secFrames = 0; secStart += 1000; render()
      if (perSecond.length >= DURATION) return stop()
    }
    if (!busy && now - last >= interval && video.readyState >= 2) {
      busy = true; last = now
      const bitmap = await createImageBitmap(video)
      worker.postMessage({ type: 'frame', bitmap, ts: now }, [bitmap])
    }
    setTimeout(tick, 5)
  }
  tick()
  let prev = performance.now()
  const raf = (t) => {
    if (!running) return
    const gap = t - prev; prev = t
    if (gap > 50) longFrames++
    maxGap = Math.max(maxGap, gap)
    requestAnimationFrame(raf)
  }
  requestAnimationFrame(raf)
}

function stop() {
  running = false
  stream?.getTracks().forEach((t) => t.stop())
  worker?.terminate()
  $('#start').disabled = false; $('#stop').disabled = true; $('#dl').disabled = false
  render()
}

$('#start').onclick = () => start().catch((err) => { alertBox(err); stop() })
$('#stop').onclick = stop
$('#dl').onclick = () => download(`spike2-face-${Date.now()}.json`, {
  spike: 'facelandmarker-fps', targetFps: TARGET_FPS, withIframe: !!$('#url').value.trim(), forcedCpu: $('#cpu').checked,
  ...info, summary: summary(), perSecond, logs, env: envInfo()
})
function alertBox(err) { $('#fps').innerHTML = `<span class="bad">Hata: ${err.message ?? err}</span>` }
window.__hx = { summary, info: () => info }
render()
