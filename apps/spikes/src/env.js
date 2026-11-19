export function envInfo() {
  let gpu = 'unknown'
  try {
    const gl = document.createElement('canvas').getContext('webgl')
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info')
    gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl ? gl.getParameter(gl.RENDERER) : 'no webgl'
  } catch {}
  return {
    userAgent: navigator.userAgent,
    platform: navigator.userAgentData?.platform ?? navigator.platform,
    cores: navigator.hardwareConcurrency ?? null,
    memoryGB: navigator.deviceMemory ?? null,
    gpu,
    screen: `${screen.width}x${screen.height}@${devicePixelRatio}`,
    secureContext: isSecureContext,
    at: new Date().toISOString()
  }
}
export function download(name, obj) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }))
  a.download = name
  a.click()
}
export const $ = (s) => document.querySelector(s)
export const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(p * (s.length - 1))] }
export const save = (k, v) => { try { localStorage.setItem(k, v) } catch {} }
export const load = (k) => { try { return localStorage.getItem(k) ?? '' } catch { return '' } }

// Figma OAuth app client-id (public: it appears in every embed URL). Company-plan app since 2026-11-19.
export const DEFAULT_CLIENT_ID = 'jq77fE5G89W5KAxgriPyAd'
const RETIRED_CLIENT_IDS = ['fXJbAQXtLCtwkR6egPY7YX'] // free-plan app: its files could not be shared publicly
export function clientId() {
  const v = load('hx.figma.cid')
  return v && !RETIRED_CLIENT_IDS.includes(v) ? v : DEFAULT_CLIENT_ID
}

// Test prototype (link-shared company file) prefilled so a second machine only needs the page address.
export const DEFAULT_PROTO_URL = 'https://www.figma.com/proto/3QmbkTQZoS3UIZ08CDeRQh/Untitled?node-id=2-4145&viewport=1062%2C1243%2C0.23&t=IGj1RdNk6lvjTW0c-0&scaling=min-zoom&content-scaling=fixed&starting-point-node-id=2%3A4145'
export const protoUrl = () => new URLSearchParams(location.search).get('url') || load('hx.figma.url') || DEFAULT_PROTO_URL
