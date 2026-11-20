# Kararlar

Planın ve mimarinin değiştiği her karar burada, tarihli bir giriş olarak tutulur. En yeni giriş en üstte. Girişler silinmez ya da yeniden yazılmaz; bir karar değişirse yeni bir giriş eskisini geçersiz kılar.

- Kaynak sırası: bu dosya > `docs/HANDOFF-hypothesis-experience.md` > `FAZ0-RAPOR.md`. Çelişkide en yeni giriş geçerli.
- Kararlar iki yerden gelir: planlama sohbeti (claude.ai) ve kodlama oturumları (Claude Code). Her iki taraf da bu dosyayı okur ve buraya yazar.
- Bu repo herkese açık: katılımcı verisi, test videoları ya da müşteri bilgisi asla commit edilmez.

---

## 2026-11-20: Görev sonu retro varsayılan kapalı; olay şeması mobile hazır

Kaynak: ürün yönetimi thread'i (`faz1-core` incelemesi), Nezih onayı. Durum: uygulandı (`faz1-core`).

### Görev sonu retro
- Varsayılan kapalı: `questions.endOfTask` false, `limits.endOfTask` 0. Özellik ve çalışma JSON'undaki ayar duruyor; araştırmacı açabilir.
- Görev sonunda sadece SEQ, oturum sonunda "en çok zorlandığın görev" sorusu.

