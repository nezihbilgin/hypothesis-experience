// "Screen reference image" abstraction (decisions 2026-11-20). Provider (a) Figma: frame images exported by the
// researcher into the gitignored repo folder frames.local/ as <node-id with "-">.png at 1x, so Figma frame
// coordinates map 1:1 onto image pixels. Provider (b) live sites (reference walkthrough) comes later.
// Images never come from the participant's device.

export interface ReferenceImage {
  url: string
  /** Node the image shows (a state variant or the logical screen). */
  node: string
}

export interface ReferenceImageProvider {
  image(node: string): ReferenceImage | null
}

const figmaFiles = import.meta.glob('../../../../frames.local/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

export const figmaFrames: ReferenceImageProvider = {
  image(node) {
    const file = Object.keys(figmaFiles).find((k) => k.endsWith(`/${node.replace(':', '-')}.png`))
    return file ? { url: figmaFiles[file], node } : null
  }
}

export const hasFigmaFrames = (): boolean => Object.keys(figmaFiles).length > 0
