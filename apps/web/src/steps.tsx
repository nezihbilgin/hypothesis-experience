// Participant flow steps (decisions 2026-11-20): welcome -> consent -> camera check -> warm-up -> per task
// (expectation -> task with questions at screen transitions -> SEQ) -> hardest task -> summary.
import type { QuestionMoment } from '@hx/core'
import { useEffect, useMemo, useRef, useState } from 'react'
import { downloadJson, figmaEmbedUrl, type QualityResult, type SessionRun } from './run'
import { figmaFrames } from './report/images'
import { Button } from '@/components/base/buttons/button'
import { Checkbox } from '@/components/base/checkbox/checkbox'
import { Input } from '@/components/base/input/input'
import { RadioButton, RadioGroup } from '@/components/base/radio-buttons/radio-buttons'
import { TextArea } from '@/components/base/textarea/textarea'
import { cx } from '@/utils/cx'
import { AnswerBox, Card, H1, H2, Hint, P, Primary, Rating, Row, useT } from './ui'

export function Welcome({ run, next }: { run: SessionRun; next: () => void }) {
  const t = useT()
  return (
    <Card>
      <H1>{t('welcome.title')}</H1>
      <P>{t('welcome.body')}</P>
      {/* Task prompts are shown one at a time (task intro); listing them all here gave away later tasks (pilot feedback). */}
      <P>{t('welcome.tasks', { count: run.study.tasks.length })}</P>
      <Row>
        <Primary onPress={next}>{t('welcome.start')}</Primary>
      </Row>
    </Card>
  )
}

export function Consent({ run, next }: { run: SessionRun; next: () => void }) {
  const t = useT()
  const [camera, setCamera] = useState(false)
  const [mic, setMic] = useState(false)
  const [face, setFace] = useState(false)
  return (
    <Card>
      <H1>{t('consent.title')}</H1>
      <P>{t('consent.stored')}</P>
      <P>{t('consent.notStored')}</P>
      {run.study.sourceType === 'figma' ? <P muted>{t('consent.thirdParty')}</P> : null}
      <P muted>{t('consent.camera')}</P>
      <div className="mt-4 flex flex-col gap-4">
        <Checkbox size="md" isSelected={camera} onChange={setCamera} label={t('consent.cameraOption')} />
        <Checkbox size="md" isDisabled={!camera} isSelected={camera && mic} onChange={setMic} label={t('consent.microphoneOption')} />
        {run.study.faceSignals ? <Checkbox size="md" isDisabled={!camera} isSelected={camera && face} onChange={setFace} label={t('consent.faceSignals')} /> : null}
      </div>
      <Row>
        <Primary
          onPress={() => {
            run.consent = { camera, microphone: camera && mic, faceSignals: camera && face && run.study.faceSignals, at: new Date().toISOString() }
            next()
          }}
        >
          {t('consent.accept')}
        </Primary>
      </Row>
    </Card>
  )
}

export function CameraCheck({ run, next }: { run: SessionRun; next: () => void }) {
  const t = useT()
  const [q, setQ] = useState<QualityResult | null>(null)
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    void (async () => {
      await run.startSensing()
      setQ(await run.qualityCheck())
    })()
  }, [run])
  useEffect(() => {
    if (q && !run.consent.camera) next() // no camera chosen: nothing to check
  }, [q, run, next])
  return (
    <Card>
      <H1>{t('check.title')}</H1>
      <div aria-live="polite">{!q ? <P className="animate-pulse">{t('check.running')}</P> : <P>{q.cameraEnabled ? t('check.ok') : t('check.cameraOff')}</P>}</div>
      {q?.hints.includes('dark') ? <Hint>{t('check.hintDark')}</Hint> : null}
      {q?.hints.includes('noise') ? <Hint>{t('check.hintNoise')}</Hint> : null}
      <Row>
        <Primary isDisabled={!q} onPress={next}>
          {t('common.next')}
        </Primary>
      </Row>
    </Card>
  )
}

