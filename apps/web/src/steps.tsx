// Participant flow steps (decisions 2026-11-20): welcome -> consent -> camera check -> warm-up -> per task
// (expectation -> task with questions at screen transitions -> SEQ) -> hardest task -> summary.
import type { QuestionMoment } from '@hx/core'
import { useEffect, useMemo, useRef, useState } from 'react'
import { figmaEmbedUrl, type QualityResult, type SessionRun } from './run'
import { AnswerBox, Card, Rating, useT } from './ui'

export function Welcome({ run, next }: { run: SessionRun; next: () => void }) {
  const t = useT()
  return (
    <Card>
      <h1>{t('welcome.title')}</h1>
      <p>{t('welcome.body')}</p>
      <h2>{t('welcome.tasks')}</h2>
      <ol>
        {run.study.tasks.map((x) => (
          <li key={x.id}>{x.prompt}</li>
        ))}
      </ol>
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

// Warm-up: neutral reading, then 3 single-button screens at fixed positions (first-action latency baseline).
const CLICK_SPOTS: [number, number][] = [
  [18, 30],
  [72, 62],
  [40, 78]
]

export function Warmup({ run, next }: { run: SessionRun; next: () => void }) {
  const t = useT()
  const [step, setStep] = useState(0) // 0 = reading, 1..3 = click screens, 4 = done
  useEffect(() => {
    if (step === 0) run.startWarmup()
    if (step <= CLICK_SPOTS.length) run.warmupEvent('screen', `warmup-${step}`)
    if (step === CLICK_SPOTS.length + 1) run.finishWarmup()
  }, [step, run])
  const click = () => {
    run.warmupEvent('click', `warmup-${step}`)
    setStep(step + 1)
  }
  if (step === 0)
    return (
      <Card>
        <p className="muted">{t('warmup.intro')}</p>
        <p className="reading">{t('warmup.text')}</p>
        <button className="primary" onClick={click}>
          {t('common.next')}
        </button>
      </Card>
    )
  if (step <= CLICK_SPOTS.length) {
    const [x, y] = CLICK_SPOTS[step - 1]
    return (
      <div className="stage">
        <p className="stage-text">{t('warmup.click')}</p>
        <button className="primary spot" style={{ left: `${x}%`, top: `${y}%` }} onClick={click}>
          {t('warmup.clickButton')}
        </button>
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
  const src = useMemo(() => (run.study.sourceType === 'figma' ? figmaEmbedUrl(run.study.sourceUrl, location.hostname) : run.study.sourceUrl), [run])
  const started = useRef(false)

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const r = run.handleMessage(e)
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
  const screen = card?.screenName ?? ''
  return (
    <div className="task">
      <header className="taskbar">
        <span className="task-prompt">{run.task.prompt}</span>
        <button className="primary" disabled={!!question} onClick={() => next(run.finishTask())}>
          {t('task.done')}
        </button>
      </header>
      {!loaded ? <p className="loading">{t('task.loading')}</p> : null}
      <iframe ref={frameRef} className="proto" src={src} title="prototype" allow="clipboard-write" onLoad={() => setLoaded(true)} />
      {blocked ? (
        <div className="overlay">
          <Card>
            <p>{t('task.blocked')}</p>
          </Card>
        </div>
      ) : null}
      {question ? (
        <div className="overlay">
          <Card>
            <AnswerBox
              intro={question.source === 'planned' ? t('probe.planned', { screen }) : undefined}
              prompt={question.source === 'planned' && question.probe ? question.probe : t('probe.atTransition', { screen })}
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
  const screen = run.cards().find((c) => c.screenKey === m.screenKey)?.screenName ?? ''
  return (
    <Card>
      <AnswerBox
        intro={i === 0 ? t('retro.intro') : undefined}
        prompt={t('probe.atTransition', { screen })}
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
  const download = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(run.toJSON(), null, 2)], { type: 'application/json' }))
    a.download = `hx-session-${run.participant || 'katilimci'}-${run.startedAt.slice(0, 19).replace(/[:T]/g, '-')}.json`
    a.click()
  }
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
            run.tasks = []
            run.warmup = { events: [], samples: [] }
            run.hardestTask = null
            setDeleted(true)
          }}
        >
          {t('session.delete')}
        </button>
      </div>
    </Card>
  )
}
