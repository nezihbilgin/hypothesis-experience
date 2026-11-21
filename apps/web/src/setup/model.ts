// Setup screen model (v0): the editor works directly on the study JSON in the study-level format (decisions
// 2026-11-20/21), so what you build is exactly the file the app reads. Pure helpers, unit-tested.
import type { Behavior } from '@hx/core'

export interface EditorScreen {
  key: string
  name: string
  participantName?: string
  behavior: Behavior
  expectedSec: [number, number]
  aliases?: string[]
  successCriterion?: string
  note?: string
}

export interface EditorOverride {
  behavior?: Behavior
  expectedSec?: [number, number]
  name?: string
  participantName?: string
}

export interface EditorTask {
  id: string
  prompt: string
  startScreen?: string
  targetScreen?: string
  expectedPath: string[]
  allowedScreens?: string[]
  probes?: Record<string, string>
  overrides?: Record<string, EditorOverride>
}

export interface EditorStudy {
  name: string
  sourceType: 'figma' | 'script'
  sourceUrl: string
  context: 'workplace' | 'education' | 'consumer' | 'other'
  faceSignals: boolean
  screens: EditorScreen[]
  tasks: EditorTask[]
  [extra: string]: unknown
}

export const emptyStudy = (): EditorStudy => ({ name: '', sourceType: 'figma', sourceUrl: '', context: 'other', faceSignals: true, screens: [], tasks: [] })

/**
 * Loads any study JSON into the editor. The old per-task format is converted to study-level screens + expectedPath
 * (+ probes, + overrides where a screen differs between tasks), as done by hand for the pilot study.
 */
export function toEditor(json: unknown): EditorStudy {
  const o = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>
  const base = { ...emptyStudy(), ...o } as EditorStudy
  if (Array.isArray(o.screens) && Array.isArray(o.tasks)) return base
  const rawTasks = (Array.isArray(o.tasks) ? o.tasks : [{ id: 'task-1', prompt: o.taskPrompt, screens: o.screens }]) as Record<string, unknown>[]
  const screens: EditorScreen[] = []
  const tasks: EditorTask[] = []
  for (const t of rawTasks) {
    const list = (Array.isArray(t.screens) ? t.screens : []) as (EditorScreen & { probe?: string })[]
    const probes: Record<string, string> = {}
    const overrides: Record<string, EditorOverride> = {}
    for (const s of list) {
      const { probe, ...card } = s
      const first = screens.find((x) => x.key === card.key)
      if (!first) screens.push(card)
      else {
        const ov: EditorOverride = {}
        if (card.behavior !== first.behavior) ov.behavior = card.behavior
        if (JSON.stringify(card.expectedSec) !== JSON.stringify(first.expectedSec)) ov.expectedSec = card.expectedSec
        if (card.name !== first.name) ov.name = card.name
        if (card.participantName !== first.participantName && card.participantName) ov.participantName = card.participantName
        if (Object.keys(ov).length) overrides[card.key] = ov
      }
      if (probe) probes[card.key] = probe
    }
    const { screens: _s, taskPrompt: _p, ...rest } = t
    void _s
    void _p
    tasks.push({ ...(rest as unknown as EditorTask), id: String(t.id ?? `task-${tasks.length + 1}`), prompt: String(t.prompt ?? o.taskPrompt ?? ''), expectedPath: list.map((s) => s.key), ...(Object.keys(probes).length ? { probes } : {}), ...(Object.keys(overrides).length ? { overrides } : {}) })
  }
  const { taskPrompt: _tp, ...top } = base
  void _tp
  return { ...top, screens, tasks }
}

/** The study JSON to save: empty optional fields dropped, so files stay clean and diffs small. */
export function toStudyJson(s: EditorStudy): Record<string, unknown> {
  const clean = <T extends Record<string, unknown>>(x: T): T =>
    Object.fromEntries(Object.entries(x).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0) && !(v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0))) as T
  return clean({
    ...s,
    screens: s.screens.map((x) => clean({ ...x })),
    tasks: s.tasks.map((t) =>
      clean({
        ...t,
        ...(t.probes ? { probes: clean({ ...t.probes }) } : {}),
        ...(t.overrides ? { overrides: Object.fromEntries(Object.entries(t.overrides).map(([k, v]) => [k, clean({ ...v })]).filter(([, v]) => Object.keys(v as object).length)) } : {})
      })
    )
  })
}

/** Node ids seen in a session file (screens and state variants), to prefill the screen list. */
export function nodesFromSession(json: unknown): string[] {
  const s = (json && typeof json === 'object' ? json : {}) as { tasks?: { events?: { type: string; screenKey: string; payload?: { node?: unknown } }[] }[] }
  const out: string[] = []
  for (const t of s.tasks ?? [])
    for (const e of t?.events ?? []) {
      if (e.type !== 'screen' && e.type !== 'state') continue
      for (const k of [e.screenKey, typeof e.payload?.node === 'string' ? e.payload.node : null]) if (k && !out.includes(k)) out.push(k)
    }
  return out
}

/** Every key a task can point at: screen keys and their aliases (state variants). */
export const allNodes = (s: EditorStudy): string[] => s.screens.flatMap((x) => [x.key, ...(x.aliases ?? [])])
