import { describe, expect, it } from 'vitest'
import {
  TEXTS_TR,
  buildCatalog,
  cardsFromTask,
  computeBaseline,
  computeScreenReport,
  defaultScale,
  endOfTaskQuestions,
  normalizeRating,
  parseStudy,
  questionAtTransition,
  summarizeTask,
  text,
  validateScale,
  type AskedSoFar,
  type HypothesisCard,
  type InteractionEvent,
  type QuestionMoment
} from '../src'

const ev = (t: number, screenKey: string, type: InteractionEvent['type']): InteractionEvent => ({ t, screenKey, type })
const cards: HypothesisCard[] = [
  { screenKey: 'a', screenName: 'Sepet', order: 1, behavior: 'flow', expectedSec: [0, 30], probe: 'Sepette neyi kontrol ettin?' },
  { screenKey: 'b', screenName: 'Teslimat', order: 2, behavior: 'flow', expectedSec: [0, 30] },
  { screenKey: 'c', screenName: 'Plan', order: 3, behavior: 'decide', expectedSec: [8, 30] },
  { screenKey: 'd', screenName: 'Onay', order: 4, behavior: 'flow', expectedSec: [0, 30] }
]
const baseline = computeBaseline([], [])
// a: quick. b: dead clicks + going back. c: 2 s (no decision time). d: rage click.
const events = [
  ev(0, 'a', 'screen'), ev(1, 'a', 'click'),
  ev(2, 'b', 'screen'), ev(3, 'b', 'dead-click'), ev(4, 'b', 'dead-click'), ev(5, 'b', 'click'),
  ev(6, 'a', 'screen'), ev(7, 'a', 'click'),
  ev(8, 'b', 'screen'), ev(9, 'b', 'click'),
  ev(10, 'c', 'screen'), ev(11, 'c', 'click'),
  ev(12, 'd', 'screen'), ev(13, 'd', 'rage-click'), ev(14, 'd', 'click')
]
const reportAt = (now: number) => computeScreenReport({ cards, events: events.filter((e) => e.t <= now), samples: [], baseline, endSec: now, cameraEnabled: false })
const none: AskedSoFar = { inTask: [], inSession: [] }
const push = (a: AskedSoFar, q: QuestionMoment | null): AskedSoFar => (q ? { inTask: [...a.inTask, q], inSession: [...a.inSession, q] } : a)

describe('questions at screen transitions', () => {
  it('asks the planned probe when leaving its screen, once', () => {
    const q1 = questionAtTransition({ card: cards[0], report: reportAt(2), leftAt: 2, asked: none })
    expect(q1).toMatchObject({ source: 'planned', probe: 'Sepette neyi kontrol ettin?', askedAt: 2, replay: [0, 2] })
    const q2 = questionAtTransition({ card: cards[0], report: reportAt(8), leftAt: 8, asked: push(none, q1) })
    expect(q2).toBeNull()
  })
  it('asks about a mismatch at the transition, at most 2 per task', () => {
    let asked = push(none, questionAtTransition({ card: cards[0], report: reportAt(2), leftAt: 2, asked: none }))
    const qb = questionAtTransition({ card: cards[1], report: reportAt(6), leftAt: 6, asked })
    expect(qb).toMatchObject({ source: 'signal', screenKey: 'b', mismatch: { kind: 'unexpected-friction' } })
    expect(qb!.mismatch!.replay).toEqual([0, 8]) // anchored at the first dead click (3 s)
    asked = push(asked, qb)
    expect(questionAtTransition({ card: cards[2], report: reportAt(12), leftAt: 12, asked })).toBeNull()
  })
  it('does not ask twice about the same mismatch', () => {
    const qb = questionAtTransition({ card: cards[1], report: reportAt(6), leftAt: 6, asked: none })
    expect(questionAtTransition({ card: cards[1], report: reportAt(10), leftAt: 10, asked: push(none, qb) })).toBeNull()
  })
  it('end-of-task retro takes the largest remaining mismatches within the session budget', () => {
    let asked = push(none, questionAtTransition({ card: cards[0], report: reportAt(2), leftAt: 2, asked: none }))
    asked = push(asked, questionAtTransition({ card: cards[1], report: reportAt(6), leftAt: 6, asked }))
    const retro = endOfTaskQuestions({ report: reportAt(20), endedAt: 20, asked })
    expect(retro.map((q) => [q.screenKey, q.mismatch!.kind])).toEqual([['c', 'effort-mismatch'], ['d', 'unexpected-friction']])
    expect(retro.every((q) => q.source === 'end-of-task')).toBe(true)
    const tight = endOfTaskQuestions({ report: reportAt(20), endedAt: 20, asked, limits: { perTask: 2, endOfTask: 2, perSession: 3 } })
    expect(tight.map((q) => q.screenKey)).toEqual(['d'])
  })
  it('session cap stops transition questions in later tasks', () => {
    const full = Array.from({ length: 6 }, () => ({ screenKey: 'x', askedAt: 0, source: 'signal' as const, replay: [0, 1] as [number, number] }))
    expect(questionAtTransition({ card: cards[0], report: reportAt(2), leftAt: 2, asked: { inTask: [], inSession: full } })).toBeNull()
  })
})