// Warm-up (~30 s, decisions 2026-11-21): the instructions themselves are the warm-up. A short intro to read
// (Continue enabled after INTRO_MIN_SEC), then 4 screens, each with one sentence and a "Tamam" button in a different
// part of the screen. "Screen shown -> first action" on those 4 screens (read a sentence, find the button, click)
// is the personal baseline; camera/mic seconds of the whole warm-up feed the face baseline as before.
const INTRO_MIN_SEC = 12
const SPOTS: { x: number; y: number; key: 'warmup.s1' | 'warmup.s2' | 'warmup.s3' | 'warmup.s4' }[] = [
  { x: 22, y: 26, key: 'warmup.s1' },
  { x: 76, y: 32, key: 'warmup.s2' },
  { x: 26, y: 74, key: 'warmup.s3' },
  { x: 72, y: 70, key: 'warmup.s4' }
]

export function Warmup({ run, next }: { run: SessionRun; next: () => void }) {
  const t = useT()
  const [step, setStep] = useState(0) // 0 = intro, 1..4 = sentence screens, 5 = done
  const [canContinue, setCanContinue] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => setCanContinue(true), INTRO_MIN_SEC * 1000)
    return () => clearTimeout(id)
  }, [])
  useEffect(() => {
    if (step === 0) run.startWarmup()
    // Only the sentence screens count as "screen shown -> first action"; the intro would inflate it.
    if (step >= 1 && step <= SPOTS.length) run.warmupEvent('screen', `warmup-${step}`)
    if (step === SPOTS.length + 1) run.finishWarmup()
  }, [step, run])
  const click = () => {
    if (step >= 1) run.warmupEvent('click', `warmup-${step}`)
    setStep(step + 1)
  }
  if (step === 0)
    return (
      <Card>
        <P muted>{t('warmup.intro')}</P>
        <p className="my-3 text-lg leading-relaxed text-secondary">{t('warmup.welcome')}</p>
        <Row>
          <Primary isDisabled={!canContinue} onPress={click}>
            {t('common.next')}
          </Primary>
        </Row>
      </Card>
    )
  if (step <= SPOTS.length) {
    const sp = SPOTS[step - 1]
    return (
      <div className="fixed inset-0">
        <div className="absolute max-w-72 -translate-x-1/2 -translate-y-1/2 rounded-xl bg-primary px-4 py-3.5 text-center shadow-xs ring-1 ring-secondary" style={{ left: `${sp.x}%`, top: `${sp.y}%` }}>
          <p className="mb-3 text-md text-secondary">{t(sp.key)}</p>
          <Primary onPress={click}>{t('warmup.ok')}</Primary>
        </div>
      </div>
    )
  }
  return (
    <Card>
      <P>{t('warmup.done')}</P>
      <Row>
        <Primary onPress={next}>{t('common.next')}</Primary>
      </Row>
    </Card>
  )
}

/** Context questions after the warm-up (not timed). Short text or single choice. */
export function ContextQuestions({ run, next }: { run: SessionRun; next: () => void }) {
  const t = useT()
  const qs = run.study.contextQuestions
  const [answers, setAnswers] = useState<Record<string, string>>({})
  useEffect(() => {
    if (!qs.length) next()
  }, [qs.length, next])
  if (!qs.length) return null
  return (
    <Card>
      <H1>{t('context.title')}</H1>
      {qs.map((q) => (
        <div key={q.id} className="my-5">
          {q.type === 'choice' ? (
            <RadioGroup size="md" aria-label={q.text} value={answers[q.id] ?? null} onChange={(v) => setAnswers({ ...answers, [q.id]: v })} className="gap-3">
              <p className="text-md font-semibold text-primary">{q.text}</p>
              {(q.options ?? []).map((o) => (
                <RadioButton key={o} value={o} label={o} />
              ))}
            </RadioGroup>
          ) : (
            <Input size="md" label={q.text} value={answers[q.id] ?? ''} onChange={(v) => setAnswers({ ...answers, [q.id]: v })} />
          )}
        </div>
      ))}
      <Row>
        <Primary
          onPress={() => {
            run.contextAnswers = qs.map((q) => ({ id: q.id, text: q.text, answer: answers[q.id]?.trim() || null }))
            next()
          }}
        >
          {t('common.next')}
        </Primary>
      </Row>
    </Card>
  )
}

