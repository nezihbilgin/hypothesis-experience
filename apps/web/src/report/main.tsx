// Researcher report (local, v1): load one or more session files, show the health block first, then per task the
// outcome, times, questions, mismatches, screen metrics and a static click map on reference images.
// Export: CSV of the metrics and a printable view (browser "Save as PDF"). Nothing is uploaded.
import { cardsFromTask, parseStudy, summarizeTask, type HypothesisCard, type ScreenStats, type Study } from '@hx/core'
import { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import example from '../studies/example.json'
import '../style.css'
import './report.css'
import { clickLegend, clicksByScreen, fmtSec, frictionText, highlights, metricsCsv, mismatchLines, parseSessionFile, pauseText, recompute, taskLine, taskTotals, visitText, type SessionFile, type SessionTask } from './data'
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
const FLAG: Record<string, string> = {
  'low-fps': 'Düşük fps',
  'face-missing': 'Yüz sık kayboldu',
  'unknown-screens': 'Tanımsız ekran var',
  'missing-transitions': 'Geçişe yol açmayan tıklama',
  'baseline-invalid': 'Baseline geçersiz',
  'not-completed': 'Oturum tamamlanmadı',
  'target-not-reached': 'Hedefe ulaşılmayan görev',
  'many-dont-remember': 'Çok "Hatırlamıyorum"',
  'clickless-transitions': 'Tıklamasız geçiş (muhtemelen klavye)'
}
const FACE: Record<string, string> = { 'blink-drop': 'göz kırpma azaldı', stillness: 'hareketsizlik arttı', 'lean-in': 'ekrana yaklaştı', brow: 'kaş hareketi arttı' }
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

const stepId = (taskId: string, screenKey: string): string => `step-${taskId}-${screenKey.replace(/[^\w-]/g, '-')}`
const pct = (v: number | null | undefined): string => (v === null || v === undefined ? '–' : `%${Math.round(v * 100)}`)

function StepCard({ task, s, cards, normalSec, firstScreen }: { task: SessionTask; s: ScreenStats; cards: HypothesisCard[]; normalSec: number; firstScreen: string | undefined }) {
  const pause = pauseText(s, normalSec, s.screenKey === firstScreen)
  const card = cards.find((c) => c.screenKey === s.screenKey)
  const r = task.report!
  const mms = r.mismatches.filter((m) => m.screenKey === s.screenKey)
  const qs = task.questions.filter((q) => q.moment.screenKey === s.screenKey)
  return (
    <article className={s.offPath ? 'step offpath' : 'step'} id={stepId(task.id, s.screenKey)}>
      <header>
        <b>{card?.screenName ?? s.screenKey}</b>
        {card?.participantName ? <span className="muted"> · katılımcıya: “{card.participantName}”</span> : null}
        {s.offPath ? <span className="badge">yol dışı</span> : null}
        {s.clicklessArrivals ? <span className="badge warn">{s.clicklessArrivals} tıklamasız geçiş (muhtemelen klavye)</span> : null}
      </header>
      <div className="step-body">
        <div className="step-map">
          <ClickMap screenKey={s.screenKey} task={task} images={figmaFrames} />
        </div>
        <div className="step-text">
          {mms.length ? (
            mms.map((m, i) => {
              const l = mismatchLines(m, card, s)
              return (
                <p key={i}>
                  <span className="muted">Hipotez:</span> {l.hypothesis}
                  <br />
                  <span className="muted">Gözlem:</span> {l.observation}
                </p>
              )
            })
          ) : (
            <p className="muted">Hipotezle uyumlu.</p>
          )}
          {qs.map((q, i) => (
            <p key={i} className="qa">
              <span className="muted">{q.moment.source === 'planned' ? q.moment.probe : 'Sinyalle sorulan soru'}</span>
              <br />“{q.answer ?? (q.dontRemember ? 'hatırlamıyorum' : 'geçti')}”
            </p>
          ))}
          <dl className="facts">
            <dt>Ziyaret</dt>
            <dd>{visitText(s)}</dd>
            <dt>Duraksama</dt>
            <dd className={pause.flagged ? 'flagged' : ''}>
              {pause.text}
              {pause.flagged ? ' · normalinin 2 katını ve 3 sn\'yi aştı' : ''}
            </dd>
            <dt>Sürtünme</dt>
            <dd>{frictionText(s)}</dd>
            <dt>Tıklamalar</dt>
            <dd>
              {s.clicks ?? 0} tıklama, {s.deadClicks} tepkisiz{s.misclickRate != null ? ` (%${Math.round(s.misclickRate * 100)})` : ''}
              {s.rageClicks ? `, ${s.rageClicks} kez art arda` : ''}
            </dd>
            {s.faceSupport.length ? (
              <>
                <dt>Yüz sinyalleri</dt>
                <dd>{s.faceSupport.map((f) => FACE[f] ?? f).join(', ')}</dd>
              </>
            ) : null}
          </dl>
        </div>
      </div>
    </article>
  )
}

function TaskSection({ task, normalSec }: { task: SessionTask; normalSec: number }) {
  const cards = cardsOf(task.id)
  const name = (k: string): string => cards.find((c) => c.screenKey === k)?.screenName ?? k
  const r = task.report
  const hl = highlights(task, cards)
  const LABEL: Record<string, string> = { mismatch: 'Sapma', dropped: 'Yarıda bırakma', rage: 'Art arda tıklama', loop: 'Gidip gelme', keyboard: 'Tıklamasız geçiş' }
  const steps = r ? [...r.screens].sort((a, b) => (a.visits[0]?.start ?? 0) - (b.visits[0]?.start ?? 0)) : []
  const line = taskLine(task)
  const sc = study?.scales.seq
  const scaleText = sc ? `${sc.min}${sc.labels[sc.min] ? ' ' + sc.labels[sc.min].toLocaleLowerCase('tr') : ''}, ${sc.max}${sc.labels[sc.max] ? ' ' + sc.labels[sc.max].toLocaleLowerCase('tr') : ''}` : '1 çok zor, 7 çok kolay'
  const firstScreen = steps[0]?.screenKey
  const tot = taskTotals(steps)
  return (
    <section className="task-section">
      <h3>{task.prompt}</h3>
      <p className="task-summary">
        <span className={`result ${task.outcome?.result ?? ''}`}>{line.result}</span> · {line.text}
        <br />
        <span className="muted">
          Katılımcının kendi puanı ({scaleText}): görevden önce {task.expectation ?? '–'} bekledi, sonra {task.seq ?? '–'} verdi.
        </span>
      </p>
      {hl.length ? (
        <div className="highlights">
          <h4>Öne çıkan anlar</h4>
          <ul>
            {hl.map((h, i) => (
              <li key={i}>
                <span className="hl-kind">{LABEL[h.kind]}</span> <a href={`#${stepId(task.id, h.screenKey)}`}>{h.title}</a>
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
      {r ? (
        <>
          <h4>Adım adım</h4>
          {steps.map((s) => (
            <StepCard key={s.screenKey} task={task} s={s} cards={cards} normalSec={normalSec} firstScreen={firstScreen} />
          ))}
          <details>
            <summary>Görev özeti (CSV ile aynı veri)</summary>
            <table className="metrics">
              <thead>
                <tr>
                  <th title="Ekran, görevdeki ilk ziyaret sırasıyla">Adım</th>
                  <th title="Bu ekrana kaç kez geldi">Ziyaret</th>
                  <th title="Bu ekranda toplam kalınan süre">Süre</th>
                  <th title="Ekran açıldıktan ilk tıklamaya kadar geçen süre">İlk tıklamaya kadar</th>
                  <th title="Geri dönüş, tepkisiz tıklama, art arda tıklama, gidip gelme, yol dışı">Sürtünme işaretleri</th>
                  <th title="Beklenen sıradan geriye giden geçiş">Geri</th>
                  <th title="Aynı iki ekran arasında A→B→A→B">Gidip gelme</th>
                  <th>Tıklama</th>
                  <th title="Prototipte karşılığı olmayan tıklama">Tepkisiz</th>
                  <th title="Tepkisiz tıklama / tüm tıklama">Misclick</th>
                  <th title="1 sn içinde aynı yere 3+ tıklama">Art arda</th>
                </tr>
              </thead>
              <tbody>
                {steps.map((s) => (
                  <tr key={s.screenKey} className={s.offPath ? 'offpath' : ''}>
                    <td>
                      {name(s.screenKey)}
                      {s.offPath ? ' (yol dışı)' : ''}
                    </td>
                    <td>{s.visits.length}</td>
                    <td>{fmtSec(s.durationSec)}</td>
                    <td>{s.screenKey === firstScreen && s.orientationSec !== undefined ? `${fmtSec(s.orientationSec)} (yönelim)` : fmtSec(s.firstActionSec)}</td>
                    <td className="left">{frictionText(s)}</td>
                    <td>{s.backs}</td>
                    <td>{s.loops ?? 0}</td>
                    <td>{s.clicks ?? 0}</td>
                    <td>{s.deadClicks}</td>
                    <td>{pct(s.misclickRate)}</td>
                    <td>{s.rageClicks}</td>
                  </tr>
                ))}
                <tr className="total">
                  <td>Toplam</td>
                  <td>{tot.visits}</td>
                  <td>{fmtSec(tot.durationSec)}</td>
                  <td>–</td>
                  <td>–</td>
                  <td>{tot.backs}</td>
                  <td>{tot.loops}</td>
                  <td>{tot.clicks}</td>
                  <td>{tot.dead}</td>
                  <td>{pct(tot.misclickRate)}</td>
                  <td>{tot.rage}</td>
                </tr>
              </tbody>
            </table>
          </details>
        </>
      ) : null}
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
        {face} · süre {n(h.sessionSec / 60)} dk · kamera {h.camera.on ? `açık, fps ${n(h.camera.fpsMedian, 0)} (p10 ${n(h.camera.fpsP10, 0)}), yüz %${Math.round((h.camera.faceShare ?? 0) * 100)}` : 'kapalı'} · ısınma {n(h.warmup.durationSec)} sn, {h.warmup.clicks} tıklama · tanımsız ekran {h.prototype.unknownScreens} · geçişsiz tıklama {h.prototype.clicksWithoutTransition} · tıklamasız geçiş {h.prototype.clicklessTransitions ?? '–'} · soru {h.questions.asked} (geç {h.questions.skipped}, hatırlamıyorum {h.questions.dontRemember})
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
      <details className="howto">
        <summary>Bu rapor nasıl okunur?</summary>
        <ul>
          <li>
            <b>Hipotez / Gözlem:</b> hipotez, çalışma dosyasında o ekran için yazdığın beklenti (akış: takılmadan geçmesi; okuma: dikkatle okuması; karar: seçenekleri tartması). Gözlem, katılımcının o ekranda yaptığı.
          </li>
          <li>
            <b>Duraksama:</b> ekran açıldıktan ilk tıklamaya kadar geçen saniye. Yanında katılımcının ısınma görevindeki kendi normali yazar; normalinin 2 katını ve 3 sn'yi geçerse işaretlenir. Görevin ilk ekranındaki bekleme (görevi okuyup etrafa bakınma) yönelim süresidir ve duraksama sayılmaz.
          </li>
          <li>
            <b>Sürtünme:</b> geri dönüş, tepkisiz tıklama (prototipte karşılığı olmayan), art arda tıklama (1 sn içinde aynı yere 3+), iki ekran arasında gidip gelme ve beklenen yolun dışına çıkma. Hiçbiri yoksa "Sorun işareti yok".
          </li>
          <li>
            <b>Sonuç:</b> doğrudan başarı (beklenen yoldan hedefe), dolaylı başarı (yol dışı ekranlardan ya da tıklamasız geçişle hedefe), başarısız (hedefe ulaşmadan bitirdi), yarıda bıraktı.
          </li>
          <li>
            <b>Puanlar:</b> görevden önce beklediği zorluk ve görevden sonra verdiği puan, çalışmadaki ölçeğe göre (varsayılan 1 çok zor, 7 çok kolay).
          </li>
          <li>
            <b>Tıklama haritası:</b> mavi nokta çalışan, kırmızı nokta tepkisiz tıklama. Tasarımın dışına yapılan tıklamalar sayı olarak yazılır.
          </li>
        </ul>
      </details>
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
            <TaskSection key={t.id} task={t} normalSec={s.baseline?.firstActionP95 ?? 0} />
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
