import { cardsFromTask, parseStudy } from '@hx/core'
import { describe, expect, it } from 'vitest'
import example from '../../../packages/core/test/fixtures/study.example.json'
import { allNodes, nodesFromSession, toEditor, toStudyJson } from '../src/setup/model'

const v3like = {
  name: 'Örnek', sourceType: 'figma', sourceUrl: 'https://www.figma.com/proto/x', context: 'workplace', faceSignals: false,
  screens: [
    { key: '1:1', name: 'Home', participantName: 'Ana sayfa', behavior: 'flow', expectedSec: [3, 15], aliases: ['1:2'] },
    { key: '1:3', name: 'Form', behavior: 'decide', expectedSec: [5, 20] }
  ],
  tasks: [{ id: 'a', prompt: 'p', startScreen: '1:1', targetScreen: '1:3', expectedPath: ['1:1', '1:3'], probes: { '1:1': 'Ne düşündün?' }, overrides: { '1:3': { behavior: 'flow', name: 'Form (A)' } } }]
}

describe('setup model', () => {
  it('round-trips a study-level file unchanged', () => {
    expect(toStudyJson(toEditor(v3like))).toEqual(v3like)
  })
  it('converts the old per-task format and keeps the same cards per task', () => {
    const ed = toStudyJson(toEditor(example))
    const a = parseStudy(example)
    const b = parseStudy(ed)
    if (!a.ok || !b.ok) throw new Error('parse')
    expect(cardsFromTask(b.study.tasks[0]).filter((c) => !c.offPath)).toEqual(cardsFromTask(a.study.tasks[0]))
  })
  it('collects node ids from a session file and lists aliases as targets', () => {
    const session = { tasks: [{ events: [{ type: 'screen', screenKey: '1:1' }, { type: 'state', screenKey: '1:1', payload: { node: '1:2' } }, { type: 'click', screenKey: '1:1' }, { type: 'screen', screenKey: '1:3' }] }] }
    expect(nodesFromSession(session)).toEqual(['1:1', '1:2', '1:3'])
    expect(allNodes(toEditor(v3like))).toEqual(['1:1', '1:2', '1:3'])
  })
})
