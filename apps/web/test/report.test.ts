import { describe, expect, it } from 'vitest'
import { clicksByScreen, commentPosition, typicalViewportHeight, metricsCsv, parseSessionFile } from '../src/report/data'

describe('report data', () => {
  it('groups clicks by screen with the state node and frame', () => {
    const m = clicksByScreen([
      { t: 1, screenKey: 'a', type: 'click', payload: { x: 10, y: 20, handled: false, node: 'a-2', frameId: 'a-2' } },
      { t: 2, screenKey: 'a', type: 'click', payload: { handled: false } },
      { t: 3, screenKey: 'a', type: 'dead-click', payload: { x: 10, y: 20 } }
    ])
    expect(m.get('a')).toEqual({ points: [{ node: 'a-2', x: 10, y: 20, dead: true, frameId: 'a-2' }], noPosition: 1 })
  })
  it('rejects files that are not session files', () => {
    expect(() => parseSessionFile('{"schema":"x"}')).toThrow()
  })
  it('writes one CSV row per participant, task and screen', () => {
    const report = { orientationSec: 3, mismatches: [{ screenKey: 'a', kind: 'over-time' }], screens: [{ screenKey: 'a', durationSec: 12, observed: { effort: 30, friction: 0 }, firstActionSec: 3, backs: 0, loops: 0, clicks: 2, deadClicks: 1, misclickRate: 0.5, rageClicks: 0, awaySec: 0 }] }
    const csv = metricsCsv([{ schema: 'hx-session/1', participant: 'P1', startedAt: 'x', tasks: [{ id: 't1', prompt: 'p', expectation: 5, seq: 6, events: [], endSec: 20, report: report as never, outcome: { result: 'direct', lastScreen: 'a', endedAt: 20, offPathVisited: [], clicklessTransitions: 0 }, questions: [] }] }], () => [{ screenKey: 'a', screenName: 'Sepet, ana', order: 1, behavior: 'flow', expectedSec: [0, 10] }])
    const [head, row] = csv.trim().split('\n')
    expect(head.split(',')).toContain('misclick_rate')
    expect(row).toBe('P1,t1,direct,20,3,5,6,a,"Sepet, ana",0,12,30,0,3,0,0,2,1,0.5,0,0,over-time,')
  })
})

import { clickLegend, highlights, mismatchLines } from '../src/report/data'

describe('readable report text', () => {
  const card = { screenKey: 'p', screenName: '04 Paket', participantName: 'Paket seçimi', order: 1, behavior: 'decide' as const, expectedSec: [8, 30] as [number, number] }
  const st = { screenKey: 'p', durationSec: 3, timedSec: undefined, visits: [], firstActionSec: 1, hesitation: false, backs: 0, deadClicks: 0, rageClicks: 0, clicks: 1, misclickRate: 0, loops: 0, awaySec: 0, observed: { effort: 10, friction: 0 }, faceSupport: [] }
  const mm = (kind: string, extra = {}) => ({ screenKey: 'p', kind, start: 0, end: 3, at: 0, replay: [0, 5], expected: { effort: 80, friction: 20 }, observed: { effort: 10, friction: 0 }, severity: 1, text: '', ...extra }) as never
  it('writes hypothesis and observation lines without "bekledin"', () => {
    expect(mismatchLines(mm('effort-mismatch', { direction: 'low' }), card, st as never)).toEqual({ hypothesis: 'karar ekranı (seçenekleri tartması beklendi)', observation: "3 sn'de geçti" })
    expect(mismatchLines(mm('over-time'), card, { ...st, durationSec: 40 } as never)).toEqual({ hypothesis: 'karar ekranı (seçenekleri tartması beklendi), en fazla 30 sn', observation: '40 sn sürdü' })
    expect(mismatchLines(mm('unexpected-friction'), card, { ...st, deadClicks: 2, loops: 1 } as never).observation).toBe('2 kez tepkisiz bir yere tıkladı, bir kez bir önceki ekranla arasında gidip geldi')
  })
  it('picks highlights with the answer given about that screen', () => {
    const task = { id: 't', prompt: 'x', expectation: 5, seq: 5, events: [], endSec: 10, report: { mismatches: [mm('effort-mismatch', { direction: 'low', severity: 2 })], screens: [{ ...st, rageClicks: 1 }] }, outcome: { result: 'dropped', lastScreen: 'p', endedAt: 10, offPathVisited: [] }, questions: [{ moment: { screenKey: 'p', source: 'signal' }, answer: 'Hangisini seçeceğimi düşündüm', dontRemember: false, skipped: false }] }
    const h = highlights(task as never, [card])
    expect(h.map((x) => x.kind)).toEqual(['mismatch', 'dropped', 'rage'])
    expect(h[0]).toMatchObject({ title: 'Paket seçimi', observation: "3 sn'de geçti", answer: 'Hangisini seçeceğimi düşündüm' })
  })
  it('legend counts working, unresponsive and outside-the-design clicks', () => {
    const pts = [{ node: 'n', x: 10, y: 10, dead: false }, { node: 'n', x: 20, y: 20, dead: true }, { node: 'n', x: 10, y: 1000, dead: true }, { node: 'n', x: 10, y: 10, dead: false, frameId: 'inner' }]
    const l = clickLegend(pts, { w: 414, h: 896 }, 'n')
    expect({ working: l.working, dead: l.dead, outside: l.outside }).toEqual({ working: 1, dead: 1, outside: 2 })
  })
})

