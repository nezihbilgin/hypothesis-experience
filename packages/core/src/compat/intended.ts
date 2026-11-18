// Linear interpolation of a point curve; flat before the first and after the last point. (Senti intendedAt.)
export function intendedAt(points: { t: number; level: number }[], t: number): number {
  if (!points.length) return 0
  const p = [...points].sort((a, b) => a.t - b.t)
  if (t <= p[0].t) return p[0].level
  if (t >= p[p.length - 1].t) return p[p.length - 1].level
  for (let i = 1; i < p.length; i++) {
    if (t <= p[i].t) {
      const a = p[i - 1]
      const b = p[i]
      return b.t === a.t ? b.level : a.level + ((b.level - a.level) * (t - a.t)) / (b.t - a.t)
    }
  }
  return p[p.length - 1].level
}
