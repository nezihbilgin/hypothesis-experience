// Participant app entry. Study JSON: ?study=<url> (same origin or CORS-enabled), else a gitignored
// src/studies/*.local.json (real prototype links stay out of the repo), else the bundled placeholder example.
// Participant label: ?p=<label>.
import { parseStudy, type QuestionMoment, type Study } from '@hx/core'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import example from './studies/example.json'
const localStudies = import.meta.glob('./studies/*.local.json', { eager: true, import: 'default' })
// ?local=<name> picks ./studies/<name>.local.json; otherwise the first one alphabetically.
const localPick = new URLSearchParams(location.search).get('local')
const localStudy = (localPick ? localStudies[`./studies/${localPick}.local.json`] : undefined) ?? Object.entries(localStudies).sort(([a], [b]) => a.localeCompare(b))[0]?.[1]
import { SessionRun } from './run'
import { CameraCheck, Consent, ContextQuestions, FiveSecondTests, Hardest, Retro, Seq, Summary, TaskIntro, TaskRun, Warmup, Welcome } from './steps'
import { TextsCtx } from './ui'
import './style.css'

type Step =
  | { k: 'welcome' }
  | { k: 'consent' }
  | { k: 'check' }
  | { k: 'warmup' }
  | { k: 'context' }
  | { k: 'fivesec' }
  | { k: 'intro'; i: number }
  | { k: 'task'; i: number }
  | { k: 'retro'; i: number; moments: QuestionMoment[] }
  | { k: 'seq'; i: number }
  | { k: 'hardest' }
  | { k: 'summary' }

function Flow({ study, participant }: { study: Study; participant: string }) {
  const run = useMemo(() => new SessionRun(study, participant), [study, participant])
  // ?debug=1 exposes the run for automated end-to-end checks (still nothing leaves the browser).
  if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __hxRun: SessionRun }).__hxRun = run
  // Release the camera and microphone as soon as the tab is closed, reloaded or navigated away from, also when
  // the session ends early (the normal flow stops them at the last task). Browsers do this on unload too, but a
  // page kept in the back/forward cache would otherwise hold them.
  useEffect(() => {
    const release = () => run.stopSensing()
    window.addEventListener('pagehide', release)
    return () => {
      window.removeEventListener('pagehide', release)
      release()
    }
  }, [run])
  const [step, setStep] = useState<Step>({ k: 'welcome' })
  run.step = step.k
  const go = useCallback((s: Step) => setStep(s), [])
  const afterTask = (i: number) => (i + 1 < study.tasks.length ? go({ k: 'intro', i: i + 1 }) : go({ k: 'hardest' }))
  let view
  switch (step.k) {
    case 'welcome':
      view = <Welcome run={run} next={() => go({ k: 'consent' })} />
      break
    case 'consent':
      view = <Consent run={run} next={() => go({ k: 'check' })} />
      break
    case 'check':
      view = <CameraCheck run={run} next={() => go({ k: 'warmup' })} />
      break
    case 'warmup':
      view = <Warmup run={run} next={() => go({ k: 'context' })} />
      break
    case 'context':
      view = <ContextQuestions run={run} next={() => go({ k: 'fivesec' })} />
      break
    case 'fivesec':
      view = <FiveSecondTests run={run} next={() => go({ k: 'intro', i: 0 })} />
      break
    case 'intro':
      view = <TaskIntro key={`intro-${step.i}`} run={run} index={step.i} next={() => go({ k: 'task', i: step.i })} />
      break
    case 'task':
      view = <TaskRun key={`task-${step.i}`} run={run} next={(moments) => go(moments.length ? { k: 'retro', i: step.i, moments } : { k: 'seq', i: step.i })} />
      break
    case 'retro':
      view = <Retro key={`retro-${step.i}`} run={run} moments={step.moments} next={() => go({ k: 'seq', i: step.i })} />
      break
    case 'seq':
      view = <Seq key={`seq-${step.i}`} run={run} next={() => afterTask(step.i)} />
      break
    case 'hardest':
      view = <Hardest run={run} next={() => go({ k: 'summary' })} />
      break
    case 'summary':
      view = <Summary run={run} />
  }
  return <TextsCtx.Provider value={study.texts}>{view}</TextsCtx.Provider>
}

function App() {
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const [state, setState] = useState<{ study?: Study; errors?: string[] } | null>(null)
  useEffect(() => {
    const url = params.get('study')
    const load = async (): Promise<unknown> => (url ? (await fetch(url)).json() : localStudy ?? example)
    load()
      .then((json) => {
        const r = parseStudy(json)
        setState(r.ok ? { study: r.study } : { errors: r.errors })
      })
      .catch((err) => setState({ errors: [`Çalışma dosyası okunamadı: ${err}`] }))
  }, [])
  if (!state) return null
  if (state.errors)
    return (
      <main className="card">
        <h1>Çalışma dosyasında sorun var</h1>
        <ul>
          {state.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      </main>
    )
  return <Flow study={state.study!} participant={params.get('p') ?? ''} />
}

// No StrictMode: its double effects would duplicate warm-up events and restart the session clock.
createRoot(document.getElementById('root')!).render(<App />)
