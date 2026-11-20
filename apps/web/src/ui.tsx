// Small shared UI pieces. All participant copy comes from the text catalog (never hard-coded here).
import { text, type RatingScale, type TextCatalog, type TextKey } from '@hx/core'
import { createContext, useContext, useState, type ReactNode } from 'react'

export const TextsCtx = createContext<TextCatalog | null>(null)

/** t('key', { vars }) from the study's catalog. */
export function useT(): (key: TextKey, vars?: Record<string, string | number>) => string {
  const c = useContext(TextsCtx)
  if (!c) throw new Error('TextsCtx missing')
  return (key, vars) => text(c, key, vars)
}

export function Card({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return <main className={wide ? 'card wide' : 'card'}>{children}</main>
}

/** Rating buttons for any {min, max, labels} scale (never assumes 7). */
export function Rating({ scale, question, onPick, submitLabel }: { scale: RatingScale; question: string; onPick: (v: number) => void; submitLabel: string }) {
  const [v, setV] = useState<number | null>(null)
  const values = Array.from({ length: scale.max - scale.min + 1 }, (_, i) => scale.min + i)
  return (
    <div className="rating">
      <p className="q">{question}</p>
      <div className="scale" role="radiogroup" aria-label={question}>
        {values.map((n) => (
          <button key={n} type="button" role="radio" aria-checked={v === n} className={v === n ? 'opt on' : 'opt'} onClick={() => setV(n)}>
            <span className="n">{n}</span>
            {scale.labels[n] ? <span className="lab">{scale.labels[n]}</span> : null}
          </button>
        ))}
      </div>
      <button type="button" className="primary" disabled={v === null} onClick={() => v !== null && onPick(v)}>
        {submitLabel}
      </button>
    </div>
  )
}

/** Written answer with "Hatırlamıyorum" and "Geç". `followUp` is the hook for M3b AI follow-up questions. */
export function AnswerBox({
  prompt,
  intro,
  onDone,
  followUp
}: {
  prompt: string
  intro?: string
  onDone: (a: { answer?: string; dontRemember?: boolean; skipped?: boolean }) => void
  followUp?: (answer: string) => Promise<string | null>
}) {
  const t = useT()
  const [value, setValue] = useState('')
  void followUp // M3b: ask up to 2 neutral follow-ups based on the answer; not used in v1.
  return (
    <div className="answer">
      {intro ? <p className="intro">{intro}</p> : null}
      <p className="q">{prompt}</p>
      <textarea value={value} onChange={(e) => setValue(e.target.value)} placeholder={t('probe.placeholder')} rows={4} autoFocus />
      <div className="row">
        <button type="button" className="primary" disabled={!value.trim()} onClick={() => onDone({ answer: value })}>
          {t('probe.send')}
        </button>
        <button type="button" onClick={() => onDone({ dontRemember: true })}>
          {t('probe.dontRemember')}
        </button>
        <button type="button" className="link" onClick={() => onDone({ skipped: true })}>
          {t('common.skip')}
        </button>
      </div>
    </div>
  )
}
