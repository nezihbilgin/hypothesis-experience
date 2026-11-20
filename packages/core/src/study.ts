// Study definition (researcher MVP: a JSON file before any UI) and its validation.
// Error messages are Turkish because the researcher reads them.
// Single-task shorthand ({ taskPrompt, screens }) is accepted and becomes one task.
import { DEFAULT_QUESTION_LIMITS, type QuestionLimits } from './questions'
import { buildCatalog, defaultScale, validateScale, type RatingScale, type TextCatalog } from './texts'
import type { Behavior, HypothesisCard } from './types'

export const DEFAULT_ORG_ID = 'default'
const BEHAVIORS: Behavior[] = ['flow', 'read', 'decide']
/** Studies in these contexts default to face signals off (decisions 2026-11-20). */
export const SENSITIVE_CONTEXTS = ['workplace', 'education'] as const
export type StudyContext = (typeof SENSITIVE_CONTEXTS)[number] | 'consumer' | 'other'

export interface StudyScreen {
  /** Figma node id, route or data-step value. */
  key: string
  name: string
  behavior: Behavior
  expectedSec: [number, number]
  successCriterion?: string
  note?: string
  /** Planned question asked when leaving this screen. */
  probe?: string
}

export interface StudyTask {
  id: string
  prompt: string
  /** In the order the researcher expects them; order is used to detect going back. */
  screens: StudyScreen[]
}

export interface QuestionPoints {
  /** Expected difficulty before each task. */
  preTaskRating: boolean
  /** SEQ right after each task. */
  postTaskRating: boolean
  /** Planned and signal-triggered questions at screen transitions. */
  atTransitions: boolean
  /** Short retro of remaining mismatches after each task. Off by default; needs limits.endOfTask > 0 too. */
  endOfTask: boolean
  /** "Hardest task" open question at the end of the session. */
  sessionEnd: boolean
  limits: QuestionLimits
}

export interface Study {
  orgId: string
  name: string
  sourceType: 'figma' | 'script'
  sourceUrl: string
  context: StudyContext
  /** Face signals (blink, brow, stillness, lean-in) as supporting signals. Participant consents separately. */
  faceSignals: boolean
  locale: string
  tasks: StudyTask[]
  scales: { expectation: RatingScale; seq: RatingScale }
  questions: QuestionPoints
  /** Participant-facing texts: defaults + this study's overrides. */
  texts: TextCatalog
}

export type ParseResult = { ok: true; study: Study } | { ok: false; errors: string[] }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const optText = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