/** No reference image for a 5-second test on this machine: skip it and record that it was not shown. */
function MissingImage({ onSkip }: { onSkip: () => void }) {
  useEffect(() => {
    onSkip()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

/** 5-second tests: a screen image for N s, then 1-3 recall questions. No camera or click measurement. */
export function FiveSecondTests({ run, next }: { run: SessionRun; next: () => void }) {
  const t = useT()
  const tests = run.study.fiveSecondTests
  const [i, setI] = useState(0)
  const [phase, setPhase] = useState<'intro' | 'show' | 'ask'>('intro')
  const [answers, setAnswers] = useState<string[]>([])
  useEffect(() => {
    if (i >= tests.length) next()
  }, [i, tests.length, next])
  const test = tests[i]
  const img = test ? figmaFrames.image(test.screen) : null
  useEffect(() => {
    if (phase !== 'show' || !test) return
    const id = setTimeout(() => setPhase('ask'), test.seconds * 1000)
    return () => clearTimeout(id)
  }, [phase, test])
  if (!test) return null
  const finish = (shown: boolean) => {
    run.fiveSecondResults.push({ id: test.id, screen: test.screen, shown, answers: test.questions.map((q, k) => ({ question: q, answer: answers[k]?.trim() || null })) })
    setAnswers([])
    setPhase('intro')
    setI(i + 1)
  }
  if (!img) return <MissingImage onSkip={() => finish(false)} />
  if (phase === 'intro')
    return (
      <Card>
        <P>{t('fivesec.intro')}</P>
        <Row>
          <Primary onPress={() => setPhase('show')}>{t('fivesec.start')}</Primary>
        </Row>
      </Card>
    )
  if (phase === 'show')
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gray-950">
        <img src={img.url} alt="" className="max-h-[96vh] max-w-[96vw]" />
      </div>
    )
  return (
    <Card>
      <P muted>{t('fivesec.after')}</P>
      {test.questions.map((q, k) => (
        <div key={k} className="my-5">
          <TextArea label={q} rows={2} value={answers[k] ?? ''} onChange={(v) => setAnswers(Object.assign([...answers], { [k]: v }))} />
        </div>
      ))}
      <Row>
        <Primary onPress={() => finish(true)}>{t('common.next')}</Primary>
      </Row>
    </Card>
  )
}

export function TaskIntro({ run, index, next }: { run: SessionRun; index: number; next: () => void }) {
  const t = useT()
  const task = run.study.tasks[index]
  useEffect(() => {
    run.prepareTask(index)
  }, [run, index])
  return (
    <Card>
      <P muted>{t('task.intro', { index: index + 1, total: run.study.tasks.length })}</P>
      <H1 className="text-xl">{task.prompt}</H1>
      {run.study.questions.preTaskRating ? (
        <Rating
          scale={run.study.scales.expectation}
          question={t('rating.expectation')}
          submitLabel={t('task.start')}
          onPick={(v) => {
            run.task.expectation = v
            next()
          }}
        />
      ) : (
        <Row>
          <Primary onPress={next}>{t('task.start')}</Primary>
        </Row>
      )}
    </Card>
  )
}

export function TaskRun({ run, next }: { run: SessionRun; next: (retro: QuestionMoment[]) => void }) {
  const t = useT()
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [question, setQuestion] = useState<QuestionMoment | null>(null)
  const [blocked, setBlocked] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [reached, setReached] = useState(false)
  // Comment mode: 'pick' = choose a point on the prototype, then write. The clock is paused throughout.
  const [comment, setComment] = useState<{ mode: 'pick' } | { mode: 'write'; point: { ix: number; iy: number; iw: number; ih: number } } | null>(null)
  const [commentText, setCommentText] = useState('')
  const hasTarget = !!run.study.tasks.find((x) => x.id === run.task.id)?.targetScreen
  const src = useMemo(() => {
    const start = run.study.tasks.find((x) => x.id === run.task.id)?.startScreen
    return run.study.sourceType === 'figma' ? figmaEmbedUrl(run.study.sourceUrl, location.hostname, start) : run.study.sourceUrl
  }, [run])
  const started = useRef(false)

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const r = run.handleMessage(e)
      if (r.ready) setLoaded(true)
      if (r.reachedTarget) setReached(true)
      if (r.blocked) setBlocked(r.blocked)
      if (r.question) {
        run.pauseForQuestion()
        setQuestion(r.question)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [run])
  useEffect(() => {
    if (started.current) return
    started.current = true
    const r = frameRef.current?.getBoundingClientRect()
    run.startTask({ w: Math.round(r?.width ?? innerWidth), h: Math.round(r?.height ?? innerHeight) })
  }, [run])

  const card = question ? run.cards().find((c) => c.screenKey === question.screenKey) : undefined
  const screen = card?.participantName
  return (
    <div className="fixed inset-0 flex flex-col">
      <header className={cx('flex items-center gap-4 border-b border-secondary px-4 py-2', reached ? 'bg-brand-primary' : 'bg-primary')}>
        <span className="flex-1 text-sm text-primary">
          {run.task.prompt}
          <span className={cx('block text-sm', reached ? 'font-semibold text-primary' : 'text-tertiary')}>{reached ? t('task.reachedHint') : hasTarget ? '' : t('task.doneHint')}</span>
        </span>
        {run.study.comments ? (
          <Button
            size="md"
            color="secondary"
            isDisabled={!!question || !!comment}
            onPress={() => {
              run.startComment()
              setComment({ mode: 'pick' })
            }}
          >
            {t('comment.add')}
          </Button>
        ) : null}
        <Button size="md" color="primary" className={reached ? 'ring-4 ring-brand' : undefined} isDisabled={!!question || !!comment} onPress={() => next(run.finishTask())}>
          {t('task.done')}
        </Button>
      </header>
      <div className="relative flex flex-1">
        <iframe ref={frameRef} className="w-full flex-1 border-0 bg-[#2c2c2c]" src={src} title="prototype" allow="clipboard-write" />
        {!loaded ? (
          <div className="absolute inset-0 flex items-center justify-center bg-[#2c2c2c] p-6 text-center text-lg text-gray-200" role="status">
            <p className="m-0 animate-pulse">{t('task.loading')}</p>
          </div>
        ) : null}
        {comment?.mode === 'pick' ? (
          <div
            className="absolute inset-0 cursor-crosshair bg-black/10"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              setComment({ mode: 'write', point: { ix: Math.round(e.clientX - r.left), iy: Math.round(e.clientY - r.top), iw: Math.round(r.width), ih: Math.round(r.height) } })
            }}
          >
            <p className="absolute top-3 left-1/2 m-0 -translate-x-1/2 rounded-lg bg-primary px-3 py-1.5 text-sm text-primary shadow-xs ring-1 ring-secondary">{t('comment.pick')}</p>
          </div>
        ) : null}
        {comment?.mode === 'write' ? <span className="pointer-events-none absolute -mt-2 -ml-2 size-4 rounded-full border-2 border-white bg-warning-solid" style={{ left: comment.point.ix, top: comment.point.iy }} /> : null}
      </div>
      {comment?.mode === 'write' ? (
        <div className="fixed right-4 bottom-4 w-[340px] rounded-xl bg-primary p-4 shadow-lg ring-1 ring-secondary" role="dialog" aria-label={t('comment.prompt')}>
          <TextArea label={t('comment.prompt')} rows={3} autoFocus value={commentText} onChange={setCommentText} placeholder={t('probe.placeholder')} />
          <p className="mt-1.5 text-sm text-tertiary">{t('probe.dictationHint')}</p>
          <Row className="mt-3">
            <Button
              size="md"
              color="primary"
              isDisabled={!commentText.trim()}
              onPress={() => {
                run.endComment(comment.point, commentText)
                setComment(null)
                setCommentText('')
              }}
            >
              {t('comment.save')}
            </Button>
            <Button
              size="md"
              color="secondary"
              onPress={() => {
                run.endComment(null, null)
                setComment(null)
                setCommentText('')
              }}
            >
              {t('common.cancel')}
            </Button>
          </Row>
        </div>
      ) : null}
      {blocked ? (
        <div className="fixed inset-0 flex items-start justify-center overflow-auto bg-black/88 backdrop-blur-md">
          <Card>
            <P>{t('task.blocked')}</P>
          </Card>
        </div>
      ) : null}
      {question ? (
        <div className="fixed inset-0 flex items-start justify-center overflow-auto bg-black/88 backdrop-blur-md">
          <Card>
            <AnswerBox
              intro={question.source === 'planned' ? (screen ? t('probe.planned', { screen }) : t('probe.plannedNoName')) : undefined}
              prompt={question.source === 'planned' && question.probe ? question.probe : screen ? t('probe.atTransition', { screen }) : t('probe.atTransitionNoName')}
              onDone={(a) => {
                run.answer(question, a)
                setQuestion(null)
              }}
            />
          </Card>
        </div>
      ) : null}
    </div>
  )
}

