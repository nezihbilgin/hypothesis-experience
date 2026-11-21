// Participant flow steps (decisions 2026-11-20): welcome -> consent -> camera check -> warm-up -> per task
// (expectation -> task with questions at screen transitions -> SEQ) -> hardest task -> summary.
import type { QuestionMoment } from '@hx/core'
import { useEffect, useMemo, useRef, useState } from 'react'
import { downloadJson, figmaEmbedUrl, supportedBrowser, type QualityResult, type SessionRun } from './run'
import { figmaFrames } from './report/images'
import { AnswerBox, Card, Rating, useT } from './ui'

export function Welcome({ run, next }: { run: SessionRun; next: () => void }) {
  const t = useT()
  return (
    <Card>
      <h1>{t('welcome.title')}</h1>
      <p>{t('welcome.body')}</p>
      {/* Task prompts are shown one at a time (task intro); listing them all here gave away later tasks (pilot feedback). */}
      <p>{t('welcome.tasks', { count: run.study.tasks.length })}</p>
      {!supportedBrowser(navigator.userAgent, navigator.maxTouchPoints) ? (
        <p className="hint" role="alert">
          {t('welcome.browser')}
        </p>
      ) : null}
      <button className="primary" onClick={next}>
        {t('welcome.start')}
      </button>
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
      <h1>{t('consent.title')}</h1>
      <p>{t('consent.stored')}</p>
      <p>{t('consent.notStored')}</p>
      {run.study.sourceType === 'figma' ? <p className="muted">{t('consent.thirdParty')}</p> : null}
      <p className="muted">{t('consent.camera')}</p>
      <label className="check">
        <input type="checkbox" checked={camera} onChange={(e) => setCamera(e.target.checked)} /> {t('consent.cameraOption')}
      </label>
      <label className={camera ? 'check' : 'check off'}>
        <input type="checkbox" disabled={!camera} checked={camera && mic} onChange={(e) => setMic(e.target.checked)} /> {t('consent.microphoneOption')}
      </label>
      {run.study.faceSignals ? (
        <label className={camera ? 'check' : 'check off'}>
          <input type="checkbox" disabled={!camera} checked={camera && face} onChange={(e) => setFace(e.target.checked)} /> {t('consent.faceSignals')}
        </label>
      ) : null}
      <button
        className="primary"
        onClick={() => {
          run.consent = { camera, microphone: camera && mic, faceSignals: camera && face && run.study.faceSignals, at: new Date().toISOString() }
          next()
        }}
      >
        {t('consent.accept')}
      </button>
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
      <h1>{t('check.title')}</h1>
      {!q ? <p className="pulse">{t('check.running')}</p> : <p>{q.cameraEnabled ? t('check.ok') : t('check.cameraOff')}</p>}
      {q?.hints.includes('dark') ? <p className="hint">{t('check.hintDark')}</p> : null}
      {q?.hints.includes('noise') ? <p className="hint">{t('check.hintNoise')}</p> : null}
      <button className="primary" disabled={!q} onClick={next}>
        {t('common.next')}
      </button>
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
        <p className="muted">{t('warmup.intro')}</p>
        <p className="reading">{t('warmup.welcome')}</p>
        <button className="primary" disabled={!canContinue} onClick={click}>
          {t('common.next')}
        </button>
      </Card>
    )
  if (step <= SPOTS.length) {
    const sp = SPOTS[step - 1]
    return (
      <div className="stage">
        <div className="spot-note" style={{ left: `${sp.x}%`, top: `${sp.y}%` }}>
          <p>{t(sp.key)}</p>
          <button className="primary" onClick={click}>
            {t('warmup.ok')}
          </button>
        </div>
      </div>
    )
  }
  return (
    <Card>
      <p>{t('warmup.done')}</p>
      <button className="primary" onClick={next}>
        {t('common.next')}
      </button>
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
      <h1>{t('context.title')}</h1>
      {qs.map((q) => (
        <div key={q.id} className="ctx-q">
          <p className="q">{q.text}</p>
          {q.type === 'choice' ? (
            (q.options ?? []).map((o) => (
              <label key={o} className="check">
                <input type="radio" name={q.id} checked={answers[q.id] === o} onChange={() => setAnswers({ ...answers, [q.id]: o })} /> {o}
              </label>
            ))
          ) : (
            <input className="text" value={answers[q.id] ?? ''} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} />
          )}
        </div>
      ))}
      <div className="row">
        <button
          className="primary"
          onClick={() => {
            run.contextAnswers = qs.map((q) => ({ id: q.id, text: q.text, answer: answers[q.id]?.trim() || null }))
            next()
          }}
        >
          {t('common.next')}
        </button>
      </div>
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
        <p>{t('fivesec.intro')}</p>
        <button className="primary" onClick={() => setPhase('show')}>
          {t('fivesec.start')}
        </button>
      </Card>
    )
  if (phase === 'show')
    return (
      <div className="fivesec-stage">
        <img src={img.url} alt="" />
      </div>
    )
  return (
    <Card>
      <p className="muted">{t('fivesec.after')}</p>
      {test.questions.map((q, k) => (
        <div key={k} className="ctx-q">
          <p className="q">{q}</p>
          <textarea rows={2} value={answers[k] ?? ''} onChange={(e) => setAnswers(Object.assign([...answers], { [k]: e.target.value }))} />
        </div>
      ))}
      <button className="primary" onClick={() => finish(true)}>
        {t('common.next')}
      </button>
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
      <p className="muted">{t('task.intro', { index: index + 1, total: run.study.tasks.length })}</p>
      <h1 className="prompt">{task.prompt}</h1>
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
        <button className="primary" onClick={next}>
          {t('task.start')}
        </button>
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
  // Connection lost (QA KA-28): the clock stops and a layer waits until it is back; the task continues where it was.
  const [offline, setOffline] = useState(!navigator.onLine)
  useEffect(() => {
    const down = () => {
      run.connectionLost()
      setOffline(true)
    }
    const up = () => {
      run.connectionBack()
      setOffline(false)
    }
    window.addEventListener('offline', down)
    window.addEventListener('online', up)
    return () => {
      window.removeEventListener('offline', down)
      window.removeEventListener('online', up)
    }
  }, [run])
  // The prototype never loaded: after 45 s offer to skip the task instead of a stuck screen (QA PK-13).
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (loaded) return
    const id = setTimeout(() => setSlow(true), 45000)
    return () => clearTimeout(id)
  }, [loaded])
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
    <div className="task">
      <header className={reached ? 'taskbar reached' : 'taskbar'}>
        <span className="task-prompt">
          {run.task.prompt}
          <span className="task-hint">{reached ? t('task.reachedHint') : hasTarget ? '' : t('task.doneHint')}</span>
        </span>
        {run.study.comments ? (
          <button
            disabled={!!question || !!comment}
            onClick={() => {
              run.startComment()
              setComment({ mode: 'pick' })
            }}
          >
            {t('comment.add')}
          </button>
        ) : null}
        <button className={reached ? 'primary glow' : 'primary'} disabled={!!question || !!comment} onClick={() => next(run.finishTask())}>
          {t('task.done')}
        </button>
      </header>
      <div className="proto-wrap">
        <iframe ref={frameRef} className="proto" src={src} title="prototype" allow="clipboard-write" />
        {!loaded ? (
          <div className="loading" role="status">
            <p className="pulse">{t('task.loading')}</p>
          </div>
        ) : null}
        {comment?.mode === 'pick' ? (
          <div
            className="pick-layer"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              setComment({ mode: 'write', point: { ix: Math.round(e.clientX - r.left), iy: Math.round(e.clientY - r.top), iw: Math.round(r.width), ih: Math.round(r.height) } })
            }}
          >
            <p className="pick-hint">{t('comment.pick')}</p>
          </div>
        ) : null}
        {comment?.mode === 'write' ? <span className="pin" style={{ left: comment.point.ix, top: comment.point.iy }} /> : null}
      </div>
      {comment?.mode === 'write' ? (
        <div className="comment-box">
          <p className="q">{t('comment.prompt')}</p>
          <textarea rows={3} autoFocus value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder={t('probe.placeholder')} />
          <p className="muted small">{t('probe.dictationHint')}</p>
          <div className="row">
            <button
              className="primary"
              disabled={!commentText.trim()}
              onClick={() => {
                run.endComment(comment.point, commentText)
                setComment(null)
                setCommentText('')
              }}
            >
              {t('comment.save')}
            </button>
            <button
              onClick={() => {
                run.endComment(null, null)
                setComment(null)
                setCommentText('')
              }}
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      ) : null}
      {offline ? (
        <div className="overlay offline" role="alert">
          <Card>
            <p className="pulse">{t('task.offline')}</p>
          </Card>
        </div>
      ) : null}
      {blocked ? (
        <div className="overlay">
          <Card>
            <p>{t('task.blocked')}</p>
            <button className="primary" onClick={() => next(run.skipBlockedTask(blocked))}>
              {t('task.skipBlocked')}
            </button>
          </Card>
        </div>
      ) : null}
      {!loaded && slow && !blocked ? (
        <div className="slow-load" role="alert">
          <p>{t('task.loadSlow')}</p>
          <button onClick={() => next(run.skipBlockedTask('not-loaded'))}>{t('task.skipBlocked')}</button>
        </div>
      ) : null}
      {question ? (
        <div className="overlay">
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
      <ol className="muted">
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
        <p>{t('session.deleted')}</p>
      </Card>
    )
  const answers = run.tasks.flatMap((x) => x.questions.map((q) => q.answer).filter((a): a is string => !!a))
  if (run.hardestTask?.answer) answers.push(run.hardestTask.answer)
  const download = () => downloadJson(`hx-session-${run.participant || 'katilimci'}-${run.startedAt.slice(0, 19).replace(/[:T]/g, '-')}.json`, run.toJSON())
  return (
    <Card>
      <h1>{t('session.summary')}</h1>
      <dl>
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
      <div className="row">
        <button className="primary" onClick={download}>
          {t('session.download')}
        </button>
        <button
          onClick={() => {
            if (!confirm(t('session.deleteConfirm'))) return
            run.wipe()
            delete (window as unknown as { __hxRun?: SessionRun }).__hxRun
            setDeleted(true)
          }}
        >
          {t('session.delete')}
        </button>
      </div>
    </Card>
  )
}
