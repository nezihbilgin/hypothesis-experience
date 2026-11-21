// Setup screen v0 (researcher, local): build a study without writing JSON. Output is the study JSON the app reads
// (study-level screens, tasks with expectedPath). Nothing is uploaded; save the file as
// apps/web/src/studies/<name>.local.json (gitignored) to run it. UI: Untitled UI React components (src/uui).
import { CONTEXT_QUESTIONS_SOFT_MAX, parseStudy, type Behavior } from '@hx/core'
import { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../uui/index.css'
import '../uui/theme-mode'
import '../researcher.css'
import './setup.css'
import { Area, Btn, Check, Field, FilePick, NumField, Select } from './fields'
import { allNodes, emptyStudy, nodesFromSession, toEditor, toStudyJson, type EditorContextQuestion, type EditorFiveSecond, type EditorScreen, type EditorStudy, type EditorTask } from './model'

const BEHAVIORS: { value: Behavior; label: string }[] = [
  { value: 'flow', label: 'Akış (takılmadan geçmeli)' },
  { value: 'read', label: 'Okuma (dikkatle okumalı)' },
  { value: 'decide', label: 'Karar (seçenekleri tartmalı)' }
]
const CONTEXTS: { value: EditorStudy['context']; label: string }[] = [
  { value: 'consumer', label: 'Tüketici' },
  { value: 'workplace', label: 'İşyeri (yüz sinyalleri varsayılan kapalı)' },
  { value: 'education', label: 'Eğitim (yüz sinyalleri varsayılan kapalı)' },
  { value: 'other', label: 'Diğer' }
]

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
        <Btn onPress={() => add([`yeni-${s.screens.length + 1}`])}>Ekran ekle</Btn>
        <FilePick label="Oturum dosyasından ekranları al" onFile={async (f) => add(nodesFromSession(await readFile(f)))} />
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
            <th>
              <span className="sr-only">İşlem</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {s.screens.map((x, i) => (
            <tr key={i}>
              <td>
                <Field hideLabel label={`Ekran ${i + 1} anahtar`} value={x.key} onChange={(v) => up(i, { key: v.trim() })} />
              </td>
              <td>
                <Field hideLabel label={`Ekran ${i + 1} ad`} value={x.name} onChange={(v) => up(i, { name: v })} />
              </td>
              <td>
                <Field hideLabel label={`Ekran ${i + 1} katılımcıya görünen ad`} value={x.participantName ?? ''} onChange={(v) => up(i, { participantName: v || undefined })} />
              </td>
              <td>
                <Select hideLabel label={`Ekran ${i + 1} davranış`} value={x.behavior} onChange={(v) => up(i, { behavior: v as Behavior })} options={BEHAVIORS} />
              </td>
              <td className="nowrap">
                <NumField label={`Ekran ${i + 1} en az saniye`} min={0} value={x.expectedSec[0]} onChange={(v) => up(i, { expectedSec: [v ?? 0, x.expectedSec[1]] })} /> –{' '}
                <NumField label={`Ekran ${i + 1} en çok saniye`} min={0} value={x.expectedSec[1]} onChange={(v) => up(i, { expectedSec: [x.expectedSec[0], v ?? 0] })} />
              </td>
              <td>
                <Field hideLabel label={`Ekran ${i + 1} takma adlar`} value={(x.aliases ?? []).join(', ')} onChange={(v) => up(i, { aliases: list(v) })} />
              </td>
              <td>
                <Btn color="link-destructive" onPress={() => set({ ...s, screens: s.screens.filter((_, j) => j !== i) })}>
                  Sil
                </Btn>
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
  const nodeLabel = (k: string) => {
    const owner = s.screens.find((x) => x.aliases?.includes(k))
    return `${k}${name(k) !== k ? ` · ${name(k)}` : owner ? ` · ${owner.name} (durum)` : ''}`
  }
  return (
    <div className="task-edit">
      <div className="row between">
        <h3>Görev {i + 1}</h3>
        <Btn color="link-destructive" onPress={() => set({ ...s, tasks: s.tasks.filter((_, j) => j !== i) })}>
          Görevi sil
        </Btn>
      </div>
      <div className="stack">
        <Field label="Kimlik" value={t.id} onChange={(v) => up({ id: v.trim() })} />
        <Area label="Görev metni (katılımcıya)" value={t.prompt} onChange={(v) => up({ prompt: v })} />
        <div className="row">
          <Select label="Başlangıç ekranı" value={t.startScreen ?? ''} onChange={(v) => up({ startScreen: v || undefined })} options={[{ value: '', label: 'Linkin kendi başlangıcı' }, ...nodes.map((k) => ({ value: k, label: nodeLabel(k) }))]} />
          <Select label="Hedef ekran (ya da durum)" value={t.targetScreen ?? ''} onChange={(v) => up({ targetScreen: v || undefined })} options={[{ value: '', label: 'Yok' }, ...nodes.map((k) => ({ value: k, label: nodeLabel(k) }))]} />
        </div>
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
                <Btn color="tertiary" isDisabled={j === 0} onPress={() => move(j, -1)}>
                  <span aria-label={`${name(k)} yukarı taşı`}>↑</span>
                </Btn>
                <Btn color="tertiary" isDisabled={j === t.expectedPath.length - 1} onPress={() => move(j, 1)}>
                  <span aria-label={`${name(k)} aşağı taşı`}>↓</span>
                </Btn>
                <Btn color="link-destructive" onPress={() => up({ expectedPath: t.expectedPath.filter((x) => x !== k) })}>
                  Çıkar
                </Btn>
              </div>
              <Field hideLabel label={`${name(k)}: bu ekrandan çıkarken sorulacak soru`} placeholder="Bu ekrandan çıkarken sorulacak soru (isteğe bağlı)" value={t.probes?.[k] ?? ''} onChange={(v) => up({ probes: { ...(t.probes ?? {}), [k]: v } })} />
              <details>
                <summary className="small">Bu görevde farklı (isteğe bağlı)</summary>
                <div className="row">
                  <Select hideLabel label="Bu görevde davranış" value={ov.behavior ?? ''} onChange={(v) => setOv({ behavior: (v || undefined) as Behavior | undefined })} options={[{ value: '', label: 'Davranış: ekrandaki gibi' }, ...BEHAVIORS]} />
                  <NumField label="Bu görevde en az saniye" placeholder="min" value={ov.expectedSec?.[0]} onChange={(v) => setOv({ expectedSec: v !== undefined ? [v, ov.expectedSec?.[1] ?? v] : undefined })} />
                  <NumField label="Bu görevde en çok saniye" placeholder="max" value={ov.expectedSec?.[1]} onChange={(v) => setOv({ expectedSec: v !== undefined ? [ov.expectedSec?.[0] ?? 0, v] : undefined })} />
                  <Field hideLabel label="Bu görevde ad" placeholder="Ad" value={ov.name ?? ''} onChange={(v) => setOv({ name: v || undefined })} />
                  <Field hideLabel label="Bu görevde katılımcıya görünen ad" placeholder="Katılımcıya görünen ad" value={ov.participantName ?? ''} onChange={(v) => setOv({ participantName: v || undefined })} />
                </div>
              </details>
            </li>
          )
        })}
      </ol>
      <div className="row">
        <Select hideLabel label="Yola ekran ekle" value="" onChange={(v) => v && up({ expectedPath: [...t.expectedPath, v] })} options={[{ value: '', label: 'Yola ekran ekle…' }, ...offCandidates.map((k) => ({ value: k, label: `${name(k)} · ${k}` }))]} />
      </div>
      <h4>Kabul edilebilir sapmalar</h4>
      <p className="muted small">İşaretlenen ekranlar yolda değilse de "yol dışı" sayılmaz (örneğin başka bir görevle paylaşılan ekran).</p>
      <div className="checks">
        {offCandidates.map((k) => (
          <Check key={k} label={name(k)} checked={t.allowedScreens?.includes(k) ?? false} onChange={(on) => up({ allowedScreens: on ? [...(t.allowedScreens ?? []), k] : (t.allowedScreens ?? []).filter((x) => x !== k) })} />
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
      {qs.length > CONTEXT_QUESTIONS_SOFT_MAX ? (
        <p className="warn" role="status">
          {qs.length} soru var. {CONTEXT_QUESTIONS_SOFT_MAX}'ten fazla soru katılımcıyı görevlere başlamadan yorabilir.
        </p>
      ) : null}
      {qs.map((q, i) => (
        <div key={i} className="row">
          <Field hideLabel label={`Bağlam sorusu ${i + 1}`} placeholder="Soru" className="grow" value={q.text} onChange={(v) => up(i, { text: v })} />
          <Select hideLabel label={`Bağlam sorusu ${i + 1} tipi`} value={q.type} onChange={(v) => up(i, { type: v as EditorContextQuestion['type'], options: v === 'choice' ? (q.options ?? []) : undefined })} options={[{ value: 'text', label: 'Kısa metin' }, { value: 'choice', label: 'Tek seçim' }]} />
          {q.type === 'choice' ? <Field hideLabel label={`Bağlam sorusu ${i + 1} seçenekler`} placeholder="Seçenekler (virgülle)" className="grow" value={(q.options ?? []).join(', ')} onChange={(v) => up(i, { options: v.split(',').map((x) => x.trim()).filter(Boolean) })} /> : null}
          <Btn color="link-destructive" onPress={() => put(qs.filter((_, j) => j !== i))}>
            Sil
          </Btn>
        </div>
      ))}
      <div className="row">
        <Btn onPress={() => put([...qs, { id: `q${qs.length + 1}`, text: '', type: 'text' }])}>Soru ekle</Btn>
      </div>
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
            <Select label="Ekran" value={x.screen} onChange={(v) => up(i, { screen: v })} options={[{ value: '', label: 'Seç…' }, ...nodes.map((k) => ({ value: k, label: `${k}${name(k) !== k ? ` · ${name(k)}` : ''}` }))]} />
            <label className="numlabel">
              Süre (sn)
              <NumField label="Süre (sn)" min={1} max={30} value={x.seconds ?? 5} onChange={(v) => up(i, { seconds: v === undefined || v === 5 ? undefined : v })} />
            </label>
            <Btn color="link-destructive" onPress={() => put(ts.filter((_, j) => j !== i))}>
              Testi sil
            </Btn>
          </div>
          {x.questions.map((q, k) => (
            <div key={k} className="row">
              <Field hideLabel label={`Soru ${k + 1}`} placeholder={`Soru ${k + 1}`} className="grow" value={q} onChange={(v) => up(i, { questions: x.questions.map((y, m) => (m === k ? v : y)) })} />
              <Btn color="link-destructive" onPress={() => up(i, { questions: x.questions.filter((_, m) => m !== k) })}>
                Sil
              </Btn>
            </div>
          ))}
          {x.questions.length < 3 ? (
            <div className="row">
              <Btn onPress={() => up(i, { questions: [...x.questions, ''] })}>Soru ekle</Btn>
            </div>
          ) : null}
        </div>
      ))}
      <div className="row">
        <Btn onPress={() => put([...ts, { id: `5sn-${ts.length + 1}`, screen: '', questions: ['Bu ekranda ne gördün?'] }])}>5 saniye testi ekle</Btn>
      </div>
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
    <main className="card researcher setup mx-auto my-[4vh] max-w-6xl rounded-2xl bg-primary p-8 shadow-xs ring-1 ring-secondary max-sm:m-4 max-sm:p-5">
      <h1>Çalışma kurulumu</h1>
      <p className="muted">
        Bu sayfa çalışma dosyasını hazırlar; hiçbir şey bir yere gönderilmez. Bitince dosyayı kaydedip <code>apps/web/src/studies/</code> klasörüne koy (adı <code>.local.json</code> ile bitsin, repoya girmez).
      </p>
      <div className="row">
        <FilePick label="Var olan çalışma dosyasını aç" onFile={async (f) => set(toEditor(await readFile(f)))} />
        <Btn onPress={() => set(emptyStudy())}>Yeni çalışma</Btn>
      </div>

      <section>
        <h2>Çalışma</h2>
        <div className="stack">
          <Field label="Ad" value={s.name} onChange={(v) => set({ ...s, name: v })} />
          <Field label="Figma prototip linki" value={s.sourceUrl} placeholder="https://www.figma.com/proto/…" onChange={(v) => set({ ...s, sourceUrl: v.trim(), sourceType: 'figma' })} />
        </div>
        <p className="muted small">Figma'da dosya "Anyone with the link" ile paylaşılmış olmalı.</p>
        <div className="row">
          <Select label="Bağlam" value={s.context} onChange={(v) => set({ ...s, context: v as EditorStudy['context'], faceSignals: !['workplace', 'education'].includes(v) })} options={CONTEXTS} />
        </div>
        <div className="stack">
          <Check label="Yüz sinyalleri (katılımcıdan ayrıca onay istenir)" checked={s.faceSignals} onChange={(v) => set({ ...s, faceSignals: v })} />
          <Check label="Katılımcı ekranda nokta seçip yorum ekleyebilsin" checked={s.comments !== false} onChange={(v) => set({ ...s, comments: v ? undefined : false })} />
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
        <div className="row">
          <Btn onPress={() => set({ ...s, tasks: [...s.tasks, { id: `gorev-${s.tasks.length + 1}`, prompt: '', expectedPath: [] }] })}>Görev ekle</Btn>
        </div>
      </section>

      <section className="out">
        <h2>Dosya</h2>
        <div role="status">
          {check.ok ? (
            <p className="ok">
              Dosya geçerli: {check.study.tasks.length} görev, {s.screens.length} ekran.
            </p>
          ) : (
            <ul className="errors">
              {check.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="row">
          <Btn color="primary" size="md" isDisabled={!check.ok} onPress={save}>
            Çalışma dosyasını kaydet
          </Btn>
          <Btn size="md" onPress={() => void navigator.clipboard?.writeText(text)}>
            Panoya kopyala
          </Btn>
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
