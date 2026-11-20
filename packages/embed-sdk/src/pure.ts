// DOM-free helpers of the embed SDK (unit-tested in Node). They take minimal element-like objects.

export interface ElLike {
  tagName: string
  id?: string
  parentElement: ElLike | null
  getAttribute(name: string): string | null
}

/** screenKey: nearest ancestor's data-step wins, otherwise the URL path (handoff: "data-step öncelikli"). */
export function screenKeyOf(el: ElLike | null, pathname: string): string {
  for (let e = el; e; e = e.parentElement) {
    const step = e.getAttribute('data-step')
    if (step) return step
  }
  return pathname || '/'
}

/** Short, stable selector for a click target: #id, [data-step]/[data-testid], else tag path (max 4 levels). No text, no values. */
export function selectorOf(el: ElLike | null): string {
  const parts: string[] = []
  for (let e = el, depth = 0; e && depth < 4; e = e.parentElement, depth++) {
    const tag = e.tagName.toLowerCase()
    if (e.id) {
      parts.unshift(`${tag}#${e.id}`)
      break
    }
    const testId = e.getAttribute('data-testid')
    if (testId) {
      parts.unshift(`${tag}[data-testid="${testId}"]`)
      break
    }
    const step = e.getAttribute('data-step')
    parts.unshift(step ? `${tag}[data-step="${step}"]` : tag)
    if (step) break
  }
  return parts.join(' > ')
}

/** Input change kind from lengths only (the value itself is never read into a message). */
export function inputChangeKind(prevLength: number, nextLength: number, inputType?: string): 'input-edit' | 'input-delete' {
  if (inputType?.startsWith('delete')) return 'input-delete'
  return nextLength < prevLength ? 'input-delete' : 'input-edit'
}

/**
 * Click position normalised (0..1) to the screen's root element (the data-step root, or the viewport), so a
 * later reference image of that element can show it. Values outside 0..1 mean the click was outside the root.
 */
export function normalizedPoint(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }): { nx: number; ny: number } | null {
  if (!(rect.width > 0 && rect.height > 0)) return null
  const r3 = (n: number): number => Math.round(n * 1000) / 1000
  return { nx: r3((clientX - rect.left) / rect.width), ny: r3((clientY - rect.top) / rect.height) }
}

export const orientationOf = (w: number, h: number): 'portrait' | 'landscape' => (h > w ? 'portrait' : 'landscape')

/** Leaky throttle: true when at least `ms` passed since the last accepted call. */
export function throttle(ms: number): (now: number) => boolean {
  let last = -Infinity
  return (now) => {
    if (now - last < ms) return false
    last = now
    return true
  }
}
