// Researcher report (local, v1): load one or more session files, show the health block first, then per task the
// outcome, times, questions, mismatches, screen metrics and a static click map on reference images.
// Export: CSV of the metrics and a printable view (browser "Save as PDF"). Nothing is uploaded.
import { cardsFromTask, parseStudy, summarizeTask, type FaceMoment, type HypothesisCard, type ScreenStats, type Study } from '@hx/core'
import { createContext, Fragment, useContext, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import example from '../studies/example.json'
import '../style.css'
import './report.css'
import { atText, clickLegend, clicksByScreen, commentPosition, faceLine, FACE_LABEL, momentNoteId, sessionKey, stepNoteId, stuckMoments, stuckSignalsText, taskFaceMoments, typicalViewportHeight, type SessionComment, type StuckMoment, fmtSec, frictionText, highlights, metricsCsv, mismatchLines, parseSessionFile, pauseText, recompute, taskLine, taskTotals, visitText, type SessionFile, type SessionTask } from './data'
import { allFrameSizes, figmaFrames, hasFigmaFrames, type ReferenceImageProvider } from './images'

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


// ---- Researcher notes: kept in this browser (localStorage) per session, and saved into the session file on demand.
interface Notes {
  get: (id: string) => string
  set: (id: string, text: string) => void
}
const NotesCtx = createContext<Notes>({ get: () => '', set: () => {} })
const notesStoreKey = (s: SessionFile): string => `hx-report-notes:${sessionKey(s)}`
function loadNotes(s: SessionFile): Record<string, string> {
  try {
    return { ...(s.researcherNotes ?? {}), ...JSON.parse(localStorage.getItem(notesStoreKey(s)) ?? '{}') }
  } catch {
    return { ...(s.researcherNotes ?? {}) }
  }
}

/** Researcher's own note next to a moment or step card; printed as text in the PDF. */
function NoteField({ id, label }: { id: string; label: string }) {
  const notes = useContext(NotesCtx)
  const v = notes.get(id)
  return (
    <div className="note">
      <textarea className="no-print" rows={v ? 3 : 1} aria-label={label} placeholder="Araştırmacı notu…" value={v} onChange={(e) => notes.set(id, e.target.value)} />
      {v ? (
        <p className="print-only">
          <b>Araştırmacı notu:</b> {v}
        </p>
      ) : null}
    </div>
  )
}

/** Reference image sizes, for the viewport height of scrolling frames (comment positions). */
function useFrameSizes(): { w: number; h: number }[] {
  const [sizes, setSizes] = useState<{ w: number; h: number }[]>([])
  useEffect(() => {
    void allFrameSizes().then(setSizes)
  }, [])
  return sizes
}

function ClickMap({ screenKey, task, images }: { screenKey: string; task: SessionTask; images: ReferenceImageProvider }) {
  const group = clicksByScreen(task.events).get(screenKey) ?? { points: [], noPosition: 0 }
  const [size, setSize] = useState<Record<string, { w: number; h: number }>>({})
  const sizes = useFrameSizes()
  const comments = (task.comments ?? []).filter((c) => c.screenKey === screenKey)
  if (!group.points.length && !group.noPosition && !comments.length) return null
  const byNode = new Map<string, typeof group.points>()
  for (const p of group.points) byNode.set(p.node, [...(byNode.get(p.node) ?? []), p])
  const commentsOf = new Map<string, SessionComment[]>()
  for (const c of comments) {
    commentsOf.set(c.node, [...(commentsOf.get(c.node) ?? []), c])
    if (!byNode.has(c.node)) byNode.set(c.node, [])
  }
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
          <img src={img.url} alt={node} onLoad={(e) => {
              // Read the size now: the state updater may run later, when the event's currentTarget is already null.
              const z = { w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight }
              setSize((s) => ({ ...s, [node]: z }))
            }} />
          {sz ? l.drawable.map((p, i) => <span key={i} className={p.dead ? 'dot dead' : 'dot'} style={{ left: `${(p.x / sz.w) * 100}%`, top: `${(p.y / sz.h) * 100}%` }} />) : null}
          {sz
            ? (commentsOf.get(node) ?? []).map((c, i) => {
                const pos = commentPosition(c, sz, typicalViewportHeight(sizes, sz.w))
                const x = Math.min(Math.max(pos.x, 0), sz.w)
                const y = Math.min(Math.max(pos.y, 0), sz.h)
                const num = comments.indexOf(c) + 1
                if (pos.yRange)
                  // Scroll unknown: the point is somewhere on this vertical band (between not scrolled and scrolled to the end).
                  return (
                    <span key={`c${i}`} className="cband" style={{ left: `${(x / sz.w) * 100}%`, top: `${(pos.yRange[0] / sz.h) * 100}%`, height: `${((pos.yRange[1] - pos.yRange[0]) / sz.h) * 100}%` }} title={`${c.text} (konum yaklaşık: bu şeridin üzerinde bir yer)`}>
                      <span className="cpin approx">{num}</span>
                    </span>
                  )
                return (
                  <span key={`c${i}`} className="cpin" style={{ left: `${(x / sz.w) * 100}%`, top: `${(y / sz.h) * 100}%` }} title={c.text}>
                    {num}
                  </span>
                )
              })
            : null}
        </div>
        <figcaption>
          {node === screenKey ? null : <span className="muted">Ekranın başka bir durumu · </span>}
          <span className="lg"><i className="dot-lg" /> {l.working} çalışan</span>
          <span className="lg"><i className="dot-lg dead" /> {l.dead} tepkisiz</span>
          {l.outside ? <span className="lg">Tasarımın dışına tıklama: {l.outside}</span> : null}
          {commentsOf.get(node)?.length ? (
            <span className="lg">
              <i className="cpin-lg" /> {commentsOf.get(node)!.length} yorum
            </span>
          ) : null}
        </figcaption>
      </figure>
    ]
  })
  return (
    <div className="clickmaps">
      {maps}
      {unknown ? <p className="muted small">Konumu bilinmeyen tıklama: {unknown}</p> : null}
      {comments.length ? (
        <ol className="comments">
          {comments.map((c, i) => (
            <li key={i}>
              “{c.text}” <span className="muted small">({atText(c.t)}{!images.image(c.node) ? ', ekran görüntüsü yok' : size[c.node] && commentPosition(c, size[c.node], typicalViewportHeight(sizes, size[c.node].w)).approximate ? ', konum yaklaşık: ekran kaydırılmıştı, Figma kaydırma bilgisini göndermedi; nokta kesikli şeridin üzerinde bir yerde' : ''})</span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  )
}

const stepId = (taskId: string, screenKey: string): string => `step-${taskId}-${screenKey.replace(/[^\w-]/g, '-')}`
const pct = (v: number | null | undefined): string => (v === null || v === undefined ? '–' : `%${Math.round(v * 100)}`)

function StepCard({ task, s, cards, normalSec, firstScreen, face }: { task: SessionTask; s: ScreenStats; cards: HypothesisCard[]; normalSec: number; firstScreen: string | undefined; face: FaceMoment[] }) {
  const inVisit = (t: number): boolean => s.visits.some((v) => t >= Math.floor(v.start) && t < v.end)
  const moments = face.filter((m) => inVisit(m.t))
  const friction = frictionText(s)
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
            {friction ? (
              <>
                <dt>Sürtünme</dt>
                <dd>{friction}</dd>
              </>
            ) : null}
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
            {moments.length ? (
              <>
                <dt>Davranış</dt>
                <dd>
                  <ul className="timeline">
                    {moments.map((m, i) => (
                      <li key={i}>{faceLine(m)}</li>
                    ))}
                  </ul>
                </dd>
              </>
            ) : null}
          </dl>
          <NoteField id={stepNoteId(task.id, s.screenKey)} label={`${card?.screenName ?? s.screenKey} için araştırmacı notu`} />
        </div>
      </div>
    </article>
  )
}

const TL_W = 1000
const TL_LABEL = 150
const TL_FACE: Record<FaceMoment['kind'], string> = { still: 'hareketsiz (tıklamasız)', 'lean-in': 'ekrana yaklaştı', brow: 'kaş hareketi arttı', talk: 'kendi kendine konuştu', away: 'ekrandan uzaklaştı', 'blink-drop': 'göz kırpması azaldı' }
const TL_ROW = 22
const shortName = (cards: HypothesisCard[], k: string): string => cards.find((c) => c.screenKey === k)?.participantName ?? cards.find((c) => c.screenKey === k)?.screenName ?? k

/** Horizontal task timeline on the task clock (seconds from task start; question and comment time excluded). */
function TaskTimeline({ task, cards, face }: { task: SessionTask; cards: HypothesisCard[]; face: FaceMoment[] }) {
  const endSec = Math.max(1, task.endSec ?? task.events[task.events.length - 1]?.t ?? 1)
  const visits = task.report ? task.report.screens.flatMap((st) => st.visits.map((v) => ({ ...v, screenKey: st.screenKey, offPath: st.offPath }))).sort((a, b) => a.start - b.start) : []
  const clicks = task.events.filter((e) => e.type === 'click')
  const kinds = (['still', 'lean-in', 'brow', 'talk', 'away', 'blink-drop'] as FaceMoment['kind'][]).filter((k) => face.some((m) => m.kind === k))
  const rows = ['Ekran', 'Tıklama', 'Soru ve yorum', ...kinds.map((k) => TL_FACE[k])]
  const H = 22 + rows.length * TL_ROW
  const x = (t: number): number => TL_LABEL + (Math.min(Math.max(t, 0), endSec) / endSec) * (TL_W - TL_LABEL - 10)
  const step = endSec > 120 ? 20 : endSec > 60 ? 10 : 5
  const ticks = Array.from({ length: Math.floor(endSec / step) + 1 }, (_, i) => i * step)
  const y = (row: number): number => 18 + row * TL_ROW
  return (
    <figure className="timeline-fig">
      <svg viewBox={`0 0 ${TL_W} ${H}`} role="img" aria-label={`Görev zaman çizgisi, ${Math.round(endSec)} saniye`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={14} y2={H} className="tl-grid" />
            <text x={x(t)} y={10} className="tl-tick">
              {t} sn
            </text>
          </g>
        ))}
        {rows.map((r, i) => (
          <text key={r} x={0} y={y(i) + 14} className="tl-label">
            {r}
          </text>
        ))}
        {visits.map((v, i) => {
          const w = Math.max(1, x(v.end) - x(v.start))
          const name = shortName(cards, v.screenKey)
          return (
            <g key={i}>
              <title>{`${name}: ${atText(v.start)} – ${Math.round(v.end)}. sn${v.offPath ? ' (yol dışı)' : ''}`}</title>
              <rect x={x(v.start)} y={y(0) + 2} width={w} height={TL_ROW - 4} className={v.offPath ? 'tl-screen off' : i % 2 ? 'tl-screen alt' : 'tl-screen'} />
              {w > 46 ? (
                <text x={x(v.start) + 4} y={y(0) + 15} className="tl-screen-text">
                  {name.length > w / 6.5 ? name.slice(0, Math.max(3, Math.floor(w / 6.5) - 1)) + '…' : name}
                </text>
              ) : null}
            </g>
          )
        })}
        {clicks.map((e, i) => (
          <circle key={i} cx={x(e.t)} cy={y(1) + TL_ROW / 2} r={4} className={e.payload?.handled === false ? 'tl-click dead' : 'tl-click'}>
            <title>{`${atText(e.t)}: ${e.payload?.handled === false ? 'tepkisiz tıklama' : 'tıklama'}`}</title>
          </circle>
        ))}
        {task.questions.map((q, i) => {
          const t = (q.moment as { askedAt?: number }).askedAt
          if (typeof t !== 'number') return null
          return (
            <g key={`q${i}`}>
              <title>{`${atText(t)}: soru soruldu${q.answer ? ` · “${q.answer}”` : ''}`}</title>
              <rect x={x(t) - 5} y={y(2) + 6} width={10} height={10} transform={`rotate(45 ${x(t)} ${y(2) + 11})`} className="tl-question" />
            </g>
          )
        })}
        {(task.comments ?? []).map((c, i) => (
          <g key={`c${i}`}>
            <title>{`${atText(c.t)}: yorum · “${c.text}”`}</title>
            <circle cx={x(c.t)} cy={y(2) + 11} r={7} className="tl-comment" />
            <text x={x(c.t)} y={y(2) + 15} className="tl-comment-text">
              {(task.comments ?? []).filter((d) => d.screenKey === c.screenKey).indexOf(c) + 1}
            </text>
          </g>
        ))}
        {face.map((m, i) => {
          const row = 3 + kinds.indexOf(m.kind)
          return (
            <g key={`f${i}`}>
              <title>{faceLine(m)}</title>
              <rect x={x(m.t)} y={y(row) + 5} width={Math.max(3, x(m.t + m.sec) - x(m.t))} height={TL_ROW - 10} rx={3} className={`tl-face ${m.kind}`} />
            </g>
          )
        })}
      </svg>
      <figcaption className="muted small">Saniyeler görevin başından sayılır. Soru ve yorum yazılırken geçen süre sayılmaz; o anlar ◆ ve numaralı daire olarak görünür. Üzerine gelince ayrıntı çıkar.</figcaption>
    </figure>
  )
}

function StuckSection({ task, moments, cards }: { task: SessionTask; moments: StuckMoment[]; cards: HypothesisCard[] }) {
  if (!moments.length) return null
  return (
    <div className="stuck">
      <h4>Takılma anları</h4>
      <p className="muted small">Aynı ekranda birbirine yakın sürtünme işaretleri tek an olarak birleştirildi; aynı saniyelerde kamerada görülen davranışlar ve katılımcının söyledikleri yanında. Yorum senin.</p>
      <ol>
        {moments.slice(0, 6).map((m) => {
          const dur = Math.max(1, Math.round(m.end - m.start))
          return (
            <li key={m.id}>
              <p>
                <a href={`#${stepId(task.id, m.screenKey)}`}>
                  <b>{shortName(cards, m.screenKey)}</b>
                </a>{' '}
                <span className="muted">· {atText(m.start, dur > 1 ? dur : undefined)}</span>
              </p>
              <p>
                <span className="muted">Ne oldu:</span> {stuckSignalsText(m)}
              </p>
              {m.face.length ? (
                <p>
                  <span className="muted">Aynı anda kamerada:</span> {[...new Set(m.face.map((f) => f.kind))]
                    .map((k) => {
                      const secs = m.face.filter((f) => f.kind === k && k !== 'blink-drop').map((f) => `${f.sec} sn`)
                      return `${FACE_LABEL[k]}${secs.length ? ` (${secs.join(' + ')})` : ''}`
                    })
                    .join(', ')}
                </p>
              ) : null}
              {m.comments.map((c, i) => (
                <p key={i}>
                  <span className="muted">Yorumu ({atText(c.t)}):</span> “{c.text}”
                </p>
              ))}
              {m.answer ? (
                <p>
                  <span className="muted">Bu ekran için cevabı:</span> “{m.answer}”
                </p>
              ) : null}
              <NoteField id={momentNoteId(task.id, m.id)} label="Bu an için araştırmacı notu" />
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function TaskSection({ task, index, normalSec, face }: { task: SessionTask; index: number; normalSec: number; face: FaceMoment[] }) {
  const cards = cardsOf(task.id)
  const stuck = useMemo(() => stuckMoments(task, face, cards, normalSec), [task, face, cards, normalSec])
  const name = (k: string): string => cards.find((c) => c.screenKey === k)?.screenName ?? k
  const r = task.report
  const hl = highlights(task, cards)
  const LABEL: Record<string, string> = { mismatch: 'Sapma', dropped: 'Yarıda bırakma', rage: 'Art arda tıklama', loop: 'Gidip gelme', keyboard: 'Tıklamasız geçiş', comment: 'Yorum' }
  const steps = r ? [...r.screens].sort((a, b) => (a.visits[0]?.start ?? 0) - (b.visits[0]?.start ?? 0)) : []
  const line = taskLine(task)
  const sc = study?.scales.seq
  const scaleText = sc ? `${sc.min}${sc.labels[sc.min] ? ' ' + sc.labels[sc.min].toLocaleLowerCase('tr') : ''}, ${sc.max}${sc.labels[sc.max] ? ' ' + sc.labels[sc.max].toLocaleLowerCase('tr') : ''}` : '1 çok zor, 7 çok kolay'
  const firstScreen = steps[0]?.screenKey
  const tot = taskTotals(steps)
  return (
    <section className="task-section task-box">
      <header className="task-head">
        <span className="task-no">Görev {index + 1}</span>
        <h3>{task.prompt}</h3>
        <span className={`result-badge ${task.outcome?.result ?? ''}`}>{line.result}</span>
      </header>
      <p className="task-summary">
        {line.text}
        <br />
        <span className="muted">
          Katılımcının kendi puanı ({scaleText}): görevden önce {task.expectation ?? '–'} bekledi, sonra {task.seq ?? '–'} verdi.
        </span>
      </p>
      <StuckSection task={task} moments={stuck} cards={cards} />
      {r ? (
        <>
          <h4>Zaman çizgisi</h4>
          <TaskTimeline task={task} cards={cards} face={face} />
        </>
      ) : null}
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
            <StepCard key={s.screenKey} task={task} s={s} cards={cards} normalSec={normalSec} firstScreen={firstScreen} face={face} />
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
                    <td className="left">{frictionText(s) || '–'}</td>
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

/** Behaviour timeline needs a camera and a valid baseline; blendshape moments also need face signals on. */
function faceOf(s: SessionFile, t: SessionTask): FaceMoment[] {
  return taskFaceMoments(t, s.baseline, faceSignalsOn(s), !!s.capabilities?.hasCamera)
}

/** One session with its researcher notes (this browser's copy, plus notes saved in the file). */
function SessionView({ s, onNotes }: { s: SessionFile; onNotes: (notes: Record<string, string>) => void }) {
  const [notes, setNotes] = useState<Record<string, string>>(() => loadNotes(s))
  useEffect(() => onNotes(notes), [notes]) // eslint-disable-line react-hooks/exhaustive-deps
  const ctx = useMemo<Notes>(
    () => ({
      get: (id) => notes[id] ?? '',
      set: (id, text) =>
        setNotes((cur) => {
          const next = { ...cur, [id]: text }
          if (!text) delete next[id]
          try {
            localStorage.setItem(notesStoreKey(s), JSON.stringify(next))
          } catch {
            /* storage unavailable: notes stay for this page only */
          }
          return next
        })
    }),
    [notes, s]
  )
  const tasks = s.tasks.filter((t): t is SessionTask => !!t)
  return (
    <NotesCtx.Provider value={ctx}>
      <section className="session">
        <h2>
          {s.participant || 'Katılımcı'} · {s.startedAt.slice(0, 16).replace('T', ' ')}
        </h2>
        <div className="row no-print">
          <button onClick={() => download(`hx-session-${s.participant || 'katilimci'}-notlu.json`, JSON.stringify({ ...s, researcherNotes: notes }, null, 2), 'application/json')}>Notlarla birlikte oturum dosyasını indir</button>
          <span className="muted small">Notlar bu tarayıcıda da saklanır; dosyayı başka bir yerde açınca notlar dosyadan gelir.</span>
        </div>
        <ParticipantInfo s={s} />
        <Health s={s} />
        <FiveSecondSection s={s} />
        {tasks.map((t, i) => (
          <TaskSection key={t.id} task={t} index={i} normalSec={s.baseline?.firstActionP95 ?? 0} face={faceOf(s, t)} />
        ))}
        {s.hardestTask?.answer ? (
          <p>
            <b>En zor görev:</b> {s.hardestTask.answer}
          </p>
        ) : null}
      </section>
    </NotesCtx.Provider>
  )
}

function ParticipantInfo({ s }: { s: SessionFile }) {
  const a = (s.contextAnswers ?? []).filter((x) => x.answer)
  if (!a.length) return null
  return (
    <div className="participant-info">
      <h4>Katılımcı bilgisi</h4>
      <dl className="facts">
        {a.map((x) => (
          <Fragment key={x.id}>
            <dt>{x.text}</dt>
            <dd>{x.answer}</dd>
          </Fragment>
        ))}
      </dl>
    </div>
  )
}

function FiveSecondSection({ s }: { s: SessionFile }) {
  const rs = s.fiveSecondResults ?? []
  if (!rs.length) return null
  return (
    <section className="fivesec-report">
      <h3>5 saniye testi</h3>
      <p className="muted small">Ekran 5 saniye gösterildi, sonra hatırladıkları soruldu. Kamera ve tıklama ölçülmez.</p>
      {rs.map((r) => {
        const img = figmaFrames.image(r.screen)
        const name = study?.tasks.flatMap((t) => t.screens).find((x) => x.key === r.screen)?.name ?? r.screen
        return (
          <div key={r.id} className="fivesec-item">
            {img ? <img src={img.url} alt={name} /> : null}
            <div>
              <b>{name}</b>
              {r.shown ? (
                <dl className="facts">
                  {r.answers.map((q, i) => (
                    <Fragment key={i}>
                      <dt>{q.question}</dt>
                      <dd>{q.answer ? `“${q.answer}”` : 'boş bıraktı'}</dd>
                    </Fragment>
                  ))}
                </dl>
              ) : (
                <p className="muted">Ekran görüntüsü olmadığı için gösterilmedi.</p>
              )}
            </div>
          </div>
        )
      })}
    </section>
  )
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
  const [notesBySession, setNotesBySession] = useState<Record<string, Record<string, string>>>({})
  const csv = useMemo(() => (sessions.length ? metricsCsv(sessions, cardsOf, (s) => notesBySession[sessionKey(s)] ?? s.researcherNotes ?? {}) : ''), [sessions, notesBySession])
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
            <b>Sürtünme:</b> geri dönüş, tepkisiz tıklama (prototipte karşılığı olmayan), art arda tıklama (1 sn içinde aynı yere 3+), iki ekran arasında gidip gelme ve beklenen yolun dışına çıkma. Hiçbiri yoksa bu satır görünmez.
          </li>
          <li>
            <b>Takılma anları:</b> aynı ekranda birbirine yakın (3 sn içinde) sürtünme işaretleri tek an olarak birleşir; aynı saniyelerdeki kamera davranışları ve katılımcının o ekran için söyledikleri yanına yazılır. Her anın ve her adım kartının altına kendi notunu yazabilirsin; notlar PDF'te ve CSV'de görünür.
          </li>
          <li>
            <b>Zaman çizgisi:</b> saniyeler görevin başından sayılır, soru ve yorum yazarken geçen süre sayılmaz. Üstte ekranlar, altında tıklamalar, sorular, yorumlar ve kamerada görülen davranışlar.
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
          <li>
            <b>Yorumlar:</b> numaralı işaret, katılımcının ekranda seçip yorum yazdığı nokta. Kaydırılan ekranlarda kaydırma bilgisi Figma'dan sadece tıklamayla gelir; son 10 sn içinde o ekranda tıklama yoksa konum yaklaşıktır ve kesikli çizilir.
          </li>
          <li>
            <b>Davranış:</b> kamera açıksa ekranda gözlenen hareketler (hiç tıklamadan hareketsiz kalma, ekrana yaklaşma, kendi kendine konuşma, ekrandan uzaklaşma), katılımcının ısınmadaki kendi normaline göre. "Görev başından 24.–42. sn" o davranışın görevin hangi saniyelerinde sürdüğünü gösterir. Duygu ya da niyet çıkarımı yapılmaz.
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
        <SessionView key={sessionKey(s) + i} s={s} onNotes={(n) => setNotesBySession((cur) => ({ ...cur, [sessionKey(s)]: n }))} />
      ))}
    </main>
  )
}

// Printing (PDF): open every collapsed section first so nothing is missing from the printout.
window.addEventListener('beforeprint', () => document.querySelectorAll('details').forEach((d) => (d.open = true)))

createRoot(document.getElementById('root')!).render(<App />)
