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
  /** Shown to participants in questions; when missing, questions do not name the screen. */
  participantName?: string
  /** Other node ids that are state variants of this screen (same logical screen). */
  aliases?: string[]
  behavior: Behavior
  expectedSec: [number, number]
  successCriterion?: string
  note?: string
  /** Planned question asked when leaving this screen (in the new format: per task, from task.probes). */
  probe?: string
  /** Not on this task's expectedPath (new format); visiting it counts as leaving the expected path. */
  offPath?: boolean
  /** In this task's allowedScreens: an acceptable detour (not off-path, no "back" when leaving it). */
  allowed?: boolean
}

export interface StudyTask {
  id: string
  prompt: string
  /** In the order the researcher expects them; order is used to detect going back. In the new format: the
   * expectedPath screens first, then every other study screen with offPath: true. */
  screens: StudyScreen[]
  /** New format: the expected screen order for this task. Any study screen can be on several tasks' paths. */
  expectedPath?: string[]
  /** New format: acceptable detours, measured but not marked "yol dışı". */
  allowedScreens?: string[]
  /** Figma: node id the prototype starts from for this task (a flow's starting point), e.g. "26:7221".
   * Without it the link's own starting point is used. */
  startScreen?: string
  /** Screen key that means the task goal was reached. The app highlights "Done" there; it never auto-finishes. */
  targetScreen?: string
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

  // Screens: parsed the same way at study level (new format) or per task (old format).
  const parseScreens = (list: unknown, tAt: string): StudyScreen[] => {
    const screens: StudyScreen[] = []
    if (!Array.isArray(list) || list.length === 0) {
      errors.push(`${tAt}En az bir ekran (screens) tanımlanmalı.`)
      return screens
    }
    const seen = new Set<string>()
    list.forEach((raw, i) => {
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
      const participantName = optText(s.participantName)
      let aliases: string[] | undefined
      if (s.aliases !== undefined) {
        if (!Array.isArray(s.aliases) || !s.aliases.every((a) => typeof a === 'string' && a.trim())) errors.push(`${at} (${sname || '?'}): aliases metin listesi olmalı.`)
        else {
          aliases = (s.aliases as string[]).map((a) => a.trim())
          for (const a of aliases) {
            if (seen.has(a)) errors.push(`${at}: "${a}" anahtarı iki kez kullanılmış.`)
            seen.add(a)
          }
        }
      }
      screens.push({
        key,
        name: sname,
        ...(participantName ? { participantName } : {}),
        ...(aliases?.length ? { aliases } : {}),
        behavior,
        expectedSec: okRange ? [e[0] as number, e[1] as number] : [0, 0],
        ...(successCriterion ? { successCriterion } : {}),
        ...(note ? { note } : {}),
        ...(probe ? { probe } : {})
      })
    })
    return screens
  }

