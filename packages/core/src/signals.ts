// Interaction signals derived from raw clicks. Shared by the Figma adapter and embed-sdk so both sources
// write the same interaction_event schema.

/** interaction_event schema version. 2 = mobile-ready fields (pointerType, viewport, orientation, streamId). */
export const SCHEMA_VERSION = 2

export const RAGE_WINDOW_MS = 1000
export const RAGE_MIN_CLICKS = 3
/** "Same area": every click of the burst within this distance (px) of the burst's first click. Taps land less
 * precisely than a mouse, so touch uses a larger radius. */
export const RAGE_RADIUS_PX = 40
export const RAGE_RADIUS_TOUCH_PX = 60

export interface ClickPoint {
  /** Seconds. */
  t: number
  x: number
  y: number
  pointerType?: 'mouse' | 'touch' | 'pen'
  /** When the source gives no position (x = y = NaN), "same area" falls back to the same target element. */
  target?: string
}

/**
 * Streaming rage-click detector: 3+ clicks or taps within 1 s in the same area. Emits once per burst, on the click that
 * reaches the minimum; further clicks in the same burst do not emit again.
 */
export class RageClickDetector {
  private burst: ClickPoint[] = []
  private fired = false

  /** Returns true when this click completes a rage-click burst. */
  push(c: ClickPoint): boolean {
    const first = this.burst[0]
    const noPos = !Number.isFinite(c.x) || !Number.isFinite(c.y) || first === undefined || !Number.isFinite(first.x) || !Number.isFinite(first.y)
    const sameArea =
      first !== undefined && (noPos ? c.target !== undefined && c.target === first.target : Math.hypot(c.x - first.x, c.y - first.y) <= (c.pointerType === 'touch' ? RAGE_RADIUS_TOUCH_PX : RAGE_RADIUS_PX))
    const sameBurst = first !== undefined && c.t - first.t <= RAGE_WINDOW_MS / 1000 && sameArea
    if (!sameBurst) {
      this.burst = [c]
      this.fired = false
      return false
    }
    this.burst.push(c)
    if (!this.fired && this.burst.length >= RAGE_MIN_CLICKS) {
      this.fired = true
      return true
    }
    return false
  }
}
