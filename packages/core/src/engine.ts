// Generic, deterministic building blocks shared by the screen model and the Senti-compat model.
// Ported from Senti src/shared/felt.ts (MIT, Techkeyy): bucket, runs, baseline percentile, impulse/EMA curve,
// same-kind merge. Behaviour of each helper is kept identical so the compat model reproduces Senti exactly.

export const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))
export const mean = (a: number[]): number => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0)
export const median = (a: number[]): number => percentile(a, 0.5)
export const percentile = (a: number[], p: number): number => {
  if (!a.length) return 0
  const s = [...a].sort((x, y) => x - y)
  return s[Math.floor(p * (s.length - 1))]
}

export function mmss(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** One sample per whole second; on duplicates keep the one with more landmark packets. */
export function bucket<T extends { t: number; samples: number }>(samples: T[]): Map<number, T> {
  const m = new Map<number, T>()
  for (const s of samples) {
    const k = Math.floor(s.t)
    const old = m.get(k)
    if (!old || s.samples > old.samples) m.set(k, s)
  }
  return m
}

export interface Run {
  start: number
  end: number // inclusive
}

export function runs(flags: boolean[], minLen: number): Run[] {
  const out: Run[] = []
  let i = 0
  while (i < flags.length) {
    if (!flags[i]) {
      i++
      continue
    }
    let j = i
    while (j + 1 < flags.length && flags[j + 1]) j++
    if (j - i + 1 >= minLen) out.push({ start: i, end: j })
    i = j + 1
  }
  return out
}

/** Personal threshold: max(floor, 2 x baseline p95). */
export const personalThreshold = (floor: number, p95: number): number => Math.max(floor, 2 * p95)

/**
 * Impulse + asymmetric EMA curve. Each second's impulse decays linearly over `decaySec`
 * (impulses combine by max), `add[t]` is added on top, and the EMA (alpha) only applies on the way down.
 * state[t]: 'data' = compute, 'away' = force 0, 'none' = decay toward 0.
 */
export function impulseCurve(opts: {
  len: number
  impulse: number[] // 0..1 strength per second
  peak: number
  decaySec: number
  alpha: number
  add: (t: number) => number
  state: (t: number) => 'data' | 'away' | 'none'
}): number[] {
  const out: number[] = []
  let ema = 0
  for (let t = 0; t < opts.len; t++) {
    const st = opts.state(t)
    if (st === 'data') {
      let raw = 0
      for (let k = 0; k < opts.decaySec; k++) raw = Math.max(raw, opts.peak * (opts.impulse[t - k] ?? 0) * (1 - k / opts.decaySec))
      raw = clamp(raw + opts.add(t), 0, 100)
      ema = raw >= ema ? raw : ema + opts.alpha * (raw - ema)
    } else if (st === 'away') ema = 0
    else ema = ema + opts.alpha * (0 - ema)
    out.push(Math.round(clamp(ema, 0, 100) * 10) / 10)
  }
  return out
}

/** Merge overlapping/touching items of the same group key (Senti merge rule). Input need not be sorted. */
export function mergeSameKind<T extends { start: number; end: number }>(
  items: T[],
  key: (x: T) => string,
  combine: (into: T, from: T) => void
): T[] {
  const sorted = [...items].sort((a, b) => a.start - b.start)
  const merged: T[] = []
  for (const m of sorted) {
    const prev = [...merged].reverse().find((x) => key(x) === key(m))
    if (prev && m.start <= prev.end) {
      prev.end = Math.max(prev.end, m.end)
      combine(prev, m)
    } else merged.push({ ...m })
  }
  return merged
}
