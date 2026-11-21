// Small shared UI pieces. All participant copy comes from the text catalog (never hard-coded here).
import { text, type RatingScale, type TextCatalog, type TextKey } from '@hx/core'
import { createContext, useContext, useState, type ReactNode } from 'react'
import { Button } from '@/components/base/buttons/button'
import { TextArea } from '@/components/base/textarea/textarea'
import { cx } from '@/utils/cx'

export const TextsCtx = createContext<TextCatalog | null>(null)

/** t('key', { vars }) from the study's catalog. */
export function useT(): (key: TextKey, vars?: Record<string, string | number>) => string {
  const c = useContext(TextsCtx)
  if (!c) throw new Error('TextsCtx missing')
  return (key, vars) => text(c, key, vars)
}

export function Card({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return <main className={cx('card mx-auto my-[8vh] rounded-2xl bg-primary p-8 shadow-xs ring-1 ring-secondary max-sm:m-4 max-sm:p-5', wide ? 'max-w-4xl' : 'max-w-2xl')}>{children}</main>
}

export const H1 = ({ children, className }: { children: ReactNode; className?: string }) => <h1 className={cx('mb-4 text-display-xs font-semibold text-primary', className)}>{children}</h1>
export const H2 = ({ children }: { children: ReactNode }) => <h2 className="mt-5 mb-1.5 text-lg font-semibold text-primary">{children}</h2>
export const P = ({ children, muted, className }: { children: ReactNode; muted?: boolean; className?: string }) => <p className={cx('my-3 text-md', muted ? 'text-tertiary' : 'text-secondary', className)}>{children}</p>
export const Row = ({ children, className }: { children: ReactNode; className?: string }) => <div className={cx('mt-5 flex flex-wrap items-center gap-3', className)}>{children}</div>
export const Hint = ({ children }: { children: ReactNode }) => <p className="my-3 rounded-lg bg-brand-primary px-3 py-2.5 text-md text-brand-secondary">{children}</p>

/** Primary action of a participant step (large, Untitled UI button). */
export function Primary({ children, onPress, isDisabled, className }: { children: ReactNode; onPress: () => void; isDisabled?: boolean; className?: string }) {
  return (
    <Button size="lg" color="primary" onPress={onPress} isDisabled={isDisabled} className={className}>
      {children}
    </Button>
  )
}

/** Rating buttons for any {min, max, labels} scale (never assumes 7). A radio group: arrow keys move, screen readers read the labels. */
export function Rating({ scale, question, onPick, submitLabel }: { scale: RatingScale; question: string; onPick: (v: number) => void; submitLabel: string }) {
  const [v, setV] = useState<number | null>(null)
  const values = Array.from({ length: scale.max - scale.min + 1 }, (_, i) => scale.min + i)
  return (
    <div className="rating">
      <p className="mt-4 text-md font-semibold text-primary">{question}</p>
      <div className="my-4 flex gap-1.5 max-sm:flex-wrap" role="radiogroup" aria-label={question}>
        {values.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={v === n}
            onClick={() => setV(n)}
            className={cx(
              'flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg px-0.5 py-2.5 text-md font-semibold ring-1 ring-primary transition outline-focus-ring ring-inset focus-visible:outline-2 focus-visible:outline-offset-2 max-sm:basis-[calc(25%-6px)]',
              v === n ? 'bg-brand-solid text-white ring-transparent' : 'bg-primary text-secondary hover:bg-primary_hover'
            )}
          >
            <span>{n}</span>
            {scale.labels[n] ? <span className="text-center text-xs leading-tight font-medium">{scale.labels[n]}</span> : null}
          </button>
        ))}
      </div>
      <Primary isDisabled={v === null} onPress={() => v !== null && onPick(v)}>
        {submitLabel}
      </Primary>
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
      {intro ? <P muted>{intro}</P> : null}
      <p className="mt-2 mb-3 text-md font-semibold text-primary">{prompt}</p>
      <TextArea aria-label={prompt} value={value} onChange={setValue} placeholder={t('probe.placeholder')} rows={4} autoFocus />
      {/* No in-app speech recognition: the browser's would send audio to a server (decisions 2026-11-20). */}
      <p className="mt-1.5 text-sm text-tertiary">{t('probe.dictationHint')}</p>
      <Row>
        <Primary isDisabled={!value.trim()} onPress={() => onDone({ answer: value })}>
          {t('probe.send')}
        </Primary>
        <Button size="lg" color="secondary" onPress={() => onDone({ dontRemember: true })}>
          {t('probe.dontRemember')}
        </Button>
        <Button size="lg" color="link-gray" onPress={() => onDone({ skipped: true })}>
          {t('common.skip')}
        </Button>
      </Row>
    </div>
  )
}
