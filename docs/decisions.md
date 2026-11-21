# Kararlar

Planın ve mimarinin değiştiği her karar burada, tarihli bir giriş olarak tutulur. En yeni giriş en üstte. Girişler silinmez ya da yeniden yazılmaz; bir karar değişirse yeni bir giriş eskisini geçersiz kılar.

- Kaynak sırası: bu dosya > `docs/HANDOFF-hypothesis-experience.md` > `FAZ0-RAPOR.md`. Çelişkide en yeni giriş geçerli.
- Kararlar iki yerden gelir: planlama sohbeti (claude.ai) ve kodlama oturumları (Claude Code). Her iki taraf da bu dosyayı okur ve buraya yazar.
- Bu repo herkese açık: katılımcı verisi, test videoları ya da müşteri bilgisi asla commit edilmez.

---

## 2026-11-21: Kurulum ekranı v0; kamera açık ağ kontrolü; klavye ayarı

Kaynak: PM iş sırası (Nezih bugün test yapamadığı için Nezih'e bağlı olmayan işler). Durum: uygulandı (`faz1-core`).

- **Kurulum ekranı v0** (`apps/web/setup.html`, yerel): araştırmacı JSON yazmadan çalışma kurar. Çalışma (ad, Figma linki, bağlam, yüz sinyalleri), ekranlar (anahtar, ad, katılımcıya görünen ad, davranış, beklenen süre, takma adlar; bir oturum dosyasından ekranları içe alma), görevler (metin, başlangıç ve hedef ekran ya da durum, beklenen yol sıralı, kabul edilebilir sapmalar, ekran bazlı sorular, görevde farklı kart alanları). Canlı doğrulama `parseStudy` ile; çıktı çalışma düzeyinde biçimdeki JSON. Var olan bir dosya açılabilir (eski görev başına biçim otomatik çevrilir). Pilot çalışma dosyası bu ekranla açılıp kaydedilince birebir aynı çıkıyor ve aynı oturumdan aynı rapor üretiyor. Isınma soruları ve 5 saniye testi onaylanmadığı için yok.
- **Kamera açık ağ kontrolü:** sahte kamera ve mikrofonla tam oturum; uygulama yalnızca kendi origin'inden GET yaptı (kameralıda ek olarak MediaPipe model ve wasm dosyaları), GET dışı istek, gövdeli istek ya da WebSocket yok. Ayrıntı `docs/privacy-audit-2026-11-20.md` ekinde. Bu kontrol için `?debug=1&keepCamera=1` test kancası eklendi (yüz bulunamasa da kamerayı açık tutar; sadece debug).
- **Onay metni:** "Prototip Figma'dan yüklenir ve Figma kendi kullanım verilerini toplayabilir. Kamera görüntün ne Figma'ya ne bize gider."
- **Klavye ayarı:** `disable-default-keyboard-nav=1` otomatik olarak doğrulanamadı; Figma embed'i headless Chrome'da ve uygulama içi tarayıcıda yüklenmedi. Nezih'in bir sonraki gerçek Chrome oturumunda ok tuşuyla denenecek; tıklamasız geçiş tespiti her durumda çalışıyor.

---

## 2026-11-21: İnsan diliyle rapor; görevler ekran paylaşır (allowedScreens)

Kaynak: Nezih'in rapor geri bildirimi ("Bunları insan okuyacak"), PM brifi. Durum: uygulandı (`faz1-core`).

- **Görevler ekran paylaşır:** bir görevin `expectedPath`'ine çalışmadaki her ekran girebilir (başka görevde kullanılmış olsa da). İsteğe bağlı `allowedScreens`: kabul edilebilir sapmalar; ölçülür ama "yol dışı" sayılmaz ve oradan dönmek "geri dönüş" sayılmaz.
- **Görev özeti:** "Adım özeti" adı "Görev özeti" oldu; en altta toplam satırı (süre, ziyaret, geri, gidip gelme, tıklama, tepkisiz, art arda toplamları ve genel misclick oranı; skor sütunlarında "–").
- **Birimli, açıklamalı etiketler:** görev satırı "Doğrudan başarı · Görev 33 sn sürdü. İlk 8 sn ilk ekranda etrafa bakınmakla geçti (ilk tıklamaya kadar), bu süre duraksama hesabına girmez."; duraksama 0-100 skor yerine saniye ve kişinin kendi normali ("İlk tıklamaya kadar 4,2 sn (bu katılımcının normali 2,1 sn)"), modelle aynı eşikte işaretlenir (normalin 2 katı ve en az 3 sn); sürtünme "Sorun işareti yok" ya da sebepler ("1 geri dönüş, 3 tepkisiz tıklama"); ziyaret "Bu ekrana 2 kez geldi, toplam 34 sn kaldı"; puanlar ölçek açıklamasıyla. Raporun başında katlanabilir "Bu rapor nasıl okunur?" kutusu, tablo başlıklarında kısa açıklamalar.
- Toplu (çok katılımcılı) rapor sonraya kaldı.

---

## 2026-11-21: Adım kartları; tıklamasız geçiş (muhtemelen klavye)

Kaynak: Nezih'in rapor geri bildirimi, PM işi. Durum: uygulandı (`faz1-core`).

- **Adım adım:** raporda ekranlar ayrı tablolar yerine görev içinde ziyaret sırasına göre adım kartları olarak gösterilir. Solda ekran görüntüsü, tıklama noktaları ve açıklama; sağda o adımın Hipotez/Gözlem satırları, sorusu ve cevabı, ölçümleri (ziyaret, süre, duraksama/efor, sürtünme, geri, loop, misclick, rage). Yol dışı adımlar işaretli. "Öne çıkan anlar" en üstte ve her an ilgili karta bağlantılı. Eski tablo katlanmış "Adım özeti" (CSV ile aynı veri).
- **Tıklamasız geçiş:** Figma prototiplerinde katılımcı klavyeyle (ok tuşları) ekran değiştirebiliyor. Embed olaylarından tespit edilebiliyor: `PRESENTED_NODE_CHANGED` olayının `interactionType` değeri `ON_CLICK` değilse ve öncesindeki 1 sn içinde tıklama yoksa geçiş "tıklamasız geçiş (muhtemelen klavye)" sayılır (`core/signals.ts` `clicklessTransitions`). Adım kartında rozet, sağlık bloğunda `clickless-transitions` bayrağı, raporda öne çıkan an. Hedefe tıklamasız geçiş içeren bir yoldan ulaşan görev doğrudan başarı sayılmaz (dolaylı).
- Pilot prototipteki son oturumda 2 tıklamasız geçiş bulundu (bir ekranın katman durumundan ana durumuna dönüş, `interactionType: NONE`, öncesinde tıklama yok).
- **Klavyeyi kapatma:** embed linkine `disable-default-keyboard-nav=1` eklendi. Figma'nın bu parametreyi destekleyip desteklemediği gerçek oturumda doğrulanacak; desteklemezse tespit ve bayrak yine çalışır.
- Not (sonrası için): sürtünme algılanınca anlık "şu an ne düşünüyorsun?" sorusu seçeneği.

---

## 2026-11-21: Rapor okunabilirliği (P1, P2)

Kaynak: Nezih'in rapor geri bildirimi, PM önceliklendirmesi, Nezih onayı. Durum: uygulandı (`faz1-core`); sadece rapor katmanı, `core` hesapları değişmedi.

- Tıklama haritasının altında açıklamalı sayılar: çalışan, tepkisiz, "Tasarımın dışına tıklama". "Görüntüsü olmayan durum" satırı kalktı; konumu bilinmeyen tıklamalar varsa tek satırda sayılır.
- Görev başlığının altında ayrı bir satır: beklenen zorluk → SEQ, sonuç, süre (yönelim süresiyle).
- Sapmalar iki satır: "Hipotez: karar ekranı (seçenekleri tartması beklendi)" / "Gözlem: 3 sn'de geçti". "X bekledin" kalıbı raporda kullanılmıyor.
- Yüz sinyalleri kapalıyken "Efor" sütunu "Duraksama" adını alır ve tablonun üstünde tek satır açıklama var. Ekran satırında ziyaret sayısı ve toplam süre ("2 ziyaret, toplam 34 sn"; aynı görevde tekrar gelince toplanır, başka görevde ayrı sayılır).
- Sağlık bloğunda yüz sinyali durumu ("bu çalışmada kapalı" / "açık" / "bu oturumda kullanılmadı").
- Her görevin başında "Öne çıkan anlar": en ağır 3 sapma, yarıda bırakılan ekran, art arda tıklama ve gidip gelme; her biri o ekran için verilen cevapla. Ham tablolar ve haritalar katlanmış bölümde; yazdırırken hepsi açılır.

---

## 2026-11-20: Tıklama haritası ve dışa aktarma (M3)

Kaynak: Nezih onayı ("evet eklensin, dışa aktar, güvenlik önemli"), PM kapsamı. Durum: uygulandı (`faz1-core`); Figma görüntüleri Nezih'in bilgisayarına indirilince harita dolacak.

- Araştırmacı raporu: `apps/web/report.html` (yerel). Oturum dosyaları tarayıcıda açılır, hiçbir yere gönderilmez. En üstte sağlık bloğu ve bayraklar; görev başına sonuç, görev ve yönelim süresi, beklenti → SEQ, sapma cümleleri, sorular ve cevaplar, ekran metrikleri (süre, efor, sürtünme, geri, loop, misclick, rage, yol dışı); birden fazla oturumda çalışma özeti (sonuç dağılımı, ekran başına drop-off hunisi).
- Raporlar dosyadaki ham olaylardan güncel modelle ve güncel çalışma dosyasıyla yeniden hesaplanır; eski oturum dosyaları da aynı şekilde okunur.
- Statik tıklama haritası "ekran referans görüntüsü" soyutlaması üzerinde: Figma sağlayıcısı gitignore'daki `frames.local/<node>.png` görüntülerini kullanır (1x; Figma frame koordinatları doğrudan piksellere oturur). Her tıklama, tıklandığı andaki durum node'unun görüntüsüne çizilir (`payload.node`); konumu iç kaydırma alanına göre olan ya da görüntüsü olmayan tıklamalar haritaya çizilmez, "görüntüsü olmayan durum" altında sayılır.
- Dışa aktarma: metrik CSV'si (katılımcı × görev × ekran satırları) ve tarayıcının "PDF olarak kaydet" özelliğiyle yazdırılabilir görünüm.
- Şirket ekranları (frame görüntüleri) ve indirme script'i gitignore'da: `frames.local/`, `*.local.sh`.

---

## 2026-11-20: Platform sırası

Kaynak: ürün yönetimi thread'i, Nezih onayı. Durum: kararlaştırıldı; bugün kodda değişiklik yok.

- Sıra: Figma (şimdi) → canlı web siteleri (embed-sdk, referans gezinti, ekran = `data-step`, durum = otomatik ya da `data-state`) → mobil web → native SDK.
- Native SDK sadece test sürümlerinde açılır (TestFlight, iç dağıtım, debug); App Store sürümüne asla girmez.
- Mobil ve native'de kamerasız mod varsayılan; iki cihaz modu (laptop kamerası) öneri olarak sunulur.
- Native'de soru cevaplama için ses kaydı, dikte ve laptop sayfası kullanıcı testlerinde karşılaştırılacak.
- Olay şeması platformdan bağımsız kalır (bugünkü v2 şeması: `pointerType`, `viewport`, `orientation`, `streamId`, yetenek bayrakları).

---

## 2026-11-20: Ekran referans görüntüsü soyutlaması (planlama notu)

Kaynak: PM mimari notu. Durum: planlama; tıklama haritası Nezih onayı bekliyor, sadece koordinat kaydı şimdi uygulandı.

- Tıklama haritası ve frame replay, iki sağlayıcılı bir "ekran referans görüntüsü" soyutlaması üzerine kurulacak: (a) Figma: REST API'den frame görüntüleri (üründe araştırmacı Figma OAuth ile bağlanır; pilotta PM görüntüleri kendi erişimiyle dışa aktarır); (b) canlı site: araştırmacının kurulumda yaptığı "referans gezinti", embed-sdk her `data-step` kök öğesini araştırmacının kendi tarayıcısında yakalar.
- Katılımcının cihazında asla ekran görüntüsü alınmaz.
- Koordinatlar normalize (0-1) saklanır: embed-sdk tıklamalara `nx, ny` (data-step köküne göre, yoksa görünüme göre) ekliyor. Ayrıca hedef öğenin seçicisi (`selector`) ve öğe içindeki normalize konum (`ex, ey`) kaydediliyor.
- Canlı sitede (M4 sonrası) ekran = `data-step`; durum otomatik (`role=dialog` açılması, `aria-expanded`, `aria-invalid`, URL hash) ya da açık `data-state` etiketiyle belirlenir ve Figma alias'larındaki gibi `state` olayı olur. Referans gezinti her (adım, durum) için görüntü ve öğe kutularını saklar; öğesi hiçbir referans görüntüde olmayan tıklamalar haritaya çizilmez, "görüntüsü olmayan durum" altında öğe etiketiyle listelenir. Figma tıklamaları frame koordinatında (`nearestScrollingFrameMousePosition` + kaydırma) geliyor; frame boyutu REST'ten gelen görüntüyle bilineceği için normalize işlemi o aşamada yapılacak.

---

## 2026-11-20: Ölçüm seti genişledi (rage, loop, drop-off, görev başarısı, misclick)

Kaynak: Nezih'in isteği, PM kapsamı (ürün yönetimi thread'i). Durum: uygulandı (`faz1-core`).

