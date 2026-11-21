# Katılımcı cihazında iz denetimi (20 Kasım 2026)

Kapsam: `apps/web`, `packages/sensing`, `packages/core`, `packages/embed-sdk` (faz1-core, 27929d6).
Gereksinim (Nezih): oturumdan sonra katılımcının bilgisayarında aracımızın yüzünden video, kare, görüntü ya da ses kalmamalı.

## Yöntem

1. Kod taraması: MediaRecorder, Blob/object URL, canvas/ImageData, localStorage, sessionStorage, IndexedDB,
   Cache API, service worker, OPFS, indirme, konsol, ağ çağrıları, track kapatma, worker transferleri.
2. Tarayıcı denemesi (Playwright Chromium, sahte kamera + mikrofon, `?debug=1`): kamera açık oturum
   (kalite + ısınma + görev), sonra depolama ve track durumu kontrolü.

Deneme sonucu: localStorage 0, sessionStorage 0, IndexedDB yok, Cache API yok, service worker yok, OPFS boş,
cookie yok, `navigator.storage.estimate().usage = 0`. Kamera/mikrofon track'leri görev sırasında `live`,
`stopSensing()` sonrası `ended`. Kalite kontrolü kamerasız moda düşünce track'ler hemen `ended`.
Ağ: sadece kendi origin'imize GET (sayfa, JS, MediaPipe wasm/model). Oturum JSON'unda 200 karakterden uzun
string yok; `samples` yalnız sayı.

## Bulgular

| # | Önem | Bulgu | Durum |
|---|------|-------|-------|
| 1 | Orta | İndirilen oturum JSON'u katılımcının İndirilenler klasöründe kalır. Video/ses yok ama yazılı cevaplar, davranış olayları, cihaz bilgisi ve katılımcı etiketi içerir. Sayfa bu dosyayı silemez. | v1 tasarımı gereği (JSON indirme). Silme ekranı artık dosyayı elle silmesini söylüyor. Kalıcı çözüm: v2'de doğrudan yükleme, indirme yok. |
| 2 | Orta | "Oturumumu sil" sadece görevleri, ısınmayı ve son soruyu temizliyordu; onay, kalite, baseline, `figmaRaw`, sorulan soru kayıtları, `window.__hxRun` bellekte kalıyordu; metin "tarayıcıdan silindi" diyordu. | Düzeltildi: `SessionRun.wipe()` her şeyi sıfırlar, kamerayı kapatır; metin indirilen dosyayı da söyler. |
| 3 | Düşük | Sekme kapanınca/başka sayfaya gidilince kamera ve mikrofonu bırakan kod yoktu (tarayıcı unload'da bırakır, ama back/forward cache'teki sayfa tutabilir). Oturum yarıda bırakılırsa kamera son göreve kadar açık kalır. | Düzeltildi: `pagehide` ile `stopSensing()`. |
| 4 | Düşük | İndirme blob URL'si hiç revoke edilmiyordu (sekme açık kaldıkça bellekte JSON kopyası). | Düzeltildi: `downloadJson()` tıklamadan sonra revoke eder. |
| 5 | Düşük | `stop()` sırasında yolda olan bir kare (ImageBitmap) kapatılmadan GC'ye kalıyordu; `video.srcObject` boşaltılmıyordu. | Düzeltildi. |
| 6 | Düşük | Tarayıcının kamera izni origin için kalabilir ("bu siteyi ziyaret ederken izin ver"). Web sayfası izni geri alamaz. | Öneri: onay ekranında "Bu seferlik izin ver" seçeneğini önermek. |
| 7 | Düşük | URL'deki `?p=<etiket>` ve `?study=<url>` tarayıcı geçmişine düşer; etiket isim olursa iz kalır. | Öneri: etiketi anonim kod olarak üretmek (isim değil). |
| 8 | Düşük | `figmaRaw` Figma'nın ham mesajlarını tip başına ilk 3 adet olarak saklar (id ve koordinat; görüntü yok). | Öneri: format doğrulandıktan sonra kaldırmak ya da alan bazlı izin listesine çevirmek. |
| 9 | Bilgi | Figma gömmesi kendi çerez/depolamasını `embed.figma.com` altında tutabilir; bizim kontrolümüzde değil. Onay metni bunu söylüyor. | – |
| 10 | Bilgi | Spike sayfaları aynı Pages origin'inde localStorage kullanır ve `sensing.html` isteğe bağlı kalibrasyon sesi kaydedip indirir (MediaRecorder). Katılımcı uygulaması bu sayfaları içermez. | Öneri: katılımcı uygulaması yayınlanınca spike'lardan ayrı origin/yol; kalibrasyon sayfası katılımcıya gönderilmez. |
| 11 | Bilgi | MediaPipe wasm/model ve JS tarayıcının HTTP önbelleğinde kalır (kişisel veri değil). | – |

