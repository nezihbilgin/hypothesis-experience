// Study definition (researcher MVP: a JSON file before any UI) and its validation.
// Error messages are Turkish because the researcher reads them.
import type { Behavior, HypothesisCard } from './types'

export const DEFAULT_ORG_ID = 'default'
const BEHAVIORS: Behavior[] = ['flow', 'read', 'decide']

export interface StudyScreen {
  /** Figma node id, route or data-step value. */
  key: string
  name: string
  behavior: Behavior
  expectedSec: [number, number]
  successCriterion?: string
  note?: string
}

export interface Study {
  orgId: string
  name: string
  sourceType: 'figma' | 'script'
  sourceUrl: string
  taskPrompt: string
  /** In the order the researcher expects them; order is used to detect going back. */
  screens: StudyScreen[]
}

export type ParseResult = { ok: true; study: Study } | { ok: false; errors: string[] }

export function parseStudy(input: unknown): ParseResult {
  const errors: string[] = []
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const text = (k: string, label: string): string => {
    const v = o[k]
    if (typeof v !== 'string' || !v.trim()) {
      errors.push(`${label} (${k}) boş olamaz.`)
      return ''
    }
    return v.trim()
  }
  const name = text('name', 'Çalışma adı')
  const taskPrompt = text('taskPrompt', 'Görev metni')
  const sourceUrl = text('sourceUrl', 'Prototip linki')
  const sourceType = o.sourceType
  if (sourceType !== 'figma' && sourceType !== 'script') errors.push('sourceType "figma" ya da "script" olmalı.')
  if (sourceUrl) {
    let host = ''
    try {
      const u = new URL(sourceUrl)
      if (u.protocol !== 'https:' && u.hostname !== 'localhost') errors.push('Prototip linki https ile başlamalı.')
      host = u.hostname
    } catch {
      errors.push(`Prototip linki geçerli bir adres değil: ${sourceUrl}`)
    }
    if (sourceType === 'figma' && host && !/(^|\.)figma\.com$/.test(host)) errors.push('Figma çalışmasında link figma.com adresi olmalı.')
  }

  const screens: StudyScreen[] = []
  if (!Array.isArray(o.screens) || o.screens.length === 0) errors.push('En az bir ekran (screens) tanımlanmalı.')
  else {
    const seen = new Set<string>()
    o.screens.forEach((raw, i) => {
      const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
      const at = `Ekran ${i + 1}`
      const key = typeof s.key === 'string' ? s.key.trim() : ''
      const sname = typeof s.name === 'string' && s.name.trim() ? s.name.trim() : key
      if (!key) errors.push(`${at}: key boş olamaz.`)
      else if (seen.has(key)) errors.push(`${at}: "${key}" anahtarı iki kez kullanılmış.`)
      seen.add(key)
      const behavior = s.behavior as Behavior
      if (!BEHAVIORS.includes(behavior)) errors.push(`${at} (${sname || '?'}): behavior "flow", "read" ya da "decide" olmalı.`)
      const e = s.expectedSec
      const okRange = Array.isArray(e) && e.length === 2 && e.every((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0) && (e[0] as number) <= (e[1] as number)
      if (!okRange) errors.push(`${at} (${sname || '?'}): expectedSec [min, max] saniye olmalı, min ≤ max.`)
      screens.push({
        key,
        name: sname,
        behavior,
        expectedSec: okRange ? [e[0] as number, e[1] as number] : [0, 0],
        ...(typeof s.successCriterion === 'string' && s.successCriterion.trim() ? { successCriterion: s.successCriterion.trim() } : {}),
        ...(typeof s.note === 'string' && s.note.trim() ? { note: s.note.trim() } : {})
      })
    })
  }
  if (errors.length) return { ok: false, errors }
  const orgId = typeof o.orgId === 'string' && o.orgId ? o.orgId : DEFAULT_ORG_ID
  return { ok: true, study: { orgId, name, sourceType: sourceType as Study['sourceType'], sourceUrl, taskPrompt, screens } }
}

/** Hypothesis cards for the report model; order follows the screens array (1-based). */
export function cardsFromStudy(study: Study): HypothesisCard[] {
  return study.screens.map((s, i) => ({
    screenKey: s.key,
    screenName: s.name,
    order: i + 1,
    behavior: s.behavior,
    expectedSec: s.expectedSec,
    ...(s.successCriterion ? { successCriterion: s.successCriterion } : {}),
    ...(s.note ? { note: s.note } : {})
  }))
}