/** Optional end-of-task retro (off by default), one question per remaining mismatch. */
export function Retro({ run, moments, next }: { run: SessionRun; moments: QuestionMoment[]; next: () => void }) {
  const t = useT()
  const [i, setI] = useState(0)
  useEffect(() => {
    if (i >= moments.length) next()
  }, [i, moments.length, next])
  if (i >= moments.length) return null
  const m = moments[i]
  const screen = run.cards().find((c) => c.screenKey === m.screenKey)?.participantName
  return (
    <Card>
      <AnswerBox
        intro={i === 0 ? t('retro.intro') : undefined}
        prompt={screen ? t('probe.atTransition', { screen }) : t('probe.atTransitionNoName')}
        onDone={(a) => {
          run.answer(m, a, false)
          setI(i + 1)
        }}
      />
    </Card>
  )
}

export function Seq({ run, next }: { run: SessionRun; next: () => void }) {
  const t = useT()
  useEffect(() => {
    if (!run.study.questions.postTaskRating) next()
  }, [run, next])
  if (!run.study.questions.postTaskRating) return null
  return (
    <Card>
      <Rating
        scale={run.study.scales.seq}
        question={t('rating.seq')}
        submitLabel={t('common.next')}
        onPick={(v) => {
          run.task.seq = v
          next()
        }}
      />
    </Card>
  )
}

