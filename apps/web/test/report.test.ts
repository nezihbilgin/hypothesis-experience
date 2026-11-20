import { describe, expect, it } from 'vitest'
import { clicksByScreen, metricsCsv, parseSessionFile } from '../src/report/data'

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
    const csv = metricsCsv([{ schema: 'hx-session/1', participant: 'P1', startedAt: 'x', tasks: [{ id: 't1', prompt: 'p', expectation: 5, seq: 6, events: [], endSec: 20, report: report as never, outcome: { result: 'direct', lastScreen: 'a', endedAt: 20, offPathVisited: [] }, questions: [] }] }], () => [{ screenKey: 'a', screenName: 'Sepet, ana', order: 1, behavior: 'flow', expectedSec: [0, 10] }])
    const [head, row] = csv.trim().split('\n')
    expect(head.split(',')).toContain('misclick_rate')
    expect(row).toBe('P1,t1,direct,20,3,5,6,a,"Sepet, ana",0,12,30,0,3,0,0,2,1,0.5,0,0,over-time')
  })
})
