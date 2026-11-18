import { $, download, envInfo } from './env.js'

const SECONDS = 15
const TYPES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4;codecs=avc1', 'video/mp4']
const support = {
  getDisplayMedia: !!navigator.mediaDevices?.getDisplayMedia,
  getUserMedia: !!navigator.mediaDevices?.getUserMedia,
  MediaRecorder: typeof MediaRecorder !== 'undefined',
  mimeTypes: typeof MediaRecorder !== 'undefined' ? TYPES.filter((t) => MediaRecorder.isTypeSupported(t)) : [],
  regionCapture_CropTarget: typeof window.CropTarget !== 'undefined',
  elementCapture_RestrictionTarget: typeof window.RestrictionTarget !== 'undefined',
  captureController: typeof window.CaptureController !== 'undefined'
}
const result = {}
$('#support').innerHTML = Object.entries(support).map(([k, v]) => `<tr><td>${k}</td><td class="${Array.isArray(v) ? (v.length ? 'ok' : 'bad') : v ? 'ok' : 'bad'}">${Array.isArray(v) ? v.join('<br>') || 'yok' : v ? 'var' : 'yok'}</td></tr>`).join('')

let raf
const t0 = performance.now()
const tick = () => { $('#ticker').textContent = ((performance.now() - t0) / 1000).toFixed(1); raf = requestAnimationFrame(tick) }
tick()

function renderResult() {
  $('#result').innerHTML = Object.entries(result).map(([k, v]) => `<tr><td>${k}</td><td>${typeof v === 'boolean' ? `<span class="${v ? 'ok' : 'bad'}">${v ? 'evet' : 'hayır'}</span>` : v}</td></tr>`).join('')
}

function record(stream, label) {
  const mimeType = support.mimeTypes[0]
  const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
  const chunks = []
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  const done = new Promise((resolve) => (rec.onstop = () => resolve(new Blob(chunks, { type: rec.mimeType }))))
  rec.onerror = (e) => { result[label + ' hata'] = String(e.error ?? e) }
  rec.start(1000)
  return { rec, done }
}

$('#start').onclick = async () => {
  $('#start').disabled = true
  for (const k of Object.keys(result)) delete result[k]
  let tab, cam
  try {
    const opts = { video: { displaySurface: 'browser', frameRate: 15 }, audio: false, preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude' }
    tab = await navigator.mediaDevices.getDisplayMedia(opts)
    const s = tab.getVideoTracks()[0].getSettings()
    result['Sekme izni'] = true
    result['Seçilen yüzey'] = s.displaySurface ?? 'bilinmiyor'
    result['Sekme çözünürlüğü'] = `${s.width}x${s.height} @ ${s.frameRate ?? '?'} fps`
  } catch (err) { result['Sekme izni'] = false; result['Sekme hata'] = err.name + ': ' + err.message }
  try {
    cam = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: true })
    result['Kamera + mikrofon izni'] = true
  } catch (err) { result['Kamera + mikrofon izni'] = false; result['Kamera hata'] = err.name + ': ' + err.message }
  renderResult()
  const recs = []
  if (tab) recs.push(['Sekme', record(tab, 'Sekme'), tab, '#vTab'])
  if (cam) recs.push(['Kamera', record(cam, 'Kamera'), cam, '#vCam'])
  result['Aynı anda kayıt'] = recs.length === 2
  renderResult()
  await new Promise((r) => setTimeout(r, SECONDS * 1000))
  for (const [, r] of recs) if (r.rec.state !== 'inactive') r.rec.stop()
  for (const [label, r, stream, sel] of recs) {
    const blob = await r.done
    stream.getTracks().forEach((t) => t.stop())
    result[label + ' dosya'] = `${(blob.size / 1024).toFixed(0)} KB, ${blob.type}`
    result[label + ' kayıt başarılı'] = blob.size > 10_000
    $(sel).src = URL.createObjectURL(blob)
  }
  renderResult()
  $('#start').disabled = false
  $('#dl').disabled = false
}
$('#dl').onclick = () => download(`spike4-record-${Date.now()}.json`, { spike: 'tab-record-plus-camera', support, result, env: envInfo() })
window.__hx = { support, result }