describe('text catalog', () => {
  it('defaults to Turkish and fills placeholders', () => {
    const c = buildCatalog()
    expect(text(c, 'task.intro', { index: 1, total: 3 })).toBe('Görev 1 / 3')
    expect(text(c, 'probe.default')).toBe('Bu ekranda ne düşünüyordun, ne arıyordun?')
  })
  it('study overrides replace known keys only', () => {
    const c = buildCatalog({ 'task.done': 'Tamamladım', 'unknown.key': 'x', 'common.skip': '  ' })
    expect(c['task.done']).toBe('Tamamladım')
    expect(c['common.skip']).toBe(TEXTS_TR['common.skip'])
    expect('unknown.key' in c).toBe(false)
  })
  it('participant texts show no numbers about behaviour and no emotion words', () => {
    for (const v of Object.values(TEXTS_TR)) expect(v).not.toMatch(/\d+ ?sn|kafası karış|stres|kork|sinir|duygu/i)
  })
})

describe('rating scales', () => {
  it('default is 1-7 with labelled ends', () => {
    expect(defaultScale()).toEqual({ min: 1, max: 7, labels: { 1: 'Çok zor', 7: 'Çok kolay' } })
  })
  it('validates range and labels', () => {
    expect(validateScale({ min: 1, max: 10, labels: { 1: 'Zor', 10: 'Kolay' } }, 'S')).toEqual([])
    expect(validateScale({ min: 5, max: 5 }, 'S')).toEqual(['S: min ve max tam sayı olmalı, min < max.'])
    expect(validateScale({ min: 0, max: 20 }, 'S')).toEqual(['S: en fazla 11 seçenek olabilir.'])
    expect(validateScale({ min: 1, max: 7, labels: { 9: 'x', 2: ' ' } }, 'S')).toEqual(['S: 2 etiketi boş olamaz.', 'S: "9" etiketi ölçeğin dışında.'])
  })
  it('normalises any scale to 0..1', () => {
    expect(normalizeRating(4, { min: 1, max: 7, labels: {} })).toBe(0.5)
    expect(normalizeRating(10, { min: 1, max: 10, labels: {} })).toBe(1)
  })
})

describe('study definition (tasks, settings)', () => {
  const base = { name: 'Çalışma', sourceType: 'figma', sourceUrl: 'https://www.figma.com/proto/x' }
  const screen = { key: '1:2', name: 'Sepet', behavior: 'flow', expectedSec: [1, 5], probe: 'Ne aradın?' }
  it('supports several tasks, probes, scales, texts and question settings', () => {
    const r = parseStudy({
      ...base,
      context: 'consumer',
      tasks: [{ id: 'buy', prompt: 'Satın al', screens: [screen] }, { prompt: 'İptal et', screens: [{ ...screen, key: '2:1' }] }],
      scales: { seq: { min: 1, max: 10, labels: { 1: 'Çok zor', 10: 'Çok kolay' } } },
      texts: { 'task.done': 'Tamamladım' },
      questions: { endOfTask: false, limits: { perTask: 1 } }
    })
    if (!r.ok) throw new Error(r.errors.join('\n'))
    expect(r.study.tasks.map((t) => t.id)).toEqual(['buy', 'task-2'])
    expect(cardsFromTask(r.study.tasks[0])[0].probe).toBe('Ne aradın?')
    expect(r.study.scales.seq.max).toBe(10)
    expect(r.study.scales.expectation).toEqual(defaultScale())
    expect(r.study.texts['task.done']).toBe('Tamamladım')
    expect(r.study.questions).toMatchObject({ endOfTask: false, preTaskRating: true, limits: { perTask: 1, endOfTask: 2, perSession: 6 } })
    expect(r.study.faceSignals).toBe(true)
  })
  it('face signals default off for workplace and education studies', () => {
    for (const context of ['workplace', 'education']) {
      const r = parseStudy({ ...base, context, taskPrompt: 'x', screens: [screen] })
      expect(r.ok && r.study.faceSignals).toBe(false)
    }
    const r = parseStudy({ ...base, context: 'workplace', faceSignals: true, taskPrompt: 'x', screens: [screen] })
    expect(r.ok && r.study.faceSignals).toBe(true)
  })
  it('reports bad settings in Turkish', () => {
    const r = parseStudy({ ...base, context: 'lab', taskPrompt: 'x', screens: [screen], scales: { seq: { min: 3, max: 1 } }, questions: { sessionEnd: 'yes', limits: { perSession: -1 } } })
    expect(r.ok ? [] : r.errors).toEqual([
      'context "workplace", "education", "consumer" ya da "other" olmalı.',
      'SEQ ölçeği: min ve max tam sayı olmalı, min < max.',
      'questions.sessionEnd true ya da false olmalı.',
      'questions.limits.perSession 0 ya da pozitif tam sayı olmalı.'
    ])
  })
})

describe('task summary with ratings', () => {
  it('compares expected and experienced difficulty on a 0..1 scale', () => {
    const r = reportAt(20)
    const scales = { expectation: defaultScale(), seq: { min: 1, max: 10, labels: {} } }
    const sum = summarizeTask(cards, [
      { participant: 'P1', report: r, ratings: { expectation: 7, seq: 1 } },
      { participant: 'P2', report: r, ratings: { expectation: 4, seq: 10 } },
      { participant: 'P3', report: r, ratings: { seq: 10 } }
    ], scales)
    expect(sum.ratings).toEqual({ n: 2, expectation: 0.75, seq: 0.67, gap: -0.25 })
    expect(sum.screens[1]).toMatchObject({ screenName: 'Teslimat', withMismatch: 3, byKind: { 'unexpected-friction': 3 } })
  })
})