export function Hardest({ run, next }: { run: SessionRun; next: () => void }) {
  const t = useT()
  useEffect(() => {
    run.stopSensing()
    if (!run.study.questions.sessionEnd) next()
  }, [run, next])
  if (!run.study.questions.sessionEnd) return null
  return (
    <Card>
      <ol className="mb-4 list-decimal space-y-1 pl-6 text-md text-tertiary">
        {run.study.tasks.map((x) => (
          <li key={x.id}>{x.prompt}</li>
        ))}
      </ol>
      <AnswerBox
        prompt={t('session.hardestTask')}
        onDone={(a) => {
          run.hardestTask = { answer: a.answer?.trim() || null, dontRemember: !!a.dontRemember, skipped: !!a.skipped }
          next()
        }}
      />
    </Card>
  )
}

export function Summary({ run }: { run: SessionRun }) {
  const t = useT()
  const [deleted, setDeleted] = useState(false)
  if (deleted)
    return (
      <Card>
        <P>{t('session.deleted')}</P>
      </Card>
    )
  const answers = run.tasks.flatMap((x) => x.questions.map((q) => q.answer).filter((a): a is string => !!a))
  if (run.hardestTask?.answer) answers.push(run.hardestTask.answer)
  const download = () => downloadJson(`hx-session-${run.participant || 'katilimci'}-${run.startedAt.slice(0, 19).replace(/[:T]/g, '-')}.json`, run.toJSON())
  return (
    <Card>
      <H1>{t('session.summary')}</H1>
      <dl className="text-md text-secondary [&_dd]:mt-1 [&_dt]:mt-3 [&_dt]:font-semibold [&_dt]:text-primary [&_ul]:list-disc [&_ul]:pl-5">
        <dt>{t('session.summaryCamera')}</dt>
        <dd>{run.cameraOn ? t('common.yes') : t('common.no')}</dd>
        <dt>{t('session.summaryRatings')}</dt>
        <dd>
          <ul>
            {run.tasks.map((x) => (
              <li key={x.id}>
                {x.prompt}: {[x.expectation, x.seq].filter((v) => v !== null).join(' → ') || '–'}
              </li>
            ))}
          </ul>
        </dd>
        <dt>{t('session.summaryAnswers')}</dt>
        <dd>
          <ul>
            {answers.length ? answers.map((a, i) => <li key={i}>{a}</li>) : <li>–</li>}
          </ul>
        </dd>
      </dl>
      <Row>
        <Primary onPress={download}>{t('session.download')}</Primary>
        <Button
          size="lg"
          color="secondary"
          onPress={() => {
            if (!confirm(t('session.deleteConfirm'))) return
            run.wipe()
            delete (window as unknown as { __hxRun?: SessionRun }).__hxRun
            setDeleted(true)
          }}
        >
          {t('session.delete')}
        </Button>
      </Row>
    </Card>
  )
}
