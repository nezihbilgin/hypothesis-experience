# Faz 0 raporu

Son güncelleme: 18 Kasım 2026

| # | Spike | Durum | Sonuç |
|---|---|---|---|
| 3 | `felt.ts` → `core` port'u | **Evet** | Senti ile birebir aynı çıktı |
| 4 | Sekme kaydı + kamera | **Chrome'da evet**, Firefox sekme kaydında hayır, Edge/Safari bekliyor | Chrome 157 (M1): sekme + kamera aynı anda |
| 2 | FaceLandmarker worker ≥ 10 fps | **M1'de evet**, Intel Mac ölçümü bekliyor | M1 + Figma iframe: 14-15 fps (hedef 15'te tavan), çıkarım 17.5 ms |
| 1 | Figma Embed olayları (oturumsuz) | **Evet** (19 Kasım) | Oturumsuz gizli pencerede ekran geçişleri ve tıklamalar (handled true/false) geliyor |

## Spike 3: core port'u (tamamlandı)

- `packages/core/src/engine.ts`: Senti'nin `bucket`, `runs`, baseline yüzdeliği, `max(floor, 2 × p95)` eşiği, impulse + aşağı yönlü EMA eğrisi ve aynı tür birleştirme mantığı ortak yardımcılara ayrıldı.
- `packages/core/src/compat/senti.ts`: Senti'nin zaman pencereli modeli bu yardımcılar üzerine yeniden kuruldu.
- Regresyon testi (`test/senti-regression.test.ts`): `docs/evidence/` içindeki iki oturumda çıktı hem dondurulmuş golden dosyasıyla hem de canlı Senti `computeReport` ile **derin eşit** (eğri, anlar, sapmalar, baseline). Senti'nin kendi 9 birim testi de port üzerinde geçiyor.
  - `20261117203123-oz9aau`: 3 sapma (0:20-0:30 unplanned-spike, 0:50-1:20 missed-peak, 2:00-2:10 unplanned-spike)
  - `20261118070014-j6ow1o`: 3 sapma (0:50-1:10 missed-peak, 1:10-1:20 looked-away, 1:20-1:30 missed-peak)
- Ürün modeli (`src/screens.ts`), Faz 1'in başlangıcı olarak yazıldı: ekran pencereleri, hipotez kartından otomatik beklenen eğri, ısınma görevinden kişisel tereddüt eşiği, 4 sapma tipi, handoff'taki örnek cümleleri birebir üreten Türkçe metinler, kamerasız mod, sekme değiştirme = kopma, retro için en büyük 4 sapmadan 10 sn klip seçimi. Duygu kelimesi kullanılmadığını test ediyor.
- Bilinçli fark: `SecondSample` içinden `fear/surprise/neutral` çıkarıldı (İlke 1), yerine `faceWidthRatio` ve `screenKey` eklendi.

## Spike 4: sekme kaydı + kamera

- Sayfa: `apps/spikes/record.html`. `getDisplayMedia` (preferCurrentTab) ve kamera + mikrofon aynı anda 15 sn kaydedilir, iki dosya oynatılır.
- Headless Chromium: sekme 1280x720 @ 15 fps (412 KB, VP9), kamera (1249 KB, VP9 + Opus), ikisi aynı anda. Region Capture (`CropTarget`) ve Element Capture (`RestrictionTarget`) da mevcut, yani kaydı sadece prototip iframe'ine kırpmak mümkün olabilir.
- **Chrome 157, M1 (19 Kasım):** sekme 3248x1864 @ 15 fps (15 sn'de 2.2 MB, VP9) ve kamera + mikrofon (4.1 MB, VP9 + Opus) aynı anda kaydedildi. Region/Element Capture mevcut. Not: sekme Retina çözünürlüğünde geliyor; Faz 1'de genişlik ~1280'e sınırlanmalı.
- **Firefox (19 Kasım):** kamera çalışıyor, sekme kaydı `NotFoundError`. Firefox sekme yakalamayı desteklemiyor (yalnızca pencere/ekran), Region/Element Capture ve CaptureController da yok. macOS'ta Ekran Kaydı izni verilmemişse de aynı hata gelir. macOS Ekran Kaydı izni verilip Firefox yeniden başlatılınca pencere yakalama çalıştı (1440x763 @ 15 fps) ve kamera izni de alındı; ancak MediaRecorder kaydı başlatmadan hata verdi (muhtemelen sesli akışta yalnızca video codec'i belirtildiği için). Recorder yedeği eklendi, tekrar denenecek.
- Öneri: MVP katılımcı akışı Chrome/Edge ister; Firefox ve Safari desteği Faz 2 tarayıcı matrisine (pencere kaydı ya da kayıtsız mod).
- Bekleyen: Edge, Safari.

## Spike 2: FaceLandmarker fps