export function parseStudy(input: unknown): ParseResult {
  const errors: string[] = []
  const o = isObj(input) ? input : {}
  const text = (k: string, label: string): string => {
    const v = optText(o[k])
    if (!v) errors.push(`${label} (${k}) boş olamaz.`)
    return v ?? ''
  }
  const name = text('name', 'Çalışma adı')
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
  const contexts: StudyContext[] = ['workplace', 'education', 'consumer', 'other']
  const context = (o.context ?? 'other') as StudyContext
  if (!contexts.includes(context)) errors.push('context "workplace", "education", "consumer" ya da "other" olmalı.')
  if (o.faceSignals !== undefined && typeof o.faceSignals !== 'boolean') errors.push('faceSignals true ya da false olmalı.')
  const faceSignals = typeof o.faceSignals === 'boolean' ? o.faceSignals : !(SENSITIVE_CONTEXTS as readonly string[]).includes(context)

  // Tasks (or single-task shorthand)
  const rawTasks: unknown[] = Array.isArray(o.tasks) ? o.tasks : o.screens !== undefined || o.taskPrompt !== undefined ? [{ id: 'task-1', prompt: o.taskPrompt, screens: o.screens }] : []
  if (!rawTasks.length) errors.push('En az bir görev (tasks) tanımlanmalı.')
  const tasks: StudyTask[] = []
  const taskIds = new Set<string>()
  const multi = Array.isArray(o.tasks)
  rawTasks.forEach((rt, ti) => {
    const t = isObj(rt) ? rt : {}
    const tAt = multi ? `Görev ${ti + 1}: ` : ''
    const id = optText(t.id) ?? `task-${ti + 1}`
    if (taskIds.has(id)) errors.push(`${tAt}"${id}" görev kimliği iki kez kullanılmış.`)
    taskIds.add(id)
    const prompt = optText(t.prompt)
    if (!prompt) errors.push(multi ? `${tAt}prompt boş olamaz.` : 'Görev metni (taskPrompt) boş olamaz.')
    const screens: StudyScreen[] = []
    if (!Array.isArray(t.screens) || t.screens.length === 0) errors.push(`${tAt}En az bir ekran (screens) tanımlanmalı.`)
    else {
      const seen = new Set<string>()
      t.screens.forEach((raw, i) => {
        const s = isObj(raw) ? raw : {}
        const at = `${tAt}Ekran ${i + 1}`
        const key = typeof s.key === 'string' ? s.key.trim() : ''
        const sname = optText(s.name) ?? key
        if (!key) errors.push(`${at}: key boş olamaz.`)
        else if (seen.has(key)) errors.push(`${at}: "${key}" anahtarı iki kez kullanılmış.`)
        seen.add(key)
        const behavior = s.behavior as Behavior
        if (!BEHAVIORS.includes(behavior)) errors.push(`${at} (${sname || '?'}): behavior "flow", "read" ya da "decide" olmalı.`)
        const e = s.expectedSec
        const okRange = Array.isArray(e) && e.length === 2 && e.every((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0) && (e[0] as number) <= (e[1] as number)
        if (!okRange) errors.push(`${at} (${sname || '?'}): expectedSec [min, max] saniye olmalı, min ≤ max.`)
        const successCriterion = optText(s.successCriterion)
        const note = optText(s.note)
        const probe = optText(s.probe)
        screens.push({
          key,
          name: sname,
          behavior,
          expectedSec: okRange ? [e[0] as number, e[1] as number] : [0, 0],
          ...(successCriterion ? { successCriterion } : {}),
          ...(note ? { note } : {}),
          ...(probe ? { probe } : {})
        })
      })
    }
    tasks.push({ id, prompt: prompt ?? '', screens })
  })

  // Texts, scales, question points
  if (o.texts !== undefined && !isObj(o.texts)) errors.push('texts bir nesne olmalı (anahtar → metin).')
  const texts = buildCatalog(isObj(o.texts) ? (o.texts as Record<string, string>) : {})
  const scalesIn = isObj(o.scales) ? o.scales : {}
  const scale = (k: 'expectation' | 'seq', label: string): RatingScale => {
    const raw = scalesIn[k]
    if (raw === undefined) return defaultScale(texts)
    const errs = validateScale(raw, label)
    errors.push(...errs)
    if (errs.length) return defaultScale(texts)
    const r = raw as { min: number; max: number; labels?: Record<string, string> }
    const labels: Record<number, string> = {}
    for (const [lk, lv] of Object.entries(r.labels ?? {})) labels[Number(lk)] = lv.trim()
    return { min: r.min, max: r.max, labels }
  }
  const scales = { expectation: scale('expectation', 'Beklenti ölçeği'), seq: scale('seq', 'SEQ ölçeği') }
  const q = isObj(o.questions) ? o.questions : {}
  const flag = (k: string, dflt = true): boolean => {
    if (q[k] !== undefined && typeof q[k] !== 'boolean') errors.push(`questions.${k} true ya da false olmalı.`)
    return typeof q[k] === 'boolean' ? (q[k] as boolean) : dflt
  }
  const lim = isObj(q.limits) ? q.limits : {}
  const limit = (k: keyof QuestionLimits): number => {
    const v = lim[k]
    if (v === undefined) return DEFAULT_QUESTION_LIMITS[k]
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
      errors.push(`questions.limits.${k} 0 ya da pozitif tam sayı olmalı.`)
      return DEFAULT_QUESTION_LIMITS[k]
    }
    return v
  }
  const questions: QuestionPoints = {
    preTaskRating: flag('preTaskRating'),
    postTaskRating: flag('postTaskRating'),
    atTransitions: flag('atTransitions'),
    endOfTask: flag('endOfTask', false),
    sessionEnd: flag('sessionEnd'),
    limits: { perTask: limit('perTask'), endOfTask: limit('endOfTask'), perSession: limit('perSession') }
  }

  if (errors.length) return { ok: false, errors }
  return {
    ok: true,
    study: {
      orgId: optText(o.orgId) ?? DEFAULT_ORG_ID,
      name,
      sourceType: sourceType as Study['sourceType'],
      sourceUrl,
      context,
      faceSignals,
      locale: optText(o.locale) ?? 'tr',
      tasks,
      scales,
      questions,
      texts
    }
  }
}

/** Hypothesis cards for one task; order follows the screens array (1-based). */
export function cardsFromTask(task: StudyTask): HypothesisCard[] {
  return task.screens.map((s, i) => ({
    screenKey: s.key,
    screenName: s.name,
    order: i + 1,
    behavior: s.behavior,
    expectedSec: s.expectedSec,
    ...(s.successCriterion ? { successCriterion: s.successCriterion } : {}),
    ...(s.note ? { note: s.note } : {}),
    ...(s.probe ? { probe: s.probe } : {})
  }))
}
