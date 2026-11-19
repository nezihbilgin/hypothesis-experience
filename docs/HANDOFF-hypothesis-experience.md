# Proje: Hypothesis & Real Experience (çalışma adı)

Tasarımcının/araştırmacının ekran bazlı hipotezini, katılımcının gerçek davranışıyla karşılaştıran, tarayıcıda çalışan self-moderated usability test aracı. Önce sahibinin kendi araştırmalarında kullanılacak (MVP), sonra ürün olacak (Faz 2, bu handoff'ta sadece mimariye yön vermek için var, MVP'de YAPILMAYACAK).

Brief: https://claude.ai/artifact/99WTjBWaBA488vgcY9fnc9
Referans kod: https://github.com/Techkeyy/senti (MIT, Electron oyun playtest aracı)

---

## Bağlam ve kararlar

- **İlke 1: duygu değil davranış.** Duygu, niyet ya da "kafası karıştı" gibi çıkarım yok. Rapor sadece gözlemlenen davranışı söyler ("14 sn durdu, iki kez geri döndü"). Yüz ifadesi skoru kullanılmaz. (Bilimsel geçerlilik + EU AI Act Madde 5(1)(f).)
- **İlke 2: kişisel baseline.** Tüm eşikler katılımcının ısınma görevinden öğrenilen kendi dağılımına göre (Senti'nin `max(floor, 2 × baseline p95)` yaklaşımı).
- **İlke 3: kamera kareleri cihazdan çıkmaz.** Yüz işleme tarayıcıda, sunucuya sadece saniyelik sayılar gider. Yüz kaybı "sakin" sayılmaz, ayrı sinyaldir.
- **Hipotez formatı:** ekran başına hipotez kartı. Elle eğri çizimi yok; eğri kartlardan otomatik üretilir.
  - `behavior`: `flow` (akıcı geçiş, beklenen seviye 20) | `read` (dikkatli okuma, 50) | `decide` (bilinçli karar, 80)
  - `expectedSec`: `[min, max]`
  - `successCriterion`: serbest metin ya da hedef ekran/olay
  - `note`: serbest metin
- **Test modu (MVP):** sinyal tetiklemeli retrospektif think-aloud. Görev sessiz yapılır, sonra en büyük 3-4 sapma anı 10 sn'lik klip olarak gösterilir ve sorulur. Cevap **ses** (tercih), yazı yedek.
- Hipotezi tasarımcı da araştırmacı da yazabilir; ileride ekip hizalanma aracına dönüşebilir.
- İsim "hypothesis" ve "real experience" kavramlarını öne çıkaracak; Senti'ye gönderme yok.

## Teknoloji

- Vite + React + TypeScript, tek web app (researcher ve participant route'ları)
- `@mediapipe/tasks-vision` FaceLandmarker, Web Worker içinde, GPU delegate, hedef 10-15 fps
- Web Audio API + basit VAD (enerji tabanlı yeterli; gerekirse `@ricky0123/vad-web`)
- `getDisplayMedia` + `MediaRecorder` (sekme kaydı)
- Figma Embed API (iframe + postMessage, OAuth app client-id gerekir)
- Backend: Supabase (Postgres + Storage), **AB bölgesi**. MVP'de auth yok, gizli linkler.
- Test: Vitest. `core` paketi saf ve deterministik kalmalı.

## Repo yapısı

```
packages/
  core/        # Saf model: baseline, sürtünme skoru, sapma tespiti, cümle üretimi (Senti felt.ts'ten uyarlanır)
  sensing/     # Web Worker: FaceLandmarker + VAD -> SecondSample
  embed-sdk/   # AI demo/canlı siteye eklenen tek dosyalık script -> postMessage
apps/
  web/         # Researcher (çalışma, hipotez kartları, rapor) + Participant (onay, test, retro)
```

## Senti'den ne alınır

- `src/shared/felt.ts` → `core`: yapı aynen, zaman pencereleri yerine **ekran pencereleri**, sinyaller aşağıdaki setle değişir. `intendedAt`, `runs`, merge ve `describe` mantığı korunur.
- `src/shared/session.ts` → veri kontratının başlangıcı.
- `Report.tsx`, `Timeline.tsx`, `chart.ts` → rapor UI'ı, neredeyse doğrudan.
- `RunFlow.tsx` → akış fikri (onay, kamera kontrolü, baseline, oynatma), ekranlar yeniden.
- `src/main/sensing-worker.ts` → yeniden yazılır (SmartSpectra yerine MediaPipe + Web Audio). SmartSpectra'dan sadece landmark ve talking kullanılıyordu.
- Electron, `recorder.ts`, `@smartspectra/node-sdk` → atılır.
- `docs/evidence/` → `core` port'unun regresyon testi için fixture.

## Veri modeli (MVP)

Tüm tablolarda `org_id` alanı şimdiden olsun (Faz 2 için), MVP'de tek sabit değer.

- `study`: id, org_id, name, source_type (`figma` | `script`), source_url, task_prompt, created_at
- `screen`: id, study_id, key (Figma node id | route | `data-step`), name, order
- `hypothesis_card`: screen_id, behavior, expected_min_sec, expected_max_sec, success_criterion, note
- `session`: id, study_id, participant_label, consent_at, device_info, camera_enabled, baseline (json), started_at, ended_at, seq_score
- `second_sample`: session_id, t, screen_key, face, head_speed_max, face_width_ratio, talking, samples
- `interaction_event`: session_id, t, screen_key, type, payload (json), schema_version
- `mismatch`: session_id, screen_key, kind, start, end, expected, felt, text
- `retro_answer`: session_id, mismatch_id, audio_path, text, transcript (nullable)

## Sinyaller

Etkileşim sinyalleri birincil, kamera ve ses ikincil.

- **Tereddüt:** ekran gösterimi → ilk anlamlı aksiyon süresi, `expectedSec` ve baseline'a göre; tıklama öncesi cursor idle
- **Geri dönüş:** ekran geçmişinde geri hareket, ileri-geri döngü
- **Dead click:** Figma'da `MOUSE_PRESS_OR_RELEASE.handled === false`; script'te tıklamadan sonra 300 ms içinde DOM mutation ya da URL değişimi yoksa
- **Rage click:** 1 sn içinde aynı bölgeye 3+ tıklama; **cursor thrashing** (sadece script)
- **Form düzeltme:** silme + yeniden yazma, alanlar arası zıplama (sadece script)
- **Kopma:** yüz ≥ 2 sn kayıp, `visibilitychange` tab-out
- **Ekrana yaklaşma:** yüz genişliği baseline'ın belirgin üstünde
- **Ses aktivitesi:** konuşma oranı (sesin kendisi görev sırasında kaydedilmez)
- Bakış takibi MVP'de YOK.

## Sapma tipleri (core)

| kind | Koşul | Cümle örneği |
|---|---|---|
| `unexpected-friction` | kart `flow` ama tereddüt/geri dönüş/dead/rage click | "Teslimat: akıcı bekledin, katılımcı 14 sn durdu ve iki kez geri döndü." |
| `missed-decision` | kart `decide` ama süre `expected_min_sec` altında ve sinyal yok | "Plan seçimi: karar bekledin, katılımcı 3 sn'de geçti." |
| `disengagement` | herhangi kartta kopma | "Kart formu: katılımcı 8 sn ekrandan uzaklaştı." |
| `over-time` | süre `expected_max_sec` üstünde | "Onay: en fazla 10 sn bekledin, 27 sn sürdü." |

Kameranın veri vermediği pencerelerde (camera_enabled=false ya da kalite düşük) sadece etkileşim tabanlı sapmalar üretilir.

## Participant akışı (yukarıdan aşağı)

1. Karşılama + görev özeti
2. Onay ekranı: kamera, mikrofon, sekme kaydı, ne saklanır, ne saklanmaz. Kamera opsiyonel.
3. İzinler + kalite kontrolü: yüz bulundu mu, fps ≥ 10 mu, ışık ipucu. Yetersizse kamerasız moda düş.
4. Isınma görevi (~20 sn, standart): baseline (cursor hızı, tıklama öncesi bekleme, baş hareketi, konuşma oranı)
5. Görev: prototip iframe tam ekran, küçük bir "bitirdim" butonu ve görev metni
6. Retrospektif: en büyük 3-4 sapma, her biri 10 sn klip + "Burada ne düşündün?" + ses kaydı (yazı yedek). Soru dili suçlayıcı olmasın.
7. SEQ (tek soru, 1-7)
8. Özet: katılımcı kendi verisinin özetini görür, isterse oturumu siler

## Researcher akışı (MVP, sadece ben)

1. Çalışma oluştur: Figma prototip linki ya da script'li demo URL'i, görev metni
2. Ekranlar: Figma'da node id'ler REST API ile frame adlarına çevrilir; script'te route/`data-step`'ten gelir. Elle düzenlenebilir.
3. Her ekran için hipotez kartı
4. Katılımcı linki kopyala
5. Rapor (katılımcı bazında): hipotez eğrisi (kartlardan) + gerçek eğri üst üste, sapma cümleleri, tıklayınca videoda o an, retro cevapları, SEQ
6. Rapor (çalışma bazında): katılımcı eğrileri üst üste, ekran bazında sapma sayısı

MVP'de çalışma tanımı JSON dosyasıyla da yapılabilir; UI ikinci öncelik.

## embed-sdk (script)

- Tek `<script>` etiketi; parent origin'e `postMessage({type, t, screenKey, payload, v})`
- Topladıkları: click (x, y, target selector), dead click tespiti, rage click, mousemove (throttle), scroll, input (değer değil, sadece edit/delete sayısı), route değişimi, JS error
- `screenKey`: `data-step` öncelikli, yoksa `location.pathname`
- Form değerleri asla gönderilmez
- AI demo prompt'u için not: "Her ekranın kök elemanına `data-step='<ad>'` ekle ve bu script'i dahil et."

## Gizlilik (MVP'de de zorunlu)

- Kamera kareleri ve ham ses asla kaydedilmez/yüklenmez (retro cevap sesi hariç, onaylı)
- Ekran kaydında input alanları maskelenir ya da script'li demolarda video yerine DOM olay kaydı tercih edilir
- Supabase AB bölgesi; oturum silme gerçekten siler (DB + Storage)
- Raporda duygu kelimesi yok

---

## Yapılacaklar

### Faz 0: Spike (önce bunlar, her biri ayrı küçük prototip)
- [ ] Figma Embed API: public prototip, Figma oturumu açık OLMAYAN tarayıcıda `PRESENTED_NODE_CHANGED` ve `MOUSE_PRESS_OR_RELEASE` geliyor mu? (Forumda Aralık 2025 tarihli olumsuz rapor var.)
- [ ] FaceLandmarker Web Worker'da, Figma iframe'iyle aynı anda, 2017-2019 dönemi bir laptopta ≥ 10 fps
- [ ] `felt.ts` → `core` port'u; `docs/evidence/` oturumlarında Senti ile aynı sapmaları üretiyor (regresyon testi)
- [ ] `getDisplayMedia` sekme kaydı + aynı anda kamera: Chrome ve Edge'de çalışıyor; Safari/Firefox durumu not edilir
- Çıkış: dördü de evet ya da her "hayır" için bir alternatif

### Faz 1: MVP (kendi araştırmalarım)
- [ ] `core`: ekran pencereleri, hipotez kartı → beklenen seviye, 4 sapma tipi, cümle üretimi, testler
- [ ] `sensing`: worker, SecondSample üretimi, kalite kontrolü
- [ ] `embed-sdk` + Figma adapter (ikisi aynı `interaction_event` şemasına yazar)
- [ ] Participant akışı (1-8)
- [ ] Researcher: çalışma JSON'u ya da basit form, hipotez kartları, link
- [ ] Rapor: katılımcı ve çalışma bazında
- [ ] Retro ses kaydı + Storage'a yükleme (transkripsiyon yok)
- Kabul kriteri: 5 katılımcılı gerçek bir çalışmada, aracın işaretlediği anlar benim videoyu izleyerek kodladığım anların çoğuyla örtüşüyor; kaçırdıkları bir sinyal tipiyle açıklanabiliyor.

### Faz 2: Ürün kabuğu (MVP'de YOK, mimari buna kapı bıraksın)
- [ ] Auth, organizasyon ve takım rolleri (`org_id` zaten var)
- [ ] Çalışma yönetim UI'ı, katılımcı limitleri, link süresi, davet
- [ ] Video altyapısı: yükleme, streaming, saklama süresi, otomatik silme
- [ ] GDPR/KVKK: onay logları, veri dışa aktarma/silme, DPA, alt işleyici listesi; AI Act için hukuki görüş (özellikle B2B/işyeri testleri)
- [ ] Tarayıcı matrisi: Safari, Firefox, düşük donanım fallback'leri
- [ ] Mobil prototip: laptop kamerası + telefonda prototip, QR ile oturum eşleştirme, sunucu saatine göre hizalama; Figma frame görüntüleriyle oturum replay (video yerine). Bu modda "başka yere bakma" sinyali kapalı ya da telefon standı önerisi.
- [ ] Canlı mikro-sondalar (oturum başına en fazla 1-2)
- [ ] Retro sesleri için transkripsiyon
- [ ] Figma prototipinden otomatik hipotez kartı taslağı (ekran başına karar, alan, yeni kavram sayısı)
- [ ] Deneysel bakış bölgesi (webcam gaze, sadece ekran çeyreği çözünürlüğü)
- [ ] Faturalama
- [ ] Entegrasyonlar (Maze, UserTesting vb.)

## Açık sorular

- Hipotez kartı tek başına yeterli mi, yoksa kart + elle düzeltilebilir otomatik eğri mi? İlk kullanımlarda karar verilecek.
- `behavior` → beklenen seviye eşlemesi (20/50/80) ve tereddüt eşikleri ilk 5 oturumla kalibre edilecek.
- Isınma görevinin içeriği: görev tipinden bağımsız ama arayüz davranışını temsil eden ne olmalı?
- Figma Embed API oturumsuz kullanıcıda çalışmazsa: katılımcıdan Figma girişi mi, prototipi koda çevirmek mi?
- Ürün adı.

## Bağlantılı konular

- Figma design-review agent: Faz 2'deki otomatik hipotez kartı taslağı için doğal köprü (prototipi zaten yürüyüp ekranları haritalıyor)
- Albert & Dixon beklenen ve yaşanan zorluk ölçümü (metodolojik dayanak); SEQ ile birlikte raporda