- **Rage click:** ekran başına sayı olarak raporda (`ScreenStats.rageClicks`, çalışma özetinde toplam).
- **Loop:** bir görevde aynı iki mantıksal ekran arasında 2+ gidip gelme (A→B→A→B = 1, A→B→A→B→A→B = 2; çakışmasız sayılır). Sürtünme girdisi (+20/loop), B ekranına (geriye doğru terk edilen ekran) yazılır; geri dönüş sayısından ayrı raporlanır (`report.loops`, `ScreenStats.loops`).
- **Misclick oranı:** tepkisiz tıklama / tüm tıklama, ekran başına (`misclickRate`).
- **Görev sonucu:** `direct` (beklenen yoldan hedefe), `indirect` (hedefe yol dışı ekranlardan geçerek), `failed` (hedefe ulaşmadan Bitirdim), `dropped` (görev bitmedi). Son ekran ve zaman kaydedilir; çalışma özetinde sonuç dağılımı ve ekran başına drop-off hunisi (`droppedHere`). Not: v1'de oturum dosyası sadece özet ekranında indirildiği için sekmesi kapanan bir oturumun dosyası oluşmuyor; drop-off'un tam ölçümü sunucuya kayıt (Supabase) gelince mümkün.
- **Görev süresi ve yönelim süresi:** görev başına raporda; çalışma özetinde medyanları.
- **Süre aşımı:** görevin ilk ekranında yönelim süresi düşülerek hesaplanır; cümle düşülmüş süreyi kullanır, yönelim ayrı satırda raporlanır (PM).
- Isı haritası ve yol (sankey) analizi frame görüntülerine bağlı, frame replay ile gelecek; o zamana kadar tıklama koordinatları doğru kaydediliyor.

