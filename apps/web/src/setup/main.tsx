// Setup screen v0 (researcher, local): build a study without writing JSON. Output is the study JSON the app reads
// (study-level screens, tasks with expectedPath). Nothing is uploaded; save the file as
// apps/web/src/studies/<name>.local.json (gitignored) to run it.
import { BEHAVIOR_EXPECT, CONTEXT_QUESTIONS_SOFT_MAX, parseStudy, type Behavior } from '@hx/core'
import { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../style.css'
import './setup.css'
import { figmaFrames } from '../report/images'
import { allNodes, emptyStudy, nodesFromSession, toEditor, toStudyJson, type EditorContextQuestion, type EditorFiveSecond, type EditorScreen, type EditorStudy, type EditorTask } from './model'

const BEHAVIORS: { v: Behavior; label: string }[] = [
  { v: 'flow', label: 'Akış (takılmadan geçmeli)' },
  { v: 'read', label: 'Okuma (dikkatle okumalı)' },
  { v: 'decide', label: 'Karar (seçenekleri tartmalı)' }
]
void BEHAVIOR_EXPECT
const CONTEXTS = [
  { v: 'consumer', label: 'Tüketici' },
  { v: 'workplace', label: 'İşyeri (yüz sinyalleri varsayılan kapalı)' },
  { v: 'education', label: 'Eğitim (yüz sinyalleri varsayılan kapalı)' },
  { v: 'other', label: 'Diğer' }
] as const

const num = (v: string): number => (Number.isFinite(Number(v)) ? Number(v) : 0)
const list = (v: string): string[] =>
  v
    .split(/[,\s]+/)
    .map((x) => x.trim())
    .filter(Boolean)

function readFile(f: File): Promise<unknown> {
  return f.text().then((t) => JSON.parse(t))
}

function ScreensEditor({ s, set }: { s: EditorStudy; set: (s: EditorStudy) => void }) {
  const up = (i: number, patch: Partial<EditorScreen>) => set({ ...s, screens: s.screens.map((x, j) => (j === i ? { ...x, ...patch } : x)) })
  const add = (keys: string[]) => {
    const known = new Set(allNodes(s))
    const fresh = keys.filter((k) => !known.has(k)).map((key): EditorScreen => ({ key, name: key, behavior: 'flow', expectedSec: [3, 15] }))
    set({ ...s, screens: [...s.screens, ...fresh] })
  }
  return (
    <section>
      <h2>Ekranlar</h2>
      <p className="muted small">
        Her ekran bir kez tanımlanır, görevler bu listeden seçer. Anahtar: Figma node id (örn. 1:2). Takma adlar: aynı ekranın başka durumlarının node id'leri (virgülle). Katılımcıya görünen ad sorularda kullanılır; boşsa ekran adı söylenmez.
      </p>
      <div className="row">
        <button onClick={() => add([`yeni-${s.screens.length + 1}`])}>Ekran ekle</button>
        <label className="filebtn">
          Oturum dosyasından ekranları al
          <input type="file" accept=".json,application/json" onChange={async (e) => e.target.files?.[0] && add(nodesFromSession(await readFile(e.target.files[0])))} />
        </label>
      </div>
      <table className="edit">
        <thead>
          <tr>
            <th>Anahtar (node id)</th>
            <th>Ad (araştırmacı)</th>
            <th>Katılımcıya görünen ad</th>
            <th>Davranış</th>
            <th>Beklenen süre (sn)</th>
            <th>Takma adlar (durumlar)</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {s.screens.map((x, i) => (
            <tr key={i}>
              <td>
                <input value={x.key} onChange={(e) => up(i, { key: e.target.value.trim() })} />
              </td>
              <td>
                <input value={x.name} onChange={(e) => up(i, { name: e.target.value })} />
              </td>
              <td>
                <input value={x.participantName ?? ''} onChange={(e) => up(i, { participantName: e.target.value || undefined })} />
              </td>
              <td>
                <select value={x.behavior} onChange={(e) => up(i, { behavior: e.target.value as Behavior })}>
                  {BEHAVIORS.map((b) => (
                    <option key={b.v} value={b.v}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </td>
              <td className="nowrap">
                <input className="n" type="number" min={0} value={x.expectedSec[0]} onChange={(e) => up(i, { expectedSec: [num(e.target.value), x.expectedSec[1]] })} /> –{' '}
                <input className="n" type="number" min={0} value={x.expectedSec[1]} onChange={(e) => up(i, { expectedSec: [x.expectedSec[0], num(e.target.value)] })} />
              </td>
              <td>
                <input value={(x.aliases ?? []).join(', ')} onChange={(e) => up(i, { aliases: list(e.target.value) })} />
              </td>
              <td>
                <button className="link" onClick={() => set({ ...s, screens: s.screens.filter((_, j) => j !== i) })}>
                  Sil
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function TaskEditor({ s, t, i, set }: { s: EditorStudy; t: EditorTask; i: number; set: (s: EditorStudy) => void }) {
  const up = (patch: Partial<EditorTask>) => set({ ...s, tasks: s.tasks.map((x, j) => (j === i ? { ...x, ...patch } : x)) })
  const nodes = allNodes(s)
  const name = (k: string) => s.screens.find((x) => x.key === k)?.name ?? k
  const move = (k: number, d: number) => {
    const p = [...t.expectedPath]
    const [x] = p.splice(k, 1)
    p.splice(k + d, 0, x)
    up({ expectedPath: p })
  }
  const offCandidates = s.screens.map((x) => x.key).filter((k) => !t.expectedPath.includes(k))
  return (
    <div className="task-edit">
      <div className="row between">
        <h3>Görev {i + 1}</h3>
        <button className="link" onClick={() => set({ ...s, tasks: s.tasks.filter((_, j) => j !== i) })}>
          Görevi sil
        </button>
      </div>
      <label>
        Kimlik
        <input value={t.id} onChange={(e) => up({ id: e.target.value.trim() })} />
      </label>
      <label>
        Görev metni (katılımcıya)
        <textarea rows={3} value={t.prompt} onChange={(e) => up({ prompt: e.target.value })} />
      </label>
      <div className="row">
        <label>
          Başlangıç ekranı
          <select value={t.startScreen ?? ''} onChange={(e) => up({ startScreen: e.target.value || undefined })}>
            <option value="">Linkin kendi başlangıcı</option>
            {nodes.map((k) => (
              <option key={k} value={k}>
                {k} {name(k) !== k ? `· ${name(k)}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          Hedef ekran (ya da durum)
          <select value={t.targetScreen ?? ''} onChange={(e) => up({ targetScreen: e.target.value || undefined })}>
            <option value="">Yok</option>
            {nodes.map((k) => (
              <option key={k} value={k}>
                {k} {name(k) !== k ? `· ${name(k)}` : s.screens.find((x) => x.aliases?.includes(k)) ? `· ${s.screens.find((x) => x.aliases?.includes(k))!.name} (durum)` : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      <h4>Beklenen yol</h4>
      <ol className="path">
        {t.expectedPath.map((k, j) => {
          const ov = t.overrides?.[k] ?? {}
          const setOv = (patch: Partial<typeof ov>) => up({ overrides: { ...(t.overrides ?? {}), [k]: { ...ov, ...patch } } })
          return (
            <li key={k}>
              <div className="row">
                <b>{name(k)}</b> <span className="muted">{k}</span>
                <button className="link" disabled={j === 0} onClick={() => move(j, -1)}>
                  ↑
                </button>
                <button className="link" disabled={j === t.expectedPath.length - 1} onClick={() => move(j, 1)}>
                  ↓
                </button>
                <button className="link" onClick={() => up({ expectedPath: t.expectedPath.filter((x) => x !== k) })}>
                  Çıkar
                </button>
              </div>
              <input placeholder="Bu ekrandan çıkarken sorulacak soru (isteğe bağlı)" value={t.probes?.[k] ?? ''} onChange={(e) => up({ probes: { ...(t.probes ?? {}), [k]: e.target.value } })} />
              <details>
                <summary className="small">Bu görevde farklı (isteğe bağlı)</summary>
                <div className="row">
                  <select value={ov.behavior ?? ''} onChange={(e) => setOv({ behavior: (e.target.value || undefined) as Behavior | undefined })}>
                    <option value="">Davranış: ekrandaki gibi</option>
                    {BEHAVIORS.map((b) => (
                      <option key={b.v} value={b.v}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                  <input className="n" type="number" placeholder="min" value={ov.expectedSec?.[0] ?? ''} onChange={(e) => setOv({ expectedSec: e.target.value ? [num(e.target.value), ov.expectedSec?.[1] ?? num(e.target.value)] : undefined })} />
                  <input className="n" type="number" placeholder="max" value={ov.expectedSec?.[1] ?? ''} onChange={(e) => setOv({ expectedSec: e.target.value ? [ov.expectedSec?.[0] ?? 0, num(e.target.value)] : undefined })} />
                  <input placeholder="Ad" value={ov.name ?? ''} onChange={(e) => setOv({ name: e.target.value || undefined })} />
                  <input placeholder="Katılımcıya görünen ad" value={ov.participantName ?? ''} onChange={(e) => setOv({ participantName: e.target.value || undefined })} />
                </div>
              </details>
            </li>
          )
        })}
      </ol>
      <div className="row">
        <select value="" onChange={(e) => e.target.value && up({ expectedPath: [...t.expectedPath, e.target.value] })}>
          <option value="">Yola ekran ekle…</option>
          {offCandidates.map((k) => (
            <option key={k} value={k}>
              {name(k)} · {k}
            </option>
          ))}
        </select>
      </div>
      <h4>Kabul edilebilir sapmalar</h4>
      <p className="muted small">İşaretlenen ekranlar yolda değilse de "yol dışı" sayılmaz (örneğin başka bir görevle paylaşılan ekran).</p>
      <div className="checks">
        {offCandidates.map((k) => (
          <label key={k} className="check">
            <input
              type="checkbox"
              checked={t.allowedScreens?.includes(k) ?? false}
              onChange={(e) => up({ allowedScreens: e.target.checked ? [...(t.allowedScreens ?? []), k] : (t.allowedScreens ?? []).filter((x) => x !== k) })}
            />
            {name(k)}
          </label>
        ))}
      </div>
    </div>
  )
}

function ContextEditor({ s, set }: { s: EditorStudy; set: (s: EditorStudy) => void }) {
  const qs = s.contextQuestions ?? []
  const put = (next: EditorContextQuestion[]) => set({ ...s, contextQuestions: next })
  const up = (i: number, patch: Partial<EditorContextQuestion>) => put(qs.map((q, j) => (j === i ? { ...q, ...patch } : q)))
  return (
    <section>
      <h2>Bağlam soruları</h2>
      <p className="muted small">Görevlerden önce sorulur, süre tutulmaz. Cevaplar raporun başında katılımcı bilgisi olarak görünür (örneğin "Bu uygulamayı ne sıklıkla kullanıyorsun?").</p>
      {qs.length > CONTEXT_QUESTIONS_SOFT_MAX ? <p className="hint">{qs.length} soru var. {CONTEXT_QUESTIONS_SOFT_MAX}'ten fazla soru katılımcıyı görevlere başlamadan yorabilir.</p> : null}
      {qs.map((q, i) => (
        <div key={i} className="row ctx-edit">
          <input className="grow" placeholder="Soru" value={q.text} onChange={(e) => up(i, { text: e.target.value })} />
          <select value={q.type} onChange={(e) => up(i, { type: e.target.value as EditorContextQuestion['type'], options: e.target.value === 'choice' ? (q.options ?? []) : undefined })}>
            <option value="text">Kısa metin</option>
            <option value="choice">Tek seçim</option>
          </select>
          {q.type === 'choice' ? <input className="grow" placeholder="Seçenekler (virgülle)" value={(q.options ?? []).join(', ')} onChange={(e) => up(i, { options: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} /> : null}
          <button className="link" onClick={() => put(qs.filter((_, j) => j !== i))}>
            Sil
          </button>
        </div>
      ))}
      <button onClick={() => put([...qs, { id: `q${qs.length + 1}`, text: '', type: 'text' }])}>Soru ekle</button>
    </section>
  )
}

function FiveSecondEditor({ s, set }: { s: EditorStudy; set: (s: EditorStudy) => void }) {
  const ts = s.fiveSecondTests ?? []
  const put = (next: EditorFiveSecond[]) => set({ ...s, fiveSecondTests: next })
  const up = (i: number, patch: Partial<EditorFiveSecond>) => put(ts.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const nodes = allNodes(s)
  const name = (k: string) => s.screens.find((x) => x.key === k)?.name ?? k
  return (
    <section>
      <h2>5 saniye testi</h2>
      <p className="muted small">
        Görevlerden önce seçilen ekranın görüntüsü 5 saniye gösterilir, sonra 1 ile 3 arasında hatırlama sorusu sorulur. Kamera ve tıklama ölçülmez. Ekran görüntüsü <code>frames.local/</code> klasöründe olmalı.
      </p>
      {ts.map((x, i) => (
        <div key={i} className="task-edit">
          <div className="row">
            <label>
              Ekran
              <select value={x.screen} onChange={(e) => up(i, { screen: e.target.value })}>
                <option value="">Seç…</option>
                {nodes.map((k) => (
                  <option key={k} value={k}>
                    {k} {name(k) !== k ? `· ${name(k)}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Süre (sn)
              <input className="n" type="number" min={1} max={30} value={x.seconds ?? 5} onChange={(e) => up(i, { seconds: num(e.target.value) === 5 ? undefined : num(e.target.value) })} />
            </label>
            <button className="link" onClick={() => put(ts.filter((_, j) => j !== i))}>
              Testi sil
            </button>
          </div>
          {x.screen && !figmaFrames.image(x.screen) ? (
            <p className="hint" role="alert">
              Bu ekranın görüntüsü <code>frames.local/</code> klasöründe yok ({x.screen.replace(':', '-')}.png). Görüntü eklenmezse katılımcıya bu test gösterilmez ve raporda "gösterilmedi" uyarısı çıkar.
            </p>
          ) : null}
          {x.questions.map((q, k) => (
            <div key={k} className="row">
              <input className="grow" placeholder={`Soru ${k + 1}`} value={q} onChange={(e) => up(i, { questions: x.questions.map((y, m) => (m === k ? e.target.value : y)) })} />
              <button className="link" onClick={() => up(i, { questions: x.questions.filter((_, m) => m !== k) })}>
                Sil
              </button>
            </div>
          ))}
          {x.questions.length < 3 ? <button onClick={() => up(i, { questions: [...x.questions, ''] })}>Soru ekle</button> : null}
        </div>
      ))}
      <button onClick={() => put([...ts, { id: `5sn-${ts.length + 1}`, screen: '', questions: ['Bu ekranda ne gördün?'] }])}>5 saniye testi ekle</button>
    </section>
  )
}

function App() {
  const [s, set] = useState<EditorStudy>(emptyStudy())
  const json = useMemo(() => toStudyJson(s), [s])
  const check = useMemo(() => parseStudy(json), [json])
  const text = JSON.stringify(json, null, 2)
  const save = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([text + '\n'], { type: 'application/json' }))
    a.download = `${(s.name || 'calisma').toLocaleLowerCase('tr').replace(/[^a-z0-9ğüşıöç]+/g, '-')}.local.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  return (
    <main className="card wide setup">
      <h1>Çalışma kurulumu</h1>
      <p className="muted">
        Bu sayfa çalışma dosyasını hazırlar; hiçbir şey bir yere gönderilmez. Bitince dosyayı kaydedip <code>apps/web/src/studies/</code> klasörüne koy (adı <code>.local.json</code> ile bitsin, repoya girmez).
      </p>
      <div className="row">
        <label className="filebtn">
          Var olan çalışma dosyasını aç
          <input type="file" accept=".json,application/json" onChange={async (e) => e.target.files?.[0] && set(toEditor(await readFile(e.target.files[0])))} />
        </label>
        <button onClick={() => set(emptyStudy())}>Yeni çalışma</button>
      </div>

      <section>
        <h2>Çalışma</h2>
        <label>
          Ad
          <input value={s.name} onChange={(e) => set({ ...s, name: e.target.value })} />
        </label>
        <label>
          Figma prototip linki
          <input value={s.sourceUrl} placeholder="https://www.figma.com/proto/…" onChange={(e) => set({ ...s, sourceUrl: e.target.value.trim(), sourceType: 'figma' })} />
        </label>
        <p className="muted small">Figma'da dosya "Anyone with the link" ile paylaşılmış olmalı.</p>
        <div className="row">
          <label>
            Bağlam
            <select value={s.context} onChange={(e) => set({ ...s, context: e.target.value as EditorStudy['context'], faceSignals: !['workplace', 'education'].includes(e.target.value) })}>
              {CONTEXTS.map((c) => (
                <option key={c.v} value={c.v}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={s.faceSignals} onChange={(e) => set({ ...s, faceSignals: e.target.checked })} /> Yüz sinyalleri (katılımcıdan ayrıca onay istenir)
          </label>
          <label className="check">
            <input type="checkbox" checked={s.comments !== false} onChange={(e) => set({ ...s, comments: e.target.checked ? undefined : false })} /> Katılımcı ekranda nokta seçip yorum ekleyebilsin
          </label>
        </div>
      </section>

      <ContextEditor s={s} set={set} />

      <ScreensEditor s={s} set={set} />

      <FiveSecondEditor s={s} set={set} />

      <section>
        <h2>Görevler</h2>
        {s.tasks.map((t, i) => (
          <TaskEditor key={i} s={s} t={t} i={i} set={set} />
        ))}
        <button onClick={() => set({ ...s, tasks: [...s.tasks, { id: `gorev-${s.tasks.length + 1}`, prompt: '', expectedPath: [] }] })}>Görev ekle</button>
      </section>

      <section className="out">
        <h2>Dosya</h2>
        {check.ok ? <p className="ok">Dosya geçerli: {check.study.tasks.length} görev, {s.screens.length} ekran.</p> : <ul className="errors">{check.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
        <div className="row">
          <button className="primary" disabled={!check.ok} onClick={save}>
            Çalışma dosyasını kaydet
          </button>
          <button onClick={() => void navigator.clipboard?.writeText(text)}>Panoya kopyala</button>
        </div>
        <details>
          <summary>JSON'u göster</summary>
          <pre>{text}</pre>
        </details>
      </section>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
