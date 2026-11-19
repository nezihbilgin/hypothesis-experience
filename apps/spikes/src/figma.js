import { $, clientId, download, envInfo, load, save } from './env.js'

const WANT = ['INITIAL_LOAD', 'PRESENTED_NODE_CHANGED', 'MOUSE_PRESS_OR_RELEASE', 'NEW_STATE']
// Seeing either of these means the viewer was blocked (login wall / password), which is itself a spike answer.
const BLOCKERS = ['LOGIN_SCREEN_SHOWN', 'PASSWORD_SCREEN_SHOWN']
const counts = {}
const events = []
let handledSeen = { true: 0, false: 0, missing: 0 }
let t0 = performance.now()

$('#url').value = load('hx.figma.url')
$('#cid').value = clientId()

export function toEmbedUrl(raw, clientId, host) {
  const u = new URL(raw)
  if (!/(^|\.)figma\.com$/.test(u.hostname)) throw new Error('figma.com linki değil')
  u.hostname = 'embed.figma.com'
  u.searchParams.set('embed-host', host)
  if (clientId) u.searchParams.set('client-id', clientId)
  u.searchParams.set('hide-ui', '1')
  return u.toString()
}

function render() {
  const rows = WANT.map((k) => {
    const n = counts[k] ?? 0
    return `<tr><td>${k}</td><td class="${n ? 'ok' : 'bad'}">${n ? `geldi (${n})` : 'gelmedi'}</td></tr>`
  })
  rows.push(`<tr><td>MOUSE…handled</td><td>true: ${handledSeen.true}, false: ${handledSeen.false}, alan yok: ${handledSeen.missing}</td></tr>`)
  for (const k of BLOCKERS) if (counts[k]) rows.push(`<tr><td>${k}</td><td class="bad">göründü (${counts[k]}): izleyici engellendi</td></tr>`)
  const other = Object.keys(counts).filter((k) => !WANT.includes(k) && !BLOCKERS.includes(k))
  if (other.length) rows.push(`<tr><td>Diğer</td><td>${other.map((k) => `${k} (${counts[k]})`).join(', ')}</td></tr>`)
  $('#checks').innerHTML = rows.join('')
}

window.addEventListener('message', (e) => {
  if (!/^https:\/\/([a-z0-9-]+\.)*figma\.com$/.test(e.origin)) return
  // Figma's internal frame plumbing ({ command: 'calculateSubFramePositioning', ... }) is not an Embed API event.
  if (e.data && typeof e.data === 'object' && 'command' in e.data && !('type' in e.data)) return
  // Some events (e.g. LOGIN_SCREEN_SHOWN) arrive as a bare string, not { type, data }.
  const type = typeof e.data === 'string' ? e.data : e.data?.type ?? '(tipsiz)'
  counts[type] = (counts[type] ?? 0) + 1
  if (type === 'MOUSE_PRESS_OR_RELEASE') {
    const h = e.data?.data?.handled
    if (h === true) handledSeen.true++
    else if (h === false) handledSeen.false++
    else handledSeen.missing++
  }
  const t = Math.round(performance.now() - t0)
  events.push({ t, origin: e.origin, data: e.data })
  $('#log').textContent = `${t} ms ${e.origin} ${JSON.stringify(e.data)}\n` + $('#log').textContent
  render()
})

$('#go').onclick = () => {
  try {
    save('hx.figma.url', $('#url').value.trim())
    save('hx.figma.cid', $('#cid').value.trim())
    const src = toEmbedUrl($('#url').value.trim(), $('#cid').value.trim(), location.hostname || 'localhost')
    $('#embedUrl').textContent = src
    for (const k of Object.keys(counts)) delete counts[k]
    events.length = 0
    handledSeen = { true: 0, false: 0, missing: 0 }
    t0 = performance.now()
    $('#log').textContent = ''
    $('#frame').src = src
    render()
  } catch (err) {
    $('#embedUrl').textContent = 'Hata: ' + err.message
  }
}

$('#dl').onclick = () =>
  download(`spike1-figma-${$('#loggedOut').checked ? 'oturumsuz' : 'oturumlu'}-${Date.now()}.json`, {
    spike: 'figma-embed-events',
    loggedOut: $('#loggedOut').checked,
    clientIdSet: !!$('#cid').value.trim(),
    embedUrl: $('#embedUrl').textContent,
    counts,
    handled: handledSeen,
    events: events.slice(0, 500),
    env: envInfo()
  })
render()