  // New format: screens once at study level, each task has an expectedPath; off-path screens keep their cards.
  const studyLevel = Array.isArray(o.tasks) && o.screens !== undefined
  const studyScreens = studyLevel ? parseScreens(o.screens, 'Çalışma: ') : []

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
    let screens: StudyScreen[]
    let expectedPath: string[] | undefined
    let allowedScreens: string[] | undefined
    if (studyLevel) {
      const known = new Set(studyScreens.map((x) => x.key))
      const path = Array.isArray(t.expectedPath) ? (t.expectedPath as unknown[]).filter((k): k is string => typeof k === 'string' && !!k.trim()).map((k) => k.trim()) : []
      if (!path.length) errors.push(`${tAt}expectedPath en az bir ekran anahtarı içermeli.`)
      for (const k of path) if (!known.has(k)) errors.push(`${tAt}expectedPath içindeki "${k}" tanımlı ekranlardan biri değil.`)
      const probes = isObj(t.probes) ? (t.probes as Record<string, unknown>) : {}
      if (t.probes !== undefined && !isObj(t.probes)) errors.push(`${tAt}probes bir nesne olmalı (ekran anahtarı → soru).`)
      for (const k of Object.keys(probes)) if (!known.has(k)) errors.push(`${tAt}probes içindeki "${k}" tanımlı ekranlardan biri değil.`)
      // Optional per-task card overrides: the same screen can serve another purpose in another task.
      const overrides = isObj(t.overrides) ? (t.overrides as Record<string, unknown>) : {}
      if (t.overrides !== undefined && !isObj(t.overrides)) errors.push(`${tAt}overrides bir nesne olmalı (ekran anahtarı → kart alanları).`)
      for (const [k, v] of Object.entries(overrides)) {
        if (!known.has(k)) errors.push(`${tAt}overrides içindeki "${k}" tanımlı ekranlardan biri değil.`)
        const ov = isObj(v) ? v : {}
        if (ov.behavior !== undefined && !BEHAVIORS.includes(ov.behavior as Behavior)) errors.push(`${tAt}overrides "${k}": behavior "flow", "read" ya da "decide" olmalı.`)
        const e = ov.expectedSec
        if (e !== undefined && !(Array.isArray(e) && e.length === 2 && e.every((x) => typeof x === 'number' && x >= 0) && (e[0] as number) <= (e[1] as number))) errors.push(`${tAt}overrides "${k}": expectedSec [min, max] saniye olmalı, min ≤ max.`)
      }
      const withProbe = (x: StudyScreen): StudyScreen => {
        const { probe: _ignored, ...rest } = x
        void _ignored
        const pr = optText(probes[x.key])
        const ov = isObj(overrides[x.key]) ? (overrides[x.key] as Record<string, unknown>) : {}
        return {
          ...rest,
          ...(BEHAVIORS.includes(ov.behavior as Behavior) ? { behavior: ov.behavior as Behavior } : {}),
          ...(Array.isArray(ov.expectedSec) ? { expectedSec: [ov.expectedSec[0] as number, ov.expectedSec[1] as number] as [number, number] } : {}),
          ...(optText(ov.name) ? { name: optText(ov.name)! } : {}),
          ...(optText(ov.participantName) ? { participantName: optText(ov.participantName)! } : {}),
          ...(pr ? { probe: pr } : {})
        }
      }
      // allowedScreens: acceptable detours, not on the path but not "yol dışı" either (e.g. a screen shared with
      // another task that this task may pass through).
      const allowed = Array.isArray(t.allowedScreens) ? (t.allowedScreens as unknown[]).filter((k): k is string => typeof k === 'string' && !!k.trim()).map((k) => k.trim()) : []
      for (const k of allowed) if (!known.has(k)) errors.push(`${tAt}allowedScreens içindeki "${k}" tanımlı ekranlardan biri değil.`)
      const onPath = path.map((k) => studyScreens.find((x) => x.key === k)).filter((x): x is StudyScreen => !!x).map(withProbe)
      const ok = studyScreens.filter((x) => !path.includes(x.key) && allowed.includes(x.key)).map((x) => ({ ...withProbe(x), allowed: true }))
      const off = studyScreens.filter((x) => !path.includes(x.key) && !allowed.includes(x.key)).map((x) => ({ ...withProbe(x), offPath: true }))
      screens = [...onPath, ...ok, ...off]
      if (allowed.length) allowedScreens = allowed
      expectedPath = path
    } else screens = parseScreens(t.screens, tAt)
    const startScreen = optText(t.startScreen)
    if (startScreen && !/^I?\d+:\d+$/.test(startScreen)) errors.push(`${tAt}startScreen bir Figma node id olmalı, örn. "26:7221".`)
    const targetScreen = optText(t.targetScreen)
    if (targetScreen && screens.length && !screens.some((x) => x.key === targetScreen || x.aliases?.includes(targetScreen))) errors.push(`${tAt}targetScreen "${targetScreen}" tanımlı ekranlardan biri olmalı.`)
    tasks.push({ id, prompt: prompt ?? '', screens, ...(expectedPath ? { expectedPath } : {}), ...(allowedScreens ? { allowedScreens } : {}), ...(startScreen ? { startScreen } : {}), ...(targetScreen ? { targetScreen } : {}) })
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
    ...(s.participantName ? { participantName: s.participantName } : {}),
    ...(s.aliases ? { aliases: s.aliases } : {}),
    ...(s.offPath ? { offPath: true } : {}),
    ...(s.allowed ? { allowed: true } : {}),
    order: i + 1,
    behavior: s.behavior,
    expectedSec: s.expectedSec,
    ...(s.successCriterion ? { successCriterion: s.successCriterion } : {}),
    ...(s.note ? { note: s.note } : {}),
    ...(s.probe ? { probe: s.probe } : {})
  }))
}