---

## 2026-11-20: Çalışma düzeyinde ekranlar, beklenen yol, yönelim süresi, soru dili

Kaynak: ürün yönetimi thread'i (PM kararları, Nezih'in v2 oturumu geri bildirimi). Durum: uygulandı (`faz1-core`).

- **Çalışma düzeyinde ekranlar:** ekranlar (kart, `aliases`, `participantName`) çalışma JSON'unda bir kez, en üstte `screens` altında tanımlanabilir. Her görev `expectedPath` (beklenen ekran sırası), `targetScreen` ve isteğe bağlı `startScreen` taşır. Planlı sorular (görev, ekran) çiftine bağlıdır: görevde `probes` (ekran → soru). Aynı ekran başka bir görevde farklı bir amaca hizmet ediyorsa görevde `overrides` (ekran → `behavior`, `expectedSec`, `name`, `participantName`). Eski görev başına `screens` biçimi de kabul edilir.
- **Beklenen yol dışı:** bir görevin `expectedPath`'inde olmayan ekranlar da kendi kartlarıyla ölçülür. İlk ziyaret sürtünme eksenine eklenir (+40) ve "beklenen yolun dışındaki bu ekrana geldi" cümlesi üretir; raporda ayrıca `offPathScreens` listesi var. Yol dışı ekrandan yola dönmek "geri dönüş" sayılmaz.
- **Yönelim süresi:** görevin ilk ekranında ilk aksiyona kadar geçen süre varsayılan olarak tereddüt ve efor sapmasından çıkarılır ve raporda ayrıca `orientationSec` olarak verilir (görev metninin netliği hakkında bilgi). `excludeOrientation: false` ile kapatılabilir.
- **Soru dili:** varsayılan katalog metinleri başarı ya da anlama varsaymaz. "Ne arıyordun?" uygun; oturum sonu sorusu "Varsa, en çok zorlandığın görev hangisiydi ve neden?" oldu. Planlı sorular PM tarafından varsayımsız yeniden yazıldı (çalışma dosyasında).
- **Dikte:** uygulama içinde konuşma tanıma yok (tarayıcınınki sesi sunucuya gönderir). Cevap kutusunun altında katalogdan ipucu: "İstersen klavyenin dikte özelliğiyle konuşarak yazabilirsin."

