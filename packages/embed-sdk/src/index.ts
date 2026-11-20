// hx embed SDK: one <script> tag inside the prototype page (AI demo or live site). It sends interaction events to
// the participant app (parent window) with postMessage, in the same interaction_event schema as the Figma adapter.
//
//   <script src="hx-embed.js" data-parent-origin="https://app.example"></script>
//   AI demo prompt note: "Add data-step='<name>' to each screen's root element and include this script."
//
// Privacy: form values are never read into messages (only edit/delete counts), no text content, no keystrokes.
// Mobile-ready: pointerType (mouse/touch/pen), viewport and orientation on every event; a tap is a 'click'.
import { EMBED_SOURCE, RageClickDetector, SCHEMA_VERSION, type EmbedMessage, type InteractionType, type PointerKind } from '@hx/core'
import { inputChangeKind, normalizedPoint, orientationOf, screenKeyOf, selectorOf, throttle, type ElLike } from './pure'

export interface EmbedOptions {
  /** Origin of the participant app; messages go only there. */
  parentOrigin: string
  streamId?: string
  /** No DOM change or URL change within this time after a click = dead click (handoff: 300 ms). */
  deadClickMs?: number
  moveThrottleMs?: number
}

export function startEmbed(o: EmbedOptions): () => void {
  const deadMs = o.deadClickMs ?? 300
  const moveOk = throttle(o.moveThrottleMs ?? 100)
  const scrollOk = throttle(150)
  const rage = new RageClickDetector()
  const lengths = new WeakMap<EventTarget, number>()
  let lastPointer: PointerKind | undefined
  let mutations = 0
  let lastScrollY = window.scrollY
  const now = (): number => performance.timeOrigin + performance.now()
  let screenKey = screenKeyOf(null, location.pathname)

  const send = (type: InteractionType, payload?: Record<string, unknown>, at = now(), key = screenKey): void => {
    const msg: EmbedMessage = {
      source: EMBED_SOURCE,
      v: SCHEMA_VERSION,
      type,
      at,
      screenKey: key,
      ...(payload ? { payload } : {}),
      ...(lastPointer ? { pointerType: lastPointer } : {}),
      viewport: { w: window.innerWidth, h: window.innerHeight },
      orientation: orientationOf(window.innerWidth, window.innerHeight),
      ...(o.streamId ? { streamId: o.streamId } : {})
    }
    window.parent.postMessage(msg, o.parentOrigin)
  }

  // Screen changes: data-step appearing/changing, or the URL path changing (SPA routes included).
  const currentKey = (): string => {
    const stepEl = document.querySelector('[data-step]') as unknown as ElLike | null
    return screenKeyOf(stepEl, location.pathname)
  }
  const checkScreen = (): void => {
    const k = currentKey()
    if (k !== screenKey) {
      const from = screenKey
      screenKey = k
      send('screen', { from })
    }
  }
  const mo = new MutationObserver(() => {
    mutations++
    checkScreen()
  })
  mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true })

  const onPointerDown = (e: PointerEvent): void => {
    lastPointer = (['mouse', 'touch', 'pen'] as const).find((p) => p === e.pointerType) ?? lastPointer
  }
  const onPointerMove = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') return // no hover on touch: no cursor signals
    lastPointer = e.pointerType === 'pen' ? 'pen' : 'mouse'
    if (moveOk(e.timeStamp)) send('pointer-move', { x: Math.round(e.clientX), y: Math.round(e.clientY) })
  }
  const onClick = (e: MouseEvent): void => {
    const at = now()
    const key = screenKey
    const x = Math.round(e.clientX)
    const y = Math.round(e.clientY)
    const selector = selectorOf(e.target as unknown as ElLike)
    // Normalised to the data-step root (or the viewport) for a future reference image; never a screenshot.
    const root = (e.target as Element | null)?.closest?.('[data-step]') ?? document.documentElement
    const rect = root === document.documentElement ? { left: 0, top: 0, width: innerWidth, height: innerHeight } : root.getBoundingClientRect()
    const norm = normalizedPoint(e.clientX, e.clientY, rect)
    send('click', { x, y, selector, ...(norm ?? {}) }, at, key)
    if (rage.push({ t: at / 1000, x, y, ...(lastPointer ? { pointerType: lastPointer } : {}) })) send('rage-click', { x, y, selector }, at, key)
    const m0 = mutations
    const url0 = location.href
    window.setTimeout(() => {
      if (mutations === m0 && location.href === url0) send('dead-click', { x, y, selector }, at, key)
    }, deadMs)
  }
  const onFocusIn = (e: FocusEvent): void => {
    const t = e.target as HTMLInputElement | null
    if (t && 'value' in t) lengths.set(t, String(t.value ?? '').length)
  }
  const onInput = (e: Event): void => {
    const t = e.target as HTMLInputElement | null
    if (!t || !('value' in t)) return
    const next = String(t.value ?? '').length
    const prev = lengths.get(t) ?? 0
    lengths.set(t, next)
    send(inputChangeKind(prev, next, (e as InputEvent).inputType), { field: selectorOf(t as unknown as ElLike) })
  }
  const onScroll = (): void => {
    if (!scrollOk(performance.now())) return
    const y = Math.round(window.scrollY)
    send('scroll', { y, dy: y - lastScrollY })
    lastScrollY = y
  }
  const onVisibility = (): void => send('visibility', { hidden: document.visibilityState === 'hidden' })
  const onError = (e: ErrorEvent): void => send('js-error', { message: String(e.message).slice(0, 200) })
  const onPop = (): void => checkScreen()

  window.addEventListener('pointerdown', onPointerDown, true)
  window.addEventListener('pointermove', onPointerMove, true)
  window.addEventListener('click', onClick, true)
  window.addEventListener('focusin', onFocusIn, true)
  window.addEventListener('input', onInput, true)
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('popstate', onPop)
  window.addEventListener('hashchange', onPop)
  window.addEventListener('error', onError)
  document.addEventListener('visibilitychange', onVisibility)
  screenKey = currentKey()
  send('screen', {})

  return () => {
    mo.disconnect()
    window.removeEventListener('pointerdown', onPointerDown, true)
    window.removeEventListener('pointermove', onPointerMove, true)
    window.removeEventListener('click', onClick, true)
    window.removeEventListener('focusin', onFocusIn, true)
    window.removeEventListener('input', onInput, true)
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('popstate', onPop)
    window.removeEventListener('hashchange', onPop)
    window.removeEventListener('error', onError)
    document.removeEventListener('visibilitychange', onVisibility)
  }
}

/** What the participant's device can measure; the app passes this to core (missing signals are excluded). */
export function detectHover(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(hover: hover)').matches
}

// Auto-start when loaded as a plain <script> with data-parent-origin.
const script = typeof document !== 'undefined' ? (document.currentScript as HTMLScriptElement | null) : null
const origin = script?.dataset.parentOrigin
if (origin) startEmbed({ parentOrigin: origin, ...(script?.dataset.streamId ? { streamId: script.dataset.streamId } : {}) })
