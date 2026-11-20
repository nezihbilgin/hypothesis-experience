import { describe, expect, it } from 'vitest'
import { FIGMA_CLIENT_ID, figmaEmbedUrl } from '../src/run'

describe('figma embed url', () => {
  it('turns a prototype link into an embed URL with host and client-id', () => {
    const u = new URL(figmaEmbedUrl('https://www.figma.com/proto/abc/Test?node-id=2-4145', 'localhost'))
    expect(u.hostname).toBe('embed.figma.com')
    expect(u.searchParams.get('embed-host')).toBe('localhost')
    expect(u.searchParams.get('client-id')).toBe(FIGMA_CLIENT_ID)
    expect(u.searchParams.get('node-id')).toBe('2-4145')
  })
  it('leaves non-Figma links alone', () => {
    expect(figmaEmbedUrl('https://demo.example/app', 'localhost')).toBe('https://demo.example/app')
  })
})