## Temiz bulunanlar

- Katılımcı uygulamasında MediaRecorder, localStorage/sessionStorage/IndexedDB/Cache/OPFS/service worker yok.
- Worker kareyi `bitmap.close()` ile kapatır, sadece sayı döner. Ana thread'e piksel dönmez.
- Parlaklık ölçümü 32×24 geçici canvas; saklanmaz, dışarı çıkmaz.
- Ses analizcisi hedefe bağlı değil; ses çalınmaz, kaydedilmez. AudioContext `stop()`'ta kapanır.
- Konsola kare/ses yazılmaz (`onError` ve `onRaw` ürün akışında bağlı değil).
- Embed SDK form değerlerini okumaz, sadece uzunluk farkı; mesajlar sadece `parentOrigin`'e gider.


## Ek: kamera ve mikrofon açık oturumda ağ kontrolü (21 Kasım 2026)

v1 kabulünün son maddesi ("kamera kareleri ya da ses cihazdan çıkmaz", ağ trafiği üzerinden). Nezih'in kamerasız oturumunun HAR kaydı (20 Kasım) kamerasız yarıyı kapatmıştı; bu ek kameralı yarıyı kapatır.

Yöntem: headless Chrome, sahte kamera ve mikrofon (`--use-fake-device-for-media-stream`, `--use-fake-ui-for-media-stream`), Chrome DevTools Protocol ile tüm ağ istekleri (sayfa, iframe ve MediaPipe worker'ı dahil; WebSocket oluşturma da izlendi). Tam oturum: onay (kamera + mikrofon + yüz sinyali), kalite kontrolü, 30 sn ısınma, görev (yerel script'li prototip + embed-sdk, bir geçiş sorusu), SEQ, oturum sonu, özet, oturum dosyasını indirme. Sahte kamerada yüz olmadığı için kalite kontrolü normalde kamerasız moda düşer; bu kontrol için sadece `?debug=1&keepCamera=1` ile çalışan bir test kancası kamerayı oturum boyunca açık tuttu (worker 30 ısınma + 11 görev saniyesi üretti).

Sonuç (kameralı / kamerasız):

| Kaynak | Kameralı + mikrofonlu | Kamerasız |
|---|---|---|
| Uygulama sayfası | GET: sayfa, JS (3), CSS, favicon, çalışma dosyası (`data:` URL) | GET: sayfa, JS (2), CSS, favicon, çalışma dosyası |
| MediaPipe worker | GET: worker script, `vision_wasm_module_internal.js`, `.wasm`, `face_landmarker.task` (hepsi kendi origin'imiz) | – |
| Prototip iframe'i | GET: prototip sayfası, `hx-embed.js` | aynı |
| GET dışı istek (POST vb.) | yok | yok |
| Gövdesi olan istek | yok | yok |
| WebSocket | yok | yok |

Kameralı oturumdaki tek fark, model ve wasm dosyalarının kendi origin'imizden indirilmesi. Görüntü ya da ses içeren, ya da herhangi bir veri gönderen istek yok. Figma kaynaklı çalışmalarda Figma iframe'inin kendi istekleri (Figma sunucuları ve Figma'nın analiz servisleri) ayrıca vardır; 20 Kasım HAR'ında listelendi ve onay ekranı bunu söylüyor (`consent.thirdParty`).
