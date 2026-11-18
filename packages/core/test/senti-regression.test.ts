// Regression: the compat model built on @hx/core's engine must equal Senti's original computeReport.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { computeSentiReport } from '../src/compat/senti'
import { computeReport as sentiOriginal } from './senti-ref/felt'
import type { Session } from '../src/compat/senti-types'

const dir = path.join(__dirname, 'fixtures')
const evidence = fs.readdirSync(dir).filter((f) => /^\d+-\w+\.json$/.test(f))

describe('Senti regression on docs/evidence', () => {
  it('has evidence sessions', () => expect(evidence.length).toBeGreaterThanOrEqual(2))
  for (const f of evidence) {
    const session = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Session
    it(`${f}: equals frozen golden output`, () => {
      const golden = JSON.parse(fs.readFileSync(path.join(dir, f.replace('.json', '.golden.json')), 'utf8'))
      expect(computeSentiReport(session)).toEqual(golden)
    })
    it(`${f}: equals live Senti reference`, () => {
      expect(computeSentiReport(session)).toEqual(sentiOriginal(session))
    })
  }
})
