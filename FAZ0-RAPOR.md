# Faz 0 raporu

Son güncelleme: 18 Kasım 2026

| # | Spike | Durum | Sonuç |
|---|---|---|---|
| 3 | `felt.ts` → `core` port'u | **Evet** | Senti ile birebir aynı çıktı |
| 4 | Sekme kaydı + kamera | **Chromium'da evet**, Edge/Safari/Firefox bekliyor | Headless Chromium'da ikisi aynı anda kaydediyor |
| 2 | FaceLandmarker worker ≥ 10 fps | **Boru hattı çalışıyor**, eski laptopta ölçüm bekliyor | Bulutta yazılım GPU'suyla 10-11 fps |
| 1 | Figma Embed olayları (oturumsuz) | **Büyük ölçüde evet** (19 Kasım), ekran geçişi ve handled:true teyidi bekliyor | Oturumsuz gizli pencerede olaylar geliyor |

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
- Bekleyen: Chrome ve Edge'de gerçek izin penceresiyle deneme; Safari ve Firefox notu.

## Spike 2: FaceLandmarker fps

- Sayfa: `apps/spikes/face.html`. `@mediapipe/tasks-vision` 0.10.35, module Web Worker, GPU delegate (başarısız olursa CPU), hedef 15 fps, 60 sn. Ölçtükleri: saniyelik fps (medyan ve p10), çıkarım süresi p50/p95, yüz bulunan kare oranı, ana thread takılması. Yanına Figma prototipi yüklenebilir.
- Bulgu: module worker'da klasik wasm yükleyicisi sessizce takılıyor; `forVisionTasks(base, true)` ile module wasm varyantı kullanılınca çalışıyor. Bu Faz 1'deki `sensing` paketine not.
- Bulut (headless Chromium, SwiftShader yazılım GPU'su, sahte kamera, yüz yok): 10-11 fps, model 400 ms'de yüklendi. Gerçek GPU'lu bir laptopta daha yüksek olması beklenir ama asıl ölçüm 2017-2019 laptopta yapılmalı.

## Spike 1: Figma Embed olayları

- Sayfa: `apps/spikes/figma.html`. Prototip linkini `embed.figma.com` + `embed-host` + `client-id` formatına çevirir, figma.com kaynaklı tüm `postMessage` olaylarını sayar: `INITIAL_LOAD`, `PRESENTED_NODE_CHANGED`, `MOUSE_PRESS_OR_RELEASE` (ve `handled` true/false dağılımı), `NEW_STATE`.
- Bulutta çalıştırılamadı: ortamın ağ politikası embed.figma.com'u engelliyor, ayrıca oturumsuz/oturumlu karşılaştırması için gerçek tarayıcı gerekiyor.
- Gerekenler: Figma'da bir OAuth app (client-id) ve test sayfasının adresinin (localhost ya da GitHub Pages) app ayarlarında izinli olması.

### Ölçümler (19 Kasım, Chrome 157, macOS M1)

- **Ücretsiz plan app'i + ücretsiz plan dosyası, oturumsuz:** sadece `LOGIN_SCREEN_SHOWN` (düz metin olarak geldi). Sebep: ücretsiz planda dosya "Anyone with the link" ile paylaşılamadı. Bu app emekliye ayrıldı.
- **Şirket planı app'i + link ile paylaşılan şirket dosyası, oturumsuz (gizli pencere):** `INITIAL_LOAD`, `PRESENTED_NODE_CHANGED` (açılış ekranı, `interactionType: NONE`) ve `MOUSE_PRESS_OR_RELEASE` (`handled: false`, `targetNodeId`, koordinatlar) geldi. Forumdaki Aralık 2025 / Ocak 2026 olumsuz raporları bu kurulumda tekrarlanmadı.
- **Aynı kurulum, oturumlu:** `INITIAL_LOAD` ve `PRESENTED_NODE_CHANGED` geldi; bu oturumda tıklama yapılmamış görünüyor.
- Bekleyen teyit: ekranlar arası geçişte `PRESENTED_NODE_CHANGED` tekrar geliyor mu, hotspot tıklamasında `handled: true` geliyor mu.
- Kurulum notu: Figma'nın dosya paylaşımı herkese açık olmalı; bu ücretli plan gerektiriyor ya da şirket admin ayarlarına bağlı olabilir. Ürün aşamasında araştırmacıya "dosyayı link ile paylaş" adımı gösterilmeli.

## Kalan adımlar

1. Figma OAuth app oluştur, client-id'yi al.
2. Spike 1: oturumsuz (gizli pencere) ve oturumlu tarayıcıda çalıştır, iki JSON'u yükle.
3. Spike 2: eski laptopta Figma iframe'i yanında açıkken çalıştır, JSON'u yükle (GPU ve CPU ayrı ayrı daha iyi).
4. Spike 4: Chrome, Edge, Safari, Firefox'ta çalıştır, JSON'ları yükle.
5. JSON'lar gelince bu rapor her "hayır" için alternatifle kapatılır.

Spike 1 "hayır" çıkarsa önceden düşünülen alternatifler: (a) katılımcıdan Figma girişi istemek, (b) prototipi koda çevirip `embed-sdk` kullanmak, (c) `PRESENTED_NODE_CHANGED` gelip `MOUSE_PRESS_OR_RELEASE` gelmezse: iframe içindeki tıklamalar dışarıdan yakalanamadığı için Figma modunda yalnızca ekran bazlı sinyallerle (tereddüt, geri dönüş, süre) çalışmak; dead/rage click sadece script modunda kalır.
