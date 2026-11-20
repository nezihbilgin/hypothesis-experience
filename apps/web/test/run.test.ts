import { describe, expect, it } from 'vitest'
import { parseStudy } from '@hx/core'
import example from '../src/studies/example.json'
import { FIGMA_CLIENT_ID, SessionRun, figmaEmbedUrl } from '../src/run'

describe('figma embed url', () => {
  it('turns a prototype link into an embed URL with host and client-id', () => {
    const u = new URL(figmaEmbedUrl('https://www.figma.com/proto/abc/Test?node-id=2-4145', 'localhost'))
    expect(u.hostname).toBe('embed.figma.com')
    expect(u.searchParams.get('embed-host')).toBe('localhost')
    expect(u.searchParams.get('client-id')).toBe(FIGMA_CLIENT_ID)
    expect(u.searchParams.get('node-id')).toBe('2-4145')
    expect(u.searchParams.get('hide-ui')).toBe('1')
    expect(u.searchParams.get('footer')).toBe('false')
    expect(u.searchParams.get('hotspot-hints')).toBe('0')
  })
  it('leaves non-Figma links alone', () => {
    expect(figmaEmbedUrl('https://demo.example/app', 'localhost')).toBe('https://demo.example/app')
  })
})

describe('session delete', () => {
  it('wipe() drops every collected value and stops sensing', () => {
    const r = parseStudy(example)
    if (!r.ok) throw new Error(r.errors.join(', '))
    const run = new SessionRun(r.study, 'p1')
    let stopped = 0
    run.sensing = { stop: () => stopped++ } as unknown as SessionRun['sensing']
    run.consent = { camera: true, microphone: true, faceSignals: true, at: 'x' }
    run.quality = { cameraEnabled: true, blinkEnabled: true, reason: 'ok', medianFps: 15, hints: [] }
    run.delegate = 'GPU'
    run.warmup.samples.push({ t: 0, face: true } as never)
    run.prepareTask(0)
    run.task.questions.push({ moment: {} as never, answer: 'metin', dontRemember: false, skipped: false, answeredAt: 'x' })
    run.figmaRaw = { PRESENTED_NODE_CHANGED: [{ presentedNodeId: '1:2' }] }
    run.hardestTask = { answer: 'metin', dontRemember: false, skipped: false }
    run.asked = { inTask: [{} as never], inSession: [{} as never] }

    run.wipe()

    expect(stopped).toBe(1)
    expect(run.sensing).toBeNull()
    expect(run.tasks).toEqual([])
    expect(run.warmup).toEqual({ events: [], samples: [] })
    expect(run.figmaRaw).toEqual({})
    expect(run.hardestTask).toBeNull()
    expect(run.asked).toEqual({ inTask: [], inSession: [] })
    expect(run.consent.camera).toBe(false)
    expect(run.quality).toBeNull()
    expect(run.delegate).toBeNull()
    expect(run.wiped).toBe(true)
  })
})
