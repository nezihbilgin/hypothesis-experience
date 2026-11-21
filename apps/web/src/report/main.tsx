// Researcher report (local, v1): load one or more session files, show the health block first, then per task the
// outcome, times, questions, mismatches, screen metrics and a static click map on reference images.
// Export: CSV of the metrics and a printable view (browser "Save as PDF"). Nothing is uploaded.
import { cardsFromTask, parseStudy, summarizeTask, type HypothesisCard, type Study } from '@hx/core'
import { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import example from '../studies/example.json'
import '../style.css'
import './report.css'
import { clickLegend, clicksByScreen, highlights, metricsCsv, mismatchLines, parseSessionFile, recompute, type SessionFile, type SessionTask } from './data'
import { figmaFrames, hasFigmaFrames, type ReferenceImageProvider } from './images'

const localStudies = import.meta.glob('../studies/*.local.json', { eager: true, import: 'default' })
const pick = new URLSearchParams(location.search).get('local')
const studyJson = (pick ? localStudies[`../studies/${pick}.local.json`] : undefined) ?? Object.entries(localStudies).sort(([a], [b]) => a.localeCompare(b))[0]?.[1] ?? example
const parsed = parseStudy(studyJson)
const study: Study | null = parsed.ok ? parsed.study : null
const cardsOf = (taskId: string): HypothesisCard[] => {
  const t = study?.tasks.find((x) => x.id === taskId)
  return t ? cardsFromTask(t) : []
}
const RESULT: Record<string, string> = { direct: 'Doğrudan başarı', indirect: 'Dolaylı başarı', failed: 'Başarısız', dropped: 'Yarıda bıraktı' }
const FLAG: Record<string, string> = {
  'low-fps': 'Düşük fps',
  'face-missing': 'Yüz sık kayboldu',
  'unknown-screens': 'Tanımsız ekran var',
  'missing-transitions': 'Geçişe yol açmayan tıklama',
  'baseline-invalid': 'Baseline geçersiz',
  'not-completed': 'Oturum tamamlanmadı',
  'target-not-reached': 'Hedefe ulaşılmayan görev',
  'many-dont-remember': 'Çok "Hatırlamıyorum"'
}
const n = (v: number | null | undefined, d = 1): string => (v === null || v === undefined ? '–' : String(Math.round(v * 10 ** d) / 10 ** d))

function download(name: string, text: string, type: string): void {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

function ClickMap({ screenKey, task, images }: { screenKey: string; task: SessionTask; images: ReferenceImageProvider }) {
  const group = clicksByScreen(task.events).get(screenKey)
  const [size, setSize] = useState<Record<string, { w: number; h: number }>>({})
  if (!group || (!group.points.length && !group.noPosition)) return null
  const byNode = new Map<string, typeof group.points>()
  for (const p of group.points) byNode.set(p.node, [...(byNode.get(p.node) ?? []), p])
  let unknown = group.noPosition
  const maps = [...byNode].flatMap(([node, pts]) => {
    const img = images.image(node)
    if (!img) {
      unknown += pts.length
      return []
    }
    const sz = size[node]
    const l = clickLegend(pts, sz, node)
    return [
      <figure key={node} className="clickmap">
        <div className="clickmap-frame">
          <img src={img.url} alt={node} onLoad={(e) => setSize((s) => ({ ...s, [node]: { w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight } }))} />
          {sz ? l.drawable.map((p, i) => <span key={i} className={p.dead ? 'dot dead' : 'dot'} style={{ left: `${(p.x / sz.w) * 100}%`, top: `${(p.y / sz.h) * 100}%` }} />) : null}
        </div>
        <figcaption>
          {node === screenKey ? null : <span className="muted">Ekranın başka bir durumu · </span>}
          <span className="lg"><i className="dot-lg" /> {l.working} çalışan</span>
          <span className="lg"><i className="dot-lg dead" /> {l.dead} tepkisiz</span>
          {l.outside ? <span className="lg">Tasarımın dışına tıklama: {l.outside}</span> : null}
        </figcaption>
      </figure>
    ]
  })
  return (
    <div className="clickmaps">
      {maps}
      {unknown ? <p className="muted small">Konumu bilinmeyen tıklama: {unknown}</p> : null}
    </div>
  )
}

function Mismatches({ task, cards }: { task: SessionTask; cards: HypothesisCard[] }) {
  const r = task.report
  if (!r?.mismatches.length) return null
  const name = (k: string): string => cards.find((c) => c.screenKey === k)?.screenName ?? k
  return (
    <ul className="mismatches">
      {r.mismatches.map((m, i) => {
        const l = mismatchLines(m, cards.find((c) => c.screenKey === m.screenKey), r.screens.find((x) => x.screenKey === m.screenKey))
        return (
          <li key={i}>
            <b>{name(m.screenKey)}</b>
            <br />
            <span className="muted">Hipotez:</span> {l.hypothesis}
            <br />
            <span className="muted">Gözlem:</span> {l.observation}
          </li>
        )
      })}
    </ul>
  )
}

function TaskSection({ task, faceOn }: { task: SessionTask; faceOn: boolean }) {
  const cards = cardsOf(task.id)
  const name = (k: string): string => cards.find((c) => c.screenKey === k)?.screenName ?? k
  const r = task.report
  const hl = highlights(task, cards)
  const LABEL: Record<string, string> = { mismatch: 'Sapma', dropped: 'Yarıda bırakma', rage: 'Art arda tıklama', loop: 'Gidip gelme' }
  return (
    <section className="task-section">
      <h3>{task.prompt}</h3>
      <p className="task-summary">
        <span>
          Beklenen zorluk {task.expectation ?? '–'} → SEQ {task.seq ?? '–'}
        </span>
        <span className={`result ${task.outcome?.result ?? ''}`}>{task.outcome?.result ? RESULT[task.outcome.result] : 'Sonuç yok'}</span>
        <span>
          {n(task.endSec, 0)} sn{r?.orientationSec != null ? ` (yönelim ${n(r.orientationSec, 0)} sn)` : ''}
        </span>
      </p>
      {hl.length ? (
        <div className="highlights">
          <h4>Öne çıkan anlar</h4>
          <ul>
            {hl.map((h, i) => (
              <li key={i}>
                <span className="hl-kind">{LABEL[h.kind]}</span> <b>{h.title}</b>
                {h.hypothesis ? (
                  <>
                    <br />
                    <span className="muted">Hipotez:</span> {h.hypothesis}
                  </>
                ) : null}
                <br />
                <span className="muted">Gözlem:</span> {h.observation}
                {h.answer ? (
                  <>
                    <br />
                    <span className="muted">Katılımcının cevabı:</span> “{h.answer}”
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="muted">Öne çıkan bir an yok.</p>
      )}
      <details>
        <summary>Tüm sapmalar, sorular ve ekran ayrıntıları</summary>
        <h4>Sapmalar</h4>
        <Mismatches task={task} cards={cards} />
        {task.questions.length ? (
          <div className="answers">
            <h4>Sorular</h4>
            <ul>
              {task.questions.map((q, i) => (
                <li key={i}>
                  <span className="muted">
                    {name(q.moment.screenKey)} · {q.moment.source === 'planned' ? q.moment.probe : 'sinyalle sorulan soru'}
                  </span>
                  <br />
                  {q.answer ?? (q.dontRemember ? '(hatırlamıyorum)' : '(geçti)')}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {r ? (
          <>
            <h4>Ekranlar</h4>
            {!faceOn ? (
              <p className="muted small">
                Duraksama: ekranda ilk tıklamaya kadar geçen süre, katılımcının ısınmadaki kendi eşiğine göre 0-100. Görevin ilk ekranında yönelim süresi hariç.
              </p>
            ) : (
              <p className="muted small">Efor: ilk tıklamaya kadar duraksama ve yüz sinyalleri (hareketsizlik, göz kırpma, ekrana yaklaşma), kendi ısınmasına göre 0-100.</p>
            )}
            <table className="metrics">
              <thead>
                <tr>
                  <th>Ekran</th>
                  <th>Ziyaret, süre</th>
                  <th>{faceOn ? 'Efor' : 'Duraksama'}</th>
                  <th>Sürtünme</th>
                  <th>Geri</th>
                  <th>Loop</th>
                  <th>Misclick</th>
                  <th>Rage</th>
                </tr>
              </thead>
              <tbody>
                {r.screens.map((s) => (
                  <tr key={s.screenKey} className={s.offPath ? 'offpath' : ''}>
                    <td>
                      {name(s.screenKey)}
                      {s.offPath ? ' (yol dışı)' : ''}
                    </td>
                    <td>
                      {s.visits.length} ziyaret, toplam {n(s.durationSec, 0)} sn
                    </td>
                    <td>{s.observed.effort}</td>
                    <td>{s.observed.friction}</td>
                    <td>{s.backs}</td>
                    <td>{s.loops ?? 0}</td>
                    <td>{s.misclickRate === null || s.misclickRate === undefined ? '–' : `%${Math.round(s.misclickRate * 100)}`}</td>
                    <td>{s.rageClicks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {r.screens.map((s) => (
              <div key={s.screenKey} className="clickmap-block">
                <h4>{name(s.screenKey)}</h4>
                <ClickMap screenKey={s.screenKey} task={task} images={figmaFrames} />
              </div>
            ))}
          </>
        ) : null}
      </details>
    </section>
  )
}

function faceSignalsOn(s: SessionFile): boolean {
  return !!study?.faceSignals && !!s.consent?.faceSignals && !!s.capabilities?.hasCamera
}

function Health({ s }: { s: SessionFile }) {
  const h = s.health
  const face = !study?.faceSignals ? 'Yüz sinyalleri bu çalışmada kapalı' : faceSignalsOn(s) ? 'Yüz sinyalleri açık' : 'Yüz sinyalleri bu oturumda kullanılmadı (onay ya da kamera yok)'
  if (!h) return <p className="muted small">{face} · Bu dosyada sağlık bloğu yok (eski sürüm).</p>
  return (
    <div className="health">
      <div className="flags">{h.flags.length ? h.flags.map((f) => <span key={f} className="flag">{FLAG[f] ?? f}</span>) : <span className="flag ok">Sorun görünmüyor</span>}</div>
      <p className="muted small">
        {face} · süre {n(h.sessionSec / 60)} dk · kamera {h.camera.on ? `açık, fps ${n(h.camera.fpsMedian, 0)} (p10 ${n(h.camera.fpsP10, 0)}), yüz %${Math.round((h.camera.faceShare ?? 0) * 100)}` : 'kapalı'} · ısınma {n(h.warmup.durationSec)} sn, {h.warmup.clicks} tıklama · tanımsız ekran {h.prototype.unknownScreens} · geçişsiz tıklama {h.prototype.clicksWithoutTransition} · soru {h.questions.asked} (geç {h.questions.skipped}, hatırlamıyorum {h.questions.dontRemember})
      </p>
    </div>
  )
}

function StudySummary({ sessions }: { sessions: SessionFile[] }) {
  if (!study || sessions.length < 2) return null
  return (
    <section className="task-section">
      <h2>Çalışma özeti ({sessions.length} oturum)</h2>
      {study.tasks.map((t) => {
        const cards = cardsFromTask(t)
        const parts = sessions.flatMap((s) => s.tasks.filter((x): x is SessionTask => !!x && x.id === t.id && !!x.report).map((x) => ({ participant: s.participant, report: x.report!, outcome: x.outcome, taskSec: x.endSec })))
        const sum = summarizeTask(cards, parts)
        return (
          <div key={t.id}>
            <h3>{t.prompt}</h3>
            <p>
              Doğrudan {sum.results.direct} · dolaylı {sum.results.indirect} · başarısız {sum.results.failed} · yarıda {sum.results.dropped} · medyan görev süresi {n(sum.medianTaskSec)} sn · medyan yönelim {n(sum.medianOrientationSec)} sn
            </p>
            <table className="metrics">
              <thead>
                <tr>
                  <th>Ekran</th>
                  <th>Ulaşan</th>
                  <th>Sapmalı</th>
                  <th>Yol dışı</th>
                  <th>Loop</th>
                  <th>Misclick</th>
                  <th>Rage</th>
                  <th>Burada bıraktı</th>
                </tr>
              </thead>
              <tbody>
                {sum.screens
                  .filter((s) => s.reached || s.droppedHere)
                  .map((s) => (
                    <tr key={s.screenKey}>
                      <td>{s.screenName}</td>
                      <td>{s.reached}</td>
                      <td>{s.withMismatch}</td>
                      <td>{s.offPath}</td>
                      <td>{s.loops}</td>
                      <td>{s.misclickRate === null ? '–' : `%${Math.round(s.misclickRate * 100)}`}</td>
                      <td>{s.rageClicks}</td>
                      <td>{s.droppedHere}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )
      })}
    </section>
  )
}

function App() {
  const [sessions, setSessions] = useState<SessionFile[]>([])
  const [error, setError] = useState<string | null>(null)
  const csv = useMemo(() => (sessions.length ? metricsCsv(sessions, cardsOf) : ''), [sessions])
  const load = async (files: FileList | null): Promise<void> => {
    if (!files) return
    try {
      const out: SessionFile[] = []
      // Reports are recomputed with the current model and study file (older files read the same way).
      for (const f of Array.from(files)) out.push(recompute(parseSessionFile(await f.text()), study, cardsOf))
      setSessions(out)
      setError(null)
    } catch (e) {
      setError(String(e))
    }
  }
  return (
    <main className="card wide report">
      <h1>Rapor {study ? `· ${study.name}` : ''}</h1>
      <div className="no-print">
        <p className="muted">Oturum dosyalarını seç (birden fazla seçebilirsin). Dosyalar bu tarayıcıda açılır, hiçbir yere gönderilmez.</p>
        <input type="file" accept="application/json,.json" multiple onChange={(e) => void load(e.target.files)} />
        {!hasFigmaFrames() ? <p className="muted small">Tıklama haritası için ekran görüntüleri bulunamadı (frames.local/).</p> : null}
        {error ? <p className="hint">{error}</p> : null}
        {sessions.length ? (
          <div className="row">
            <button onClick={() => download('hx-metrikler.csv', csv, 'text/csv;charset=utf-8')}>CSV indir</button>
            <button onClick={() => window.print()}>PDF olarak yazdır</button>
          </div>
        ) : null}
      </div>
      <StudySummary sessions={sessions} />
      {sessions.map((s, i) => (
        <section key={i} className="session">
          <h2>{s.participant || 'Katılımcı'} · {s.startedAt.slice(0, 16).replace('T', ' ')}</h2>
          <Health s={s} />
          {s.tasks.filter((t): t is SessionTask => !!t).map((t) => (
            <TaskSection key={t.id} task={t} faceOn={faceSignalsOn(s)} />
          ))}
          {s.hardestTask?.answer ? <p><b>En zor görev:</b> {s.hardestTask.answer}</p> : null}
        </section>
      ))}
    </main>
  )
}

// Printing (PDF): open every collapsed section first so nothing is missing from the printout.
window.addEventListener('beforeprint', () => document.querySelectorAll('details').forEach((d) => (d.open = true)))

createRoot(document.getElementById('root')!).render(<App />)
