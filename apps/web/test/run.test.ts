import { describe, expect, it } from 'vitest'
import { FIGMA_CLIENT_ID, figmaEmbedUrl } from '../src/run'

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
  it('starts at a task start screen when given', () => {
    const u = new URL(figmaEmbedUrl('https://www.figma.com/proto/abc/Test?node-id=2-4145&starting-point-node-id=2%3A4145', 'localhost', '26:7221'))
    expect(u.searchParams.get('node-id')).toBe('26-7221')
    expect(u.searchParams.get('starting-point-node-id')).toBe('26:7221')
  })
  it('leaves non-Figma links alone', () => {
    expect(figmaEmbedUrl('https://demo.example/app', 'localhost')).toBe('https://demo.example/app')
  })
})
