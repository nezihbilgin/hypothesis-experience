// Session clock (decisions 2026-11-20 item 6, Faz 0 decision 5): one clock for every stream, built on
// performance.now() + timeOrigin, zero at task start, paused while a question is on screen so the screen's
// measurement closes before the question begins. Pure: the caller injects `now` (milliseconds, monotonic).

export class SessionClock {
  private zeroMs: number | null = null
  private pausedAt: number | null = null
  private pausedTotal = 0

  constructor(private readonly now: () => number) {}

  /** Sets t = 0 (task start). Calling again starts a new task from zero. */
  start(): void {
    this.zeroMs = this.now()
    this.pausedAt = null
    this.pausedTotal = 0
  }

  get started(): boolean {
    return this.zeroMs !== null
  }

  get paused(): boolean {
    return this.pausedAt !== null
  }

  pause(): void {
    if (this.zeroMs !== null && this.pausedAt === null) this.pausedAt = this.now()
  }

  resume(): void {
    if (this.pausedAt !== null) {
      this.pausedTotal += this.now() - this.pausedAt
      this.pausedAt = null
    }
  }

  /** Session seconds for an absolute timestamp in the same time base as `now` (a frame or event time from the current
   * running stretch; timestamps from before an earlier pause are not re-mapped). */
  at(absMs: number): number {
    if (this.zeroMs === null) return 0
    const end = this.pausedAt !== null ? Math.min(absMs, this.pausedAt) : absMs
    return (end - this.zeroMs - this.pausedTotal) / 1000
  }

  /** Current session seconds. */
  t(): number {
    return this.at(this.now())
  }
}

/** Absolute milliseconds shared across windows/workers: performance.timeOrigin + performance.now(). */
export const absoluteNow = (perf: { timeOrigin: number; now(): number }): number => perf.timeOrigin + perf.now()

/**
 * Moves a stream's timestamps onto the session clock (per-stream offset, decisions 2026-11-20 item 6).
 * Items whose streamId has no StreamInfo are returned unchanged (offset 0).
 */
export function alignToSession<T extends { t: number; streamId?: string }>(items: T[], streams: { streamId: string; offsetSec: number }[]): T[] {
  const off = new Map(streams.map((s) => [s.streamId, s.offsetSec]))
  return items.map((x) => {
    const o = x.streamId !== undefined ? off.get(x.streamId) ?? 0 : 0
    return o ? { ...x, t: Math.round((x.t + o) * 1000) / 1000 } : x
  })
}