---

## 2026-11-20: Sorun ekilmiş prototiple doğrulama; oturum sağlığı bloğu

Kaynak: ürün yönetimi thread'i, Nezih onayı ("ikisi de makul"). Durum: kararlaştırıldı; sağlık bloğu uygulandı (`faz1-core`).

1. **Sorun ekilmiş prototip M2'nin yerini alır:** mevcut prototipin 4-5 bilinen sorun eklenmiş bir kopyası, 6-8 katılımcı, başarı kriterleri önceden sabit (ayrıntılar büyüme dokümanında: https://claude.ai/artifact/9QYb36JZEaUjKqRHjiW3R6). Eski videolarla doğrulama isteğe bağlı, sadece envanter gelirse yapılır. M4 gerçek çalışma olarak kalır. Şimdilik mühendislik işi yok; prototip kopyası tasarım işi.
2. **Oturum sağlığı bloğu (pilot öncesi):** oturum dosyasının en başında `health`, sadece sayılar: fps medyanı ve p10, yüz bulunan saniye oranı, prototip olay sorunları (geçişe yol açmayan "handled" tıklamalar, tanımsız ekranlar), ısınma kalitesi (süre, tıklama sayısı, baseline geçerli mi), oturumun kaldığı adım, atlanan ve "Hatırlamıyorum" denen sorular, oturum süresi, görev başına süre ve hedefe ulaşma. Otomatik bayraklar: `low-fps` (< 10), `face-missing` (< %70), `unknown-screens`, `missing-transitions`, `baseline-invalid` (< 3 ısınma tıklaması), `not-completed`, `target-not-reached`, `many-dont-remember` (> %50). Araştırmacı raporu yazıldığında en üstte gösterilecek. Hesaplama `core/health.ts`'te (saf, testli).