- Sayfa: `apps/spikes/face.html`. `@mediapipe/tasks-vision` 0.10.35, module Web Worker, GPU delegate (başarısız olursa CPU), hedef 15 fps, 60 sn. Ölçtükleri: saniyelik fps (medyan ve p10), çıkarım süresi p50/p95, yüz bulunan kare oranı, ana thread takılması. Yanına Figma prototipi yüklenebilir.
- Bulgu: module worker'da klasik wasm yükleyicisi sessizce takılıyor; `forVisionTasks(base, true)` ile module wasm varyantı kullanılınca çalışıyor. Bu Faz 1'deki `sensing` paketine not.
- Bulut (headless Chromium, SwiftShader yazılım GPU'su, sahte kamera, yüz yok): 10-11 fps, model 400 ms'de yüklendi. Gerçek GPU'lu bir laptopta daha yüksek olması beklenir ama asıl ölçüm 2017-2019 laptopta yapılmalı.

### Ölçüm: M1 MacBook, Chrome 157, Figma iframe açık (19 Kasım)

- GPU delegate, medyan 14 fps, p10 14 fps: hedef 15 fps'te tavana vuruyor, darboğaz yok.
- Çıkarım p50 17.5 ms / p95 21.6 ms, yani kapasite yaklaşık 45-55 fps. Eski donanımda 3-4 kat yavaşlamaya kadar 10 fps eşiği tutar.
- Yüz bulunan kare: %96.
- Model yükleme 4.4 sn, ilk ~6 sn kare yok (GPU shader ısınması). Akışta kamera kontrolü ekranı bu süreyi zaten örter.
- Ana thread: 60 sn'de 29 kare > 50 ms, en uzun boşluk 333 ms. Muhtemelen iframe yüklenmesi ve `createImageBitmap`. Faz 1'de ana thread zamanlaması ekran kaydı ve olay zaman damgaları açısından izlenmeli.

## Spike 1: Figma Embed olayları

- Sayfa: `apps/spikes/figma.html`. Prototip linkini `embed.figma.com` + `embed-host` + `client-id` formatına çevirir, figma.com kaynaklı tüm `postMessage` olaylarını sayar: `INITIAL_LOAD`, `PRESENTED_NODE_CHANGED`, `MOUSE_PRESS_OR_RELEASE` (ve `handled` true/false dağılımı), `NEW_STATE`.
- Bulutta çalıştırılamadı: ortamın ağ politikası embed.figma.com'u engelliyor, ayrıca oturumsuz/oturumlu karşılaştırması için gerçek tarayıcı gerekiyor.
- Gerekenler: Figma'da bir OAuth app (client-id) ve test sayfasının adresinin (localhost ya da GitHub Pages) app ayarlarında izinli olması.

### Ölçümler (19 Kasım, Chrome 157, macOS M1)

- **Ücretsiz plan app'i + ücretsiz plan dosyası, oturumsuz:** sadece `LOGIN_SCREEN_SHOWN` (düz metin olarak geldi). Sebep: ücretsiz planda dosya "Anyone with the link" ile paylaşılamadı. Bu app emekliye ayrıldı.
- **Şirket planı app'i + link ile paylaşılan şirket dosyası, oturumsuz (gizli pencere):** `INITIAL_LOAD`, `PRESENTED_NODE_CHANGED` (açılış ekranı, `interactionType: NONE`) ve `MOUSE_PRESS_OR_RELEASE` (`handled: false`, `targetNodeId`, koordinatlar) geldi. Forumdaki Aralık 2025 / Ocak 2026 olumsuz raporları bu kurulumda tekrarlanmadı.
- **Aynı kurulum, oturumlu:** `INITIAL_LOAD` ve `PRESENTED_NODE_CHANGED` geldi; bu oturumda tıklama yapılmamış görünüyor.
- **Teyit, oturumsuz gizli pencere:** gezinmede 5 `PRESENTED_NODE_CHANGED` (geçişlerde `interactionType: ON_CLICK`) ve 6 `MOUSE_PRESS_OR_RELEASE` (4 `handled: true`, 2 `handled: false`) geldi. Ekran geçmişi, geri dönüş ve dead click sinyalleri Figma modunda üretilebilir.
- Kurulum notu: Figma'nın dosya paylaşımı herkese açık olmalı; bu ücretli plan gerektiriyor ya da şirket admin ayarlarına bağlı olabilir. Ürün aşamasında araştırmacıya "dosyayı link ile paylaş" adımı gösterilmeli.

## Kalan adımlar

1. Figma OAuth app oluştur, client-id'yi al.
2. Spike 1: oturumsuz (gizli pencere) ve oturumlu tarayıcıda çalıştır, iki JSON'u yükle.
3. Spike 2: eski laptopta Figma iframe'i yanında açıkken çalıştır, JSON'u yükle (GPU ve CPU ayrı ayrı daha iyi).
4. Spike 4: Chrome, Edge, Safari, Firefox'ta çalıştır, JSON'ları yükle.
5. JSON'lar gelince bu rapor her "hayır" için alternatifle kapatılır.

Spike 1 "hayır" çıkarsa önceden düşünülen alternatifler: (a) katılımcıdan Figma girişi istemek, (b) prototipi koda çevirip `embed-sdk` kullanmak, (c) `PRESENTED_NODE_CHANGED` gelip `MOUSE_PRESS_OR_RELEASE` gelmezse: iframe içindeki tıklamalar dışarıdan yakalanamadığı için Figma modunda yalnızca ekran bazlı sinyallerle (tereddüt, geri dönüş, süre) çalışmak; dead/rage click sadece script modunda kalır.