### Mobile hazır olay şeması
- `interaction_event` şema sürümü 2: `pointerType` (`mouse` | `touch` | `pen`), `viewport` ({w, h}), `orientation`, `streamId`. Tıklama ve dokunma aynı olay tipi (`click`); ayrımı `pointerType` yapar. Yeni tip: `pointer-move` (sadece fare/kalem, kısıtlanmış sıklıkta).
- `SecondSample` da `streamId` taşır. Zaman modelinde akış bazında fark: `StreamInfo { streamId, deviceId, kind, offsetSec }` ve `alignToSession`.
- Yetenek bayrakları (`Capabilities`: `hasHover`, `hasCamera`, `hasScreenVideo`) `core`'a girer. Ölçülemeyen sinyal hesaptan çıkarılır, "sakin" sayılmaz; rapor hangi sinyallerin ölçüldüğünü `signals` alanında gösterir.
- Rage click dokunmayı da kapsar: dokunmada "aynı bölge" yarıçapı 60 px (farede 40 px).
- `packages/embed-sdk`: prototip sayfasına eklenen tek `<script>` (`data-parent-origin` zorunlu, mesajlar sadece o origin'e). Aynı şemaya yazar; form değerleri, metin ve tuş vuruşları gönderilmez. Zaman damgası mutlak (`timeOrigin + now`), uygulama oturum saatine çevirir (`fromEmbedMessage`). Figma adaptörü de cihaz bağlamını (`pointerType`, `viewport`, `orientation`, `streamId`) her olaya ekler.

---

## 2026-11-20: Konuşma için ses-dudak uyumu

Kaynak: Nezih ile sensing denemeleri. Durum: uygulandı (eşik kalibre edilecek).

- Saniye bazında "ses var + dudak oynuyor" kontrolüne ek olarak ses yüksekliği ile dudak aralığının kare kare birlikte hareket edip etmediğine bakılıyor (`avSync`, -1..1). Pencere: bu ve önceki saniye; sesin dudaktan 100 ms önce ya da 200 ms sonra gelmesine izin veriliyor.
- Ses varken uyum hesaplanabiliyorsa konuşma sayılması için dudak hareketi + `avSync` ≥ 0.3 gerekir; hesaplanamıyorsa önceki dudak kuralı geçerli.
- Transkript bu amaçla kullanılmayacak: kimin konuştuğunu ayırmaz, sesin cihazdan çıkmasını ya da ağır bir yerel modeli gerektirir. Retro sesli cevapları için MVP sonrası planda kalıyor.

---

## 2026-11-20: Konuşma doğrulaması dudak aralığına geçti

Kaynak: Nezih'in ikinci M1 denemesi. Durum: uygulandı. Aynı günün "Konuşma oranı çene hareketiyle doğrulanır" girişindeki eşiği geçersiz kılar.

- Konuşurken `jawOpen` sadece 0.01-0.05 oynadı; 0.08 eşiği gerçek konuşmayı kaçırdı.
- Kontrol artık dudak aralığı: iç üst dudak (landmark 13) ile iç alt dudak (14) arası, yüz genişliğine bölünür; saniye içindeki aralığı (`mouthMovement`) ≥ 0.015 ise ağız hareketli. Bir önceki saniyedeki hareket de geçerli.
- `jawOpen` doğrulamadan çıkarıldı (sadece ham değer olarak saklanıyor): üçüncü denemede baş hareket ederken konuşmadan 0.03'e kadar oynadı ve yanlış konuşma üretti. Aynı denemede dudak aralığı sessiz saniyelerde ≤ 0.009, konuşurken ≥ 0.022 kaldı.
- Eşikler bir denemeye dayanıyor; konuşma + başkasının konuştuğu kayıtlarla tekrar kalibre edilecek.

---

## 2026-11-20: Konuşma oranı çene hareketiyle doğrulanır

Kaynak: Nezih'in M1 denemesi (sensing.html). Durum: uygulandı.

- Mikrofon ortamdaki tüm sesi aldığı için ham ses aktivitesi konuşmayı fazla gösterdi. `talking` artık sadece aynı saniyede (ya da bir önceki saniyede) `jawOpen` en az 0.08 oynadıysa sesi sayar; ağız hareketsizse 0, yüz yoksa `null` (doğrulanamaz).
- Ham değerler ayrıca saklanır: `voice` (mikrofon) ve `jawMovement` (saniye içindeki jawOpen aralığı). 0.08 başlangıç değeri, sonraki denemelerle kalibre edilecek.

---

## 2026-11-20: sensing paketi ve oturum saati (uygulama notları)

Kaynak: Claude Code (`faz1-core` branch'i). Durum: uygulandı.

- `packages/sensing`: worker (MediaPipe FaceLandmarker, blendshape açık) her kare için sadece sayı döndürür; kare worker'da kapatılır. Ana thread'deki `SensingClient` kameradan en fazla 15 fps, 320 px genişliğe küçültülmüş kare gönderir, aynı anda tek kare işlenir.
- Saniye toplayıcı (`frames.ts`, saf): kare sayısı, yüz (karelerin yarısından fazlası), baş hızı (yüz genişliği/sn), hareketsizlik (0.2 yüz genişliği/sn altındaki aralıkların oranı), yüz genişliği medyanı, kaş ortalaması, konuşma oranı.
- Göz kırpma: göz kapanma skoru 0.5'i geçip 0.35'in altına inince bir kırpma. Dakikadaki oran son 15 sn'nin ≥ 15 kareli saniyelerinden hesaplanır, en az 5 geçerli saniye ister; yoksa `null`.
- Ses: enerji tabanlı VAD (uyarlanan gürültü tabanının 3 katı, 8 karelik tutma). Ses hiçbir yere bağlanmaz ya da kaydedilmez.
- CPU delegate sadece GPU başarısız olursa ve 4+ çekirdekte denenir.
- Oturum saati (`core/clock.ts`): `performance.timeOrigin + performance.now()`, görev başında sıfır, soru sırasında durur; duruşta sensing kare ve ses almaz.
- Kalite kontrolü (`sensing/quality.ts`): ilk 3 sn GPU ısınması sayılmaz, sonraki 5 sn'nin kare sayısı ve yüz bulunan saniye oranı `core`'daki karara verilir.
- Deneme sayfası: `apps/spikes/sensing.html` (gerçek kamerayla 60 sn ölçüm, JSON indirme).

---

## 2026-11-20: core iki eksenli modele geçti (uygulama notları)

Kaynak: Claude Code (`faz1-core` branch'i). Durum: uygulandı. 20 Kasım tarihli girişlerin `core` karşılığı ve uygulamada verilen küçük kararlar.

- Ürün modeli (`screens.ts`) artık efor ve sürtünme olarak iki eksen üretiyor; Senti'nin impuls/EMA eğrisi ve ani baş hareketi (startle) ürün modelinden çıktı, sadece `compat/` regresyonunda duruyor. Konuşma oranı da ürün modelinde kullanılmıyor (think-aloud konuşması karıştırır).
- **İlk aksiyona kadar geçen süre efor ekseninde.** `flow` kartında kişisel eşiği aşan duraksama `effort-mismatch` (yön: `high`); `read`/`decide` kartında duraksama beklenen efor, sapma değil. Sürtünme ekseni sadece etkileşim olayları: geri dönüş, tepkisiz tıklama, art arda tıklama.
- `effort-mismatch` (yön: `low`): `read`/`decide` kartında süre `expectedSec[0]` altında, sürtünme ve duraksama yok.
- `unexpected-friction` artık her kart tipinde üretiliyor (önce sadece `flow`).
- Yüz sinyalleri (göz kırpma, hareketsizlik, ekrana yaklaşma, kaş) `faceSignals` açıksa okunur, varsayılan kapalı. Sapma üretmezler: efor skoruna %40 ağırlıkla katılır ve sapmanın şiddetini artırırlar. Kaş sadece etkileşim sürtünmesi varsa sayılır. Göz kırpma saniyesi 15 kareden azsa yok sayılır.
- Gözlenen skorlar 0-100, ekran ziyareti boyunca sabit (basamaklı eğri). Başlangıç eşikleri (göz kırpma düşüşü %25, hareketsizlik +0.15, yaklaşma +%10, kaş +0.1, sürtünme ağırlıkları 25/20/35) geriye dönük doğrulamada kalibre edilecek.
- Her sapmanın bir `at` anı ve `replay` aralığı (`at` ± 5 sn) var: sürtünmede ilk sürtünme olayı, duraksamada eşiğin aşıldığı an, süre aşımında beklenen üst sınırın dolduğu an, kopmada ilk kayıp saniye.
- Soru motoru (`questions.ts`): ekrandan çıkışta önce planlı `probe` (ekran başına bir kez), yoksa o ekranın en şiddetli sapması (süre aşımı hariç). Varsayılan sınırlar görev başına 2 geçiş sorusu, görev sonunda 2, oturum başına 6; çalışma JSON'unda değiştirilebilir.
- Metin kataloğu (`texts.ts`, Türkçe varsayılan) ve ölçekler `{min, max, labels}`: en fazla 11 seçenek; raporda puanlar 0-1'e normalize edilip karşılaştırılıyor. Araştırmacı rapor cümleleri katalog dışında, katılımcıya gösterilmez.
- Çalışma JSON'u birden fazla görev alıyor (`tasks`); eski tek görevli biçim (`taskPrompt` + `screens`) tek görev olarak kabul ediliyor. `context` `workplace` ya da `education` ise `faceSignals` varsayılanı kapalı.

---

## 2026-11-20: Katılımcıya görünen metinler ve ölçekler araştırmacı tarafından düzenlenebilir (MVP sonrası)

Kaynak: ürün yönetimi thread'i (Nezih, 20 Kasım). Durum: kararlaştırıldı; uygulama MVP sonrası, mimari şimdiden kapı bırakır.

- Beklenti ve SEQ puanlaması araştırmacının inisiyatifinde: ölçek aralığı (örn. 1-7 ya da 1-10) ve uç/ara etiketler düzenlenebilir.
- Soruların çıkış anları (görev öncesi/sonrası, ekran geçişi, oturum sonu) ve soru metinleri düzenlenebilir.
- Son kullanıcıya görünen her metin (onay, yönergeler, butonlar, sorular) hem düzenlenebilir hem çok dilli olmalı.

MVP'de yapılacak ucuz hazırlık (şimdi):
- Katılımcıya görünen tüm metinler kodun içine gömülmez, tek bir metin kataloğunda anahtar → metin olarak durur (varsayılan dil Türkçe).
- Ölçek, çalışma JSON'unda `{ min, max, labels }` olarak tutulur; varsayılan 1-7. Kod sabit 7'ye dayanmaz.
- Soru tetikleme noktaları çalışma JSON'unda veri olarak tanımlanır (varsayılanlar önceki girişteki gibi).

---

## 2026-11-20: Yüz sinyali ayarı, 30 sn ısınma, görev bazında zorluk puanı

Kaynak: ürün yönetimi thread'i (Nezih onayı, 20 Kasım). Durum: kararlaştırıldı.

### Yüz sinyalleri (hukuki çerçeve)

- Çalışma bazında "yüz sinyalleri" ayarı. İşyeri ya da eğitim bağlamındaki çalışmalarda varsayılan **kapalı**; araştırmacı açarsa bağlamı onaylar.
- Katılımcıdan yüz sinyalleri için ayrı, açık onay (kamera zaten opsiyonel).
- Sorumluluk sözleşmeyle tamamen müşteriye devredilemez (AI Act Madde 5 sağlayıcıyı da bağlar). Koruma ürün tasarımında: duygu çıkarımı yok, kareler cihazdan çıkmaz, sadece sayılar gider. Bunlar müşteri ayarıyla değiştirilemez.
- İlk dış müşteriden önce tek seferlik, dar kapsamlı hukuki görüş: ham blendshape'in duygu çıkarmadan destekleyici kullanımı Madde 5 ve GDPR Madde 9 açısından.
- **Yüz verisi ancak vazgeçilmez olduğu gösterilirse kalır:** geriye dönük doğrulamada ve karşılaştırmalı testte her yüz sinyali kapatılarak katkısı ölçülür; katkısı olmayan sinyal çıkar. Kamera tabanlı efor sinyalleri bu kanıt gelene kadar zorunlu değil; kamerasız mod tam bir mod olarak kalır.
- Nezih'in kendi çalışmalarında katılımcılar şirket çalışanıysa yüz sinyalleri kapalı.

### Isınma görevi

- Süre ~20 sn yerine **30 sn** (nötr okuma + birkaç tıklama).
- 30 sn'de 5-10 göz kırpma olur; göz kırpma baseline'ı ilk görevin ilk ekranıyla güncellenir. Geriye dönük doğrulamada sadece ısınma ile ısınma + ilk ekran karşılaştırılır.

### Görev sonu: retro yerine zorluk puanı

- Görev sonundaki klipli retro kaldırıldı (sorular ekran geçişinde soruluyor, bkz. önceki giriş).
- Her görevden **önce** beklenen zorluk (1-7), görevden **hemen sonra** SEQ (1-7). Albert & Dixon beklenen/yaşanan zorluk yöntemi; katılımcının kendi beklenti-deneyim farkı raporda hipotez-davranış farkının yanında gösterilir.
- Oturum sonunda görevler kısa hatırlatılır ve "en çok zorlandığın görev hangisiydi, neden?" diye tek açık soru sorulur (yazılı).

### Figma

- "Anyone with the link" paylaşımı kabul edildi; alternatif araştırılmayacak.

---

## 2026-11-20: Sorular ekran geçişinde, AI ile derinleştirme; retro için video yerine frame replay

Kaynak: ürün yönetimi thread'i (Nezih onayı, 20 Kasım). Durum: kararlaştırıldı. 20 Kasım tarihli "Retrospektif" bölümünü (madde 5) aşağıdaki noktalarda geçersiz kılar.

**Konumlandırma:** "moderated derinliği, unmoderated ölçekte".

### Soru zamanlaması (hibrit)

- **Planlı soru:** hipotez kartına opsiyonel `probe` alanı (araştırmacının önceden yazdığı soru). Katılımcı o ekrandan **çıkarken** sorulur.
- **Sinyalle tetiklenen soru:** beklenmedik sapma olursa yine **ekran geçişinde** sorulur, ekranın ortasında asla. Görev başına en fazla 2 soru (planlı + tetiklenen toplam).
- Soru sırasında oturum saati durur; o ekranın ölçümü soru başlamadan kapanmış olur.
- Kalan sapmalar görev sonunda kısa retro olarak sorulur. Toplam oturum başına en fazla 6 soru anı.

### AI ile derinleştirme

- Cevaba göre en fazla 2 takip sorusu. AI'a hipotez kartı, gözlenen davranış (sadece olgular) ve katılımcının cevabı verilir.
- Kurallar: yönlendirmeyen, nötr dil; duygu/niyet çıkarımı yok (İlke 1); katılımcıya sayı gösterilmez; her soruda "geç" seçeneği.
- MVP'de cevap **yazılı** başlar. Ses + transkripsiyon, sesin cihazdan çıkması için ayrı onay ve AB bölgesi gerektirdiği için sonraki adım.
- AI soru kalitesi (yönlendirme var mı) M3 pilotunda ayrıca değerlendirilir.

### "O ana götürme": video yerine frame replay

- Retro ve soru anında katılımcıya ekran videosu değil, Figma frame görüntüsü + kaydedilen cursor izi ve tıklama noktaları oynatılır.
- Sebep: katılımcının ekranından kayıt gerekmez (gizlilik), Safari/Firefox/mobilde çalışır.
- Ekran videosu sadece araştırmacı raporu için gerekirse opsiyonel kalır; MVP'de nerede saklanacağı ayrıca kararlaştırılacak.
- Retro/rapor bileşeni bir "oynatma kaynağı" soyutlaması alır (frame replay, ileride video).

### Etkisi

- M2 (geriye dönük doğrulama) etkilenmez.
- M3'teki retro adımının yerini bu soru motoru alır. `screens.ts` `retroMoments` mantığı "geçişte soru adayı" seçimine dönüşür.

---

## 2026-11-20: Arayüze özgü model, retrospektif, zaman senkronu, geriye dönük doğrulama

Kaynak: planlama sohbeti (18-19 Kasım). Durum: kararlaştırıldı, kod uyarlaması Nezih onayıyla yapılacak (aşağıda "Kodla uzlaştırma").

### 1. Tek eksenli eğri yerine iki eksenli model

Oyundaki gerilim ani ve fiziksel; arayüzdeki tepkiler yavaş ve bilişsel. Okuma ve düşünme çoğu zaman hareketin *azalmasıyla* görünür (göz kırpma bilişsel yük arttıkça azalır). Senti mantığıyla dikkatle okuyan kullanıcı "tepkisiz" görünür. Bu yüzden efor ve sürtünme ayrı eksenler: efor iyi olabilir, sürtünme değil.

- **Efor:** baş hareketsizliği, göz kırpma sıklığının baseline'a göre düşmesi, ekrana yaklaşma, yavaş scroll, ekranda geçen süre
- **Sürtünme:** dead/rage click, geri dönüş, aranarak scroll, kaş indirme, iç çekme, seçenekler arası hover salınımı

| behavior | Beklenen efor | Beklenen sürtünme | Not |
|---|---|---|---|
| `flow` | düşük | düşük | |
| `read` | yüksek | düşük | |
| `decide` | yüksek | düşük | Seçenekler arası salınım burada beklenen davranış, sürtünme sayılmaz |

Sapma tipleri:

| kind | Koşul |
|---|---|
| `unexpected-friction` | Sürtünme beklenenin üstünde (herhangi bir kartta) |
| `effort-mismatch` | `read`/`decide` kartında efor düşük (okunmadan/düşünmeden geçildi) ya da `flow` kartında efor yüksek |
| `disengagement` | Yüz ≥ 2 sn kayıp ya da tab-out |
| `over-time` | Süre `expectedSec[1]` üstünde |

`missed-decision`, `effort-mismatch` içine alındı.

### 2. Zaman ölçeği

- Senti'nin 4 sn'lik impuls sönümü ve tepe değer mantığı ürün modelinde kullanılmaz (sadece `compat/` regresyonunda kalır).
- Ekran pencereleri içinde **oranlar ve süreler**: dakikadaki göz kırpma, hareketsiz geçen süre yüzdesi, geri dönüş sayısı, ilk aksiyona kadar geçen süre.
- Ani kafa hızı (startle) arayüzde anlamlı bir sinyal değil; düşük ağırlıklı kalabilir ya da çıkarılabilir.

### 3. Baseline

- Isınma görevi boş ekrana bakmak değil, **nötr bir okuma + birkaç tıklama**. Ekran okuması zaten göz kırpmayı düşürür; dinlenme baseline'ı her okumayı "yüksek efor" gösterir.
- Baseline'a göz kırpma sıklığı ve kaş hareketi medyanı eklenir.

### 4. Yüz sinyalleri

- **CLAUDE.md İlke 1'in netleştirilmesi:** duygu/ifade sınıflandırma skorları (korku, şaşkınlık vb.) kullanılmaz. MediaPipe blendshape'lerinden **ham kas hareketi** skorları, baseline'a göre değişim olarak ve **sadece destekleyici** sinyal olarak kullanılabilir. Raporda hiçbir zaman yorumlanmaz ("kaşını çattı" ya da "kafası karıştı" yazılmaz).
- Kullanılacaklar: baş pozisyonu ve uzaklık (güvenilir), `eyeBlinkLeft/Right` (güvenilir, fps'e bağlı), `jawOpen` (konuşmayı doğrular), `browDownLeft/Right` ve `browInnerUp` (destekleyici).
- Yüz sinyali tek başına sapma üretmez; etkileşim sinyaliyle birlikte gelirse sapmanın şiddetini artırır.
- **fps eşikleri:** kamera sinyalleri için alt sınır 10 (Faz 0 kararı aynen). Göz kırpma 100-400 ms sürdüğü için **göz kırpma sinyali ≥ 15 fps ister**; altında sadece göz kırpma devre dışı kalır. (Faz 0'daki eski Intel Mac medyan 13 fps: o donanımda göz kırpma kapalı, diğer kamera sinyalleri açık.)

### 5. Retrospektif (ipuçlu retrospektif)

- Klip: sapma anından **5 sn önce başlar, 5 sn sonra biter.**
- Ekran kaydının üzerine **cursor izi ve tıklama noktaları** çizilir.
- Katılımcıya sayı gösterilmez ("14 sn durdun" yok). Soru nötr: "Bu ekranda ne düşünüyordun, ne arıyordun?" Sayılar sadece araştırmacı raporunda.
- "Hatırlamıyorum" seçeneği var, veri olarak kaydedilir.
- Sorular oturum sonunda değil, **her görevin hemen ardından** sorulur.
- Cevap ses (tercih), yazı yedek.
- Opsiyonel, ayrı onaylı: katılımcının kendi yüz videosu, düşük çözünürlükte **sadece tarayıcı belleğinde** tutulur, retrospektifte klibin köşesinde gösterilir, retrospektif bitince silinir. Sunucuya asla gitmez.

### 6. Zaman senkronizasyonu

- Tek oturum saati (`performance.now()` + `timeOrigin`, Faz 0 kararı 5 ile aynı), görev başında sıfır.
- Kamera, mikrofon ve ekran kaydının gerçek başlama anları ayrı ayrı kaydedilir, offset olarak düzeltilir.
- Görev başında ekranda kısa bir senkron işareti gösterilir; videoda bulunarak offset doğrulanır.
- İki katman: alt katman zaman (tüm akışlar), üst katman ekran (geçiş olaylarıyla bölünmüş parçalar). Analiz ekran parçalarında; videoda bulma ve hizalama zaman ekseninde.
- Telefon + laptop modunda (Faz 2) ortak referans sunucu saati.

### 7. Yeni adım: geriye dönük doğrulama (offline adaptör)

Amaç: eski usability test videolarında sistemi çalıştırıp o çalışmaların mevcut bulgularıyla karşılaştırarak eşikleri ilk canlı testlerden önce kalibre etmek. Faz 1 ile paralel yürüyebilir.

- Yeni paket: `packages/offline-adapter`. Video → `SecondSample` + `InteractionEvent` + ekran parçaları; aynı `core` ile çalışır.
- Ekran geçişleri: ffmpeg/OpenCV kare farkı. Yüz: MediaPipe VIDEO modu. Ses: VAD; opsiyonel yerel Whisper transkripti (zaman damgalı).
- Tıklama: kayıtta tıklama efekti varsa tespit, yoksa "bilinmiyor". Hover ve form düzeltme videodan çıkarılmaz.
- AI (vision model) sadece **etiketleme** için: ekran isimleri, eylem özetleri. Zamanlama ve ölçüm deterministik araçlarla.
- Think-aloud videolarında ses sinyali kapatılır, yüz sinyalinin ağırlığı düşürülür (konuşma çene ve kaş hareketini bozar).
- Baseline: videonun başındaki sakin bölüm.
- Hipotez kartları videolar yeniden izlenmeden, orijinal test planı ve görev metninden yazılır (geriye dönük önyargıyı önlemek için).
- Değerlendirme: zaman damgalı bulgu listesiyle karşılaştırma, ±5 sn tolerans; isabet ve kapsama; her sinyal tek tek kapatılarak katkı analizi.
- **Gizlilik:** işleme tamamen yerel (Nezih'in bilgisayarı), videolar hiçbir dış servise yüklenmez ve **bu repoya asla girmez**. Çıktıda sadece sayısal sinyaller ve etiketler saklanır. Sadece onay kapsamı uygun çalışmalarla.

### Kodla uzlaştırma (20 Kasım itibarıyla `main`)

Claude Code için iş listesi. Uygulamadan önce Nezih'e özetle, onayla uygula.

- [ ] `types.ts`: `BEHAVIOR_LEVEL` (20/50/80) → iki eksenli beklenti (`effort`, `friction`). `Mismatch.expected/felt` tek sayıdan iki eksene.
- [ ] `types.ts`: `MismatchKind` içinde `missed-decision` → `effort-mismatch`.
- [ ] `types.ts`: `SecondSample`'a `blinkRate` (dakikada, null = fps yetersiz), `browDown`, `stillness` (hareketsiz süre oranı) alanları; `Baseline`'a karşılıkları.
- [ ] `screens.ts`: `impulseCurve` + `DECAY_SEC` + EMA tabanlı gerçek eğri yerine ekran bazlı oran/süre skorları; iki ayrı gerçek eğri (efor, sürtünme). `STARTLE_FLOOR` ile kafa hızı impulsu düşük ağırlığa indirilir ya da kaldırılır.
- [ ] `screens.ts` `retroMoments`: klip aralığı sapmanın başından 5 sn önce ile 5 sn sonrası; görev bazında seçim (oturum sonu değil).
- [ ] `screens.ts` `describe`: `effort-mismatch` cümleleri (iki yön). Duygu kelimesi yok testi korunur.
- [ ] Testler: her değişiklik Vitest ile; Senti regresyonu (`compat/`) dokunulmadan geçmeye devam eder.
- [ ] Sensing (Faz 1): blendshape çıkışı açık; göz kırpma tespiti ≥ 15 fps koşuluyla.
- [ ] `.gitignore`: offline adaptör için yerel video klasörü (örn. `data/`) eklenir.

---

## 2026-11-19: Faz 0 kapandı

Kaynak: Claude Code. Ayrıntılar ve Faz 1'e taşınan 5 karar: `FAZ0-RAPOR.md` ("Faz 1'e taşınan kararlar").