---

## 2026-11-20: Repo public kalır, prototip linkleri repoya girmez

Kaynak: Nezih kararı (ürün yönetimi thread'i). Durum: uygulandı (`faz1-core`).

- Repo şimdilik public kalır, ancak gerçek prototip linkleri ve Figma dosya anahtarları repoya girmez.
- Gerçek linkler sadece gitignore'daki yerel ayarda ya da URL parametresinde durur: katılımcı uygulamasında `apps/web/src/studies/*.local.json` (yoksa yer tutucu `example.json`) ya da `?study=<url>`; spike sayfalarında `apps/spikes/.env.local` içindeki `VITE_PROTO_URL` ya da `?url=`.
- Yayınlanan sayfalar link ön doldurmaz.
- Git geçmişi yeniden yazılmaz; eski commit'lerde link hâlâ duruyor. Gerekirse Nezih linki Figma'da yeniler.

---

## 2026-11-20: Nezih'in ilk gerçek oturumundan düzeltmeler

Kaynak: Nezih'in Chrome + test Figma prototipi oturumu (kameralı, M1). Durum: uygulandı (`faz1-core`).

- Figma yolu gerçek Chrome'da `localhost:4173` üzerinde çalıştı: ekran geçişleri, tıklamalar, planlı ve sinyalli sorular, SEQ, en zor görev sorusu ve oturum JSON'u geldi.
- **Faz geçişinde kaybolan saniyeler:** yeni faz (ısınma, görev) başlarken worker'da işlenmekte olan bir kare eski saatin zamanını taşıyordu; toplayıcı yeni saniyeleri "geç kalmış" sayıp ilk 9 sn (ısınma) ve 51 sn'yi (görev) attı. Sensing artık bir faz sayacı tutuyor; eski faza ait kare atılıyor.
- **Figma tıklama konumu:** konum `data.mousePosition {x, y}` içinde geliyormuş; adaptör `x, y` okuduğu için her tıklama (0, 0) göründü ve art arda tıklama fazla sayıldı. Düzeltildi.
- **Göz kırpma:** ekrana aşağı bakarken göz kapanma skoru 0.4-0.5 civarında kaldığı için sabit 0.5/0.35 eşikleri hiç kırpma saymadı. Eşik artık kişinin son 3 sn'lik açık göz seviyesine göre: seviye + 0.3 üstüne çıkıp seviye + 0.12'ye inen bir kırpma.
- **Göz kırpma, ikinci oturum:** kırpma sayımı çalıştı (dakikada 4-20), ama aşağı bakınca skor kalıcı yükselip "kapalı" durumda takılı kaldı ve 35 sn hiç kırpma sayılmadı. 0.6 sn'den uzun "kapanma" artık bakış değişimi sayılıyor: kırpma sayılmaz, açık göz seviyesi yeniden öğrenilir.
- **Figma tıklama konumu, ikinci oturum:** `mousePosition` de gelmedi; Figma bu kurulumda tıklama konumu göndermiyor olabilir. Konum yoksa art arda tıklama "aynı hedef öğeye 1 sn içinde 3+ tıklama" olarak sayılıyor ve konum (0, 0) yazılmıyor. Oturum dosyasına her Figma mesaj tipinden ilk 3 ham örnek (`figmaRaw`, sadece kimlik ve sayılar) ekleniyor; biçim oradan kesinleşecek.
- **Görev bitişi belli olsun** (Nezih: "akış nerede bitti anlayamadım"; PM önerisi): görev tanımına isteğe bağlı `targetScreen` eklendi. Katılımcı o ekrana ulaşınca görev çubuğu ve Bitirdim düğmesi vurgulanır ve "Görev tamamlanmış görünüyor…" yazar; görev kendiliğinden bitmez (sonrasında etrafa bakmak da veri). Hedef ekran yoksa görev metninin altında "Görevi bitirdiğini düşündüğünde Bitirdim'e bas." yazar. İki metin de katalogda. Hedefe ulaşma anı `reachedTargetAt` olarak kaydedilir.
- **Görev başlangıç ekranı (PM, seçenek b):** görev tanımına isteğe bağlı `startScreen` (Figma node id) eklendi; prototip o görevde bu akış başlangıcından açılır (`node-id` ve `starting-point-node-id`). Yoksa linkin kendi başlangıcı kullanılır. Hangi başlangıcın kullanılacağını Nezih seçer.
- **Ekran durumları (aliases, PM):** Figma'da aynı ekranın her durumu ayrı bir node. Çalışma JSON'unda ekrana isteğe bağlı `aliases` (durum node'ları) eklendi. `core` bunları ana anahtarla aynı mantıksal ekran sayar: Figma adaptörü ve rapor durum değişimini yeni `state` olayı olarak yazar; ziyaret bölünmez, geri dönüş ve geçiş sorusu sadece mantıksal ekran değişince sayılır. `targetScreen` bir alias olabilir (örneğin "hepsi açık" durumu); hedefe ulaşma ham node ile kontrol edilir.
- **Soru katmanı (Nezih'in pilot geri bildirimi):** soru sorulurken arkadaki prototip zaten bir sonraki ekranı gösteriyor ve önceki ekranla ilgili cevabı etkiliyordu. Katman artık neredeyse opak ve bulanık.
- **Soru tekrarı (PM):** planlı soru bir ekran için oturumda bir kez sorulur. Sinyalle tetiklenen soru ise görev bazında tekrar edilmez (ekran + sapma türü): aynı ekran başka bir görevde farklı bir amaca hizmet ettiği için oradaki sürtünme ayrı bir bulgudur. 2/6 sınırları değişmedi.
- **Ağ kanıtı:** oturum dosyasına sayfanın yaptığı tüm isteklerin özeti (`network`: köken, tür, sayı) eklendi. PM'in istediği DevTools Network kaydıyla birlikte "kare ya da ses cihazdan çıkmaz" kriterinin kanıtı olacak.
- **Figma tıklama konumu, üçüncü oturum (kesinleşti):** konum `data.nearestScrollingFrameMousePosition` (+ `nearestScrollingFrameOffset`) içinde geliyor; ayrıca `targetNodeMousePosition` var. Çerçeve dışına yapılan tıklamalarda bu alanlar `null`; o durumda hedef öğe kuralı geçerli.
- **Ağ kanıtı (v1 kabulü, kamerasız oturum, HAR):** katılımcı uygulamasının kendisi sadece 3 istek yaptı (`localhost` üzerindeki sayfa, JS ve CSS; hepsi GET). Diğer 360 istek Figma iframe'inden: Figma'nın kendi sunucuları ve Figma'nın kullandığı analiz servisleri (Datadog, LaunchDarkly, Statsig, Sentry). Kodda `fetch` sadece `?study=` ile çalışma dosyası okumak için var; `sendBeacon`, XHR ya da WebSocket yok. Bu kamerasız yarıyı kapatır; kamera ve mikrofon açık bir oturumun HAR'ı da bekleniyor. Figma kendi kullanım verisini topladığı için onay ekranına PM'in istediği cümle eklendi (`consent.thirdParty`, sadece Figma kaynaklı çalışmalarda gösterilir).
- **Görev saati prototip hazır olunca başlar:** Figma'nın ilk ekranı yaklaşık 25 sn'de geldi; bu süre ölçüme girmesin diye görev saati ilk ekran olayında sıfırlanır.
- **Isınma:** okuma ekranı ilk aksiyon süresi hesabından çıkarıldı; sadece 4 tıklama ekranı sayılır.

---

## 2026-11-20: Katılımcı akışı v1 kapsamı

Kaynak: ürün yönetimi thread'i (Nezih onayı, kapsam dışı listesine 👍) ve Claude Code. Durum: kararlaştırıldı, v1 `faz1-core`'da uygulandı (`apps/web`).

### Kapsam (M3a: Chrome/Edge, masaüstü, Figma ya da script'li demo, çalışma JSON'u)
1. Karşılama + görev özeti; tüm metinler katalogdan.
2. Onay: kamera isteğe bağlı; çalışmada `faceSignals` açıksa yüz sinyalleri için ayrı onay; mikrofon (ses kaydedilmez); ne saklanır, ne saklanmaz.
3. İzin + kalite kontrolü: 3 sn ısınma + 5 sn ölçüm; medyan < 10 fps ya da yüz yoksa kamerasız mod (kamera hemen bırakılır). Işık ve ortam gürültüsü ipucu.
4. 30 sn ısınma: nötr okuma metni (78 kelime, katalogda `warmup.text`, PM onayladı); hızlı okuyan ısınmayı kısaltmasın diye Devam 26 sn'den sonra açılır. Ardından her biri ekranın farklı bir yerinde tek düğme olan 4 tıklama ekranı (ilk aksiyon süresi baseline'ı için; PM en az 3, her birinde farklı konum istedi).
5. Her görev: beklenti puanı → prototip + görev metni + "Bitirdim" → ekran geçişinde soru (önce planlı `probe`, sonra sinyalle tetiklenen; görev başına en fazla 2, oturum başına 6; soru sırasında oturum saati durur) → SEQ.
6. Soru metni ekranı adıyla bağlam verir: "Az önceki '{ekran}' ekranında…" (katalogda `probe.atTransition`). Ad, çalışma JSON'undaki ekranın isteğe bağlı `participantName` alanından gelir; Figma frame adı ("Frame 23", "Checkout_v2_final") katılımcıya asla gösterilmez. `participantName` yoksa ekran adı geçmez: "Az önceki ekranda ne düşünüyordun, ne arıyordun?" (`probe.atTransitionNoName`). Cevap yazılı, "Hatırlamıyorum" ve "Geç" var. Soru arayüzünde M3b AI takip soruları için kanca bırakıldı.
7. Oturum sonu: "en çok zorlandığın görev" sorusu, katılımcıya kendi verisinin özeti (davranış sayısı gösterilmez), oturumu silme, oturum JSON'unu indirme (`hx-session/1`, `core` raporunu içerir).

### Kapsam dışı (v2 / M3b)
- Ekran kaydı (`getDisplayMedia`) yok.
- Frame replay ve AI takip soruları v2'de (M3b).
- İlk pilotlarda Supabase yok; oturum JSON'u indirilir.
- Sesli cevap yok, sadece yazılı.

### Kabul kriterleri (iki kademe)
- **v1 "bitti":** Nezih test Figma prototipiyle Chrome'da tam bir oturumu bir kez kameralı, bir kez kamerasız tamamlar; indirilen oturum JSON'u `core`'dan geçip sapmalı bir rapor verir; sadece saniyelik sayılar ve olaylar saklanır; kare ya da ses cihazdan çıkmaz.
- **M3 pilot kapısı (5 katılımcılı çalışmadan önce):** 2 iç pilot oturum yardımsız uçtan uca, her biri ≤ 20 dk; kamerasız yol uçtan uca (kamera reddi, düşük fps); ağ sekmesinde kare ya da ses yok; tüm katılımcı metinleri katalogdan ve katılımcı sayı görmüyor; soru sınırları ve saat durması test edilmiş; eski Intel Mac'te ≥ 10 fps ya da kamerasız moda düşüş; soru cevaplarının ≥ %75'i anlamlı ("Hatırlamıyorum" değil). Video olmadığı için 200 ms senkron kriteri kaldırıldı.

### Uygulama notları
- Uçtan uca deneme (headless Chrome, sahte kamera, script'li yerel prototip + embed-sdk): kameralı seçimde sahte kamerada yüz olmadığı için kamerasız moda düşüş, kamerasız seçim, iki geçiş sorusu (planlı + sinyalli), soru sınırı, SEQ ve özet doğrulandı. Gerçek yüzle kameralı yol Nezih'in denemesinde doğrulanacak.
- Headless Chrome'da Figma embed bir "interstitial" sayfası gösterdi ve olay gelmedi; Faz 0'da gerçek Chrome'da `localhost:4173` üzerinde çalışmıştı. Bu yüzden `npm run web` önizlemesi 4173 portunu kullanır (spike önizlemesiyle aynı anda çalıştırılmaz).

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
- VAD gürültü tabanı artık son 3 sn'nin en sessiz karesi (minimum istatistiği). Eski uyarlanan taban, yakında video çalarken videonun ses seviyesine tırmanıyor ve katılımcının kendi konuşmasını da kaçırıyordu. VAD sadece "ses var mı" der; kimin sesi olduğuna ses-dudak uyumu karar verir.
- İlk etiketli kalibrasyon (Nezih, 20 Kasım, M1): ham veride net konuşma saniyelerinde uyum 0.30-0.85, video açıkken sessiz dudak oynatmada -0.25 ile 0.27 arası; 0.3 eşiği korunuyor. Yeni VAD ile aynı kayıt yeniden oynatıldığında sessiz dudak hareketinin 9 saniyesinden 1'i konuşma sayıldı.
- Kalibrasyon için deneme sayfası (`apps/spikes/sensing.html`) kare kare dudak aralığı ve ses yüksekliğini indirir; Nezih'in izniyle isteğe bağlı olarak ses dosyasını da (ayrı .webm, yerel indirme) kaydeder. Bu sadece deneme sayfası içindir; ürün akışında görev sırasında ses kaydedilmez.
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
