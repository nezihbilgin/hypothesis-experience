# Kararlar

Planın ve mimarinin değiştiği her karar burada, tarihli bir giriş olarak tutulur. En yeni giriş en üstte. Girişler silinmez ya da yeniden yazılmaz; bir karar değişirse yeni bir giriş eskisini geçersiz kılar.

- Kaynak sırası: bu dosya > `docs/HANDOFF-hypothesis-experience.md` > `FAZ0-RAPOR.md`. Çelişkide en yeni giriş geçerli.
- Kararlar iki yerden gelir: planlama sohbeti (claude.ai) ve kodlama oturumları (Claude Code). Her iki taraf da bu dosyayı okur ve buraya yazar.
- Bu repo herkese açık: katılımcı verisi, test videoları ya da müşteri bilgisi asla commit edilmez.

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