import { atText, fmtSec, frictionText, stuckMoments, stuckSignalsText, pauseText, taskLine, taskTotals, visitText } from '../src/report/data'

describe('human labels with units', () => {
  const st = (o: Record<string, unknown> = {}) => ({ screenKey: 'x', durationSec: 34, visits: [{ start: 0, end: 20 }, { start: 30, end: 44 }], firstActionSec: 4.24, hesitation: false, backs: 1, deadClicks: 3, rageClicks: 0, clicks: 6, misclickRate: 0.5, loops: 0, awaySec: 0, observed: { effort: 40, friction: 45 }, faceSupport: [], ...o }) as never
  it('formats seconds Turkish-style', () => {
    expect(fmtSec(4.24)).toBe('4,2 sn')
    expect(fmtSec(33.4)).toBe('33 sn')
    expect(fmtSec(null)).toBe('–')
  })
  it('task line explains time and orientation', () => {
    const t = { id: 't', prompt: 'p', expectation: 4, seq: 7, events: [], endSec: 33, report: { orientationSec: 8 }, outcome: { result: 'direct', clicklessTransitions: 0 }, questions: [] }
    expect(taskLine(t as never)).toEqual({ result: 'Doğrudan başarı', text: 'Görev 33 sn sürdü. İlk 8 sn ilk ekranda etrafa bakınmakla geçti (ilk tıklamaya kadar), bu süre duraksama hesabına girmez.' })
  })
  it('pause in seconds against the personal normal, flagged above 2x', () => {
    expect(pauseText(st(), 2.1, false)).toEqual({ text: 'İlk tıklamaya kadar 4,2 sn (bu katılımcının normali 2,1 sn)', flagged: true })
    expect(pauseText(st({ firstActionSec: 3 }), 2.1, false).flagged).toBe(false)
    expect(pauseText(st({ firstActionSec: 2.3 }), 0.9, false).flagged).toBe(false) // under the 3 s floor
    expect(pauseText(st({ orientationSec: 8 }), 2.1, true).text).toBe('İlk ekran: ilk tıklamaya kadar 8 sn etrafa bakındı (duraksama sayılmaz)')
  })
  it('friction as reasons, visits in words, totals', () => {
    expect(frictionText(st())).toBe('1 geri dönüş, 3 tepkisiz tıklama')
    expect(frictionText(st({ backs: 0, deadClicks: 0 }))).toBe('')
    expect(visitText(st())).toBe('Bu ekrana 2 kez geldi, toplam 34 sn kaldı')
    expect(taskTotals([st(), st({ durationSec: 6, visits: [{ start: 0, end: 6 }], backs: 0, deadClicks: 0, clicks: 2, rageClicks: 1 })])).toEqual({ durationSec: 40, visits: 3, backs: 1, loops: 0, clicks: 8, dead: 3, rage: 1, misclickRate: 0.38 })
  })
  it('places comments on the reference image, with the scroll offset, and marks stale ones approximate', () => {
    // 414 x 896 viewport shown at 0.5 scale in a 400 x 448 iframe (centred: 96.5 px each side).
    const base = { t: 3, screenKey: 'a', node: 'a', text: 'x', point: { ix: 96.5 + 100, iy: 50, iw: 400, ih: 448 } }
    expect(commentPosition({ ...base, scroll: null, precise: false }, { w: 414, h: 896 }, 896)).toEqual({ x: 200, y: 100, approximate: false })
    expect(commentPosition({ ...base, scroll: { x: 0, y: 150 }, precise: true }, { w: 414, h: 1156 }, 896)).toEqual({ x: 200, y: 250, approximate: false })
    expect(commentPosition({ ...base, scroll: { x: 0, y: 150 }, precise: false }, { w: 414, h: 1156 }, 896).approximate).toBe(true)
    expect(typicalViewportHeight([{ w: 414, h: 896 }, { w: 414, h: 1156 }, { w: 414, h: 896 }, { w: 375, h: 812 }], 414)).toBe(896)
  })
  it('merges nearby friction on a screen into one stuck moment with face behaviour, comment and answer', () => {
    const cards = [
      { screenKey: 'a', screenName: 'A', order: 0, behavior: 'flow' as const, expectedSec: [0, 10] as [number, number] },
      { screenKey: 'b', screenName: 'B', participantName: 'Paket', order: 1, behavior: 'decide' as const, expectedSec: [0, 10] as [number, number] }
    ]
    const ev = (t: number, type: string, screenKey: string, payload = {}) => ({ t, type, screenKey, payload, v: 2 })
    const events = [ev(0, 'screen', 'a'), ev(2, 'click', 'a'), ev(2.1, 'screen', 'b'), ev(10, 'click', 'b', { handled: false }), ev(10, 'dead-click', 'b'), ev(12, 'click', 'b', { handled: false }), ev(12, 'dead-click', 'b'), ev(20, 'click', 'b')]
    const task = { id: 't', prompt: 'p', expectation: null, seq: null, events, endSec: 25, report: { mismatches: [], screens: [] }, questions: [{ moment: { screenKey: 'b', source: 'signal', askedAt: 21 }, answer: 'Paketi bulamadım', dontRemember: false, skipped: false }], comments: [{ t: 13, screenKey: 'b', node: 'b', point: { ix: 0, iy: 0, iw: 1, ih: 1 }, scroll: null, precise: true, text: 'neresi?' }] }
    const face = [{ kind: 'lean-in' as const, t: 9, sec: 3 }, { kind: 'talk' as const, t: 22, sec: 2 }]
    const ms = stuckMoments(task as never, face, cards as never, 1)
    expect(ms).toHaveLength(1)
    expect(ms[0]).toMatchObject({ screenKey: 'b', face: [face[0]], answer: 'Paketi bulamadım' })
    expect(ms[0].comments.map((c) => c.text)).toEqual(['neresi?'])
    // Pause 2.1 -> 10 (7.9 s > 3 s) and two dead clicks, merged.
    expect(stuckSignalsText(ms[0])).toBe('ilk tıklamadan önce 8 sn bekledi, 2 tepkisiz tıklama')
    expect(atText(24, 19)).toBe('görev başından 24.–42. sn (19 sn)')
  })
  it('an approximate comment on a scrolling frame gets the band it can be on', () => {
    const c = { t: 34, screenKey: 'a', node: 'a', text: 'x', point: { ix: 729, iy: 607, iw: 1604, ih: 877 }, scroll: null, precise: false }
    const p = commentPosition(c, { w: 414, h: 1156 }, 896)
    expect(p.approximate).toBe(true)
    expect(p.yRange).toEqual([620, 880])
  })
})

