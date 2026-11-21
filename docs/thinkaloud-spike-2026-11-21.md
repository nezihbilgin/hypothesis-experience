# Think-aloud denemesi (M1, 21 Kasım 2026)

Amaç: sesi cihazda, tarayıcıda metne çevirmek (Whisper, transformers.js + onnxruntime-web) ve pilot için üç ölçütü sınamak: kamera açıkken fps alt sınırın altına düşmüyor mu, Türkçe metin kullanılabilir mi, ses cihazdan hiç çıkmıyor mu.

Deneme sayfası: `apps/spikes/thinkaloud.html` (`HX_ISOLATE=1 npx vite --port 5190` ile, çok iş parçacıklı wasm için). Model ve çalışma dosyaları yerel ve gitignore'da (`apps/spikes/public/models.local/`, `vendor.local/`).

## Koşullar

- MacBook Air M1, Chrome (headless), sahte kamera. Otomatik tarayıcıda **WebGPU yoktu**, bütün ölçümler **CPU (WASM, çok iş parçacıklı)** ile. Gerçek Chrome'da WebGPU ile daha hızlı olması beklenir; bu ölçülmedi.
- Ses: macOS'un Türkçe sentetik sesiyle (Yelda) okunmuş 75 sn'lik bir think-aloud metni; içinde uydurma isim, telefon ve adres var. Gerçek konuşma (aksan, duraksama, arka plan sesi) daha zor olur; Nezih'in 10 dk'lık kaydı gelince tekrar ölçülecek.

## Sonuçlar

| Model | İndirme boyutu | Toplu çevirme (75 sn ses, CPU) | Gerçek zamana oranı | Türkçe metin |
|---|---|---|---|---|
| whisper-base | 168 MB | 14 sn | 0,19 | Okunur ama hatalı: "karma" → "kalma", "Ayşe Yılmaz" → "Aşeyilmaz", bazı cümlelerin anlamı kayıyor |
| whisper-small | 402 MB | 56 sn | 0,74 | İyi: birkaç kelime hatası ("giyim" → "geyim", marka adı bozuk), anlam korunuyor |
| whisper-large-v3-turbo | 561 MB | 238 sn | 3,1 | Kelimeler en doğru ama iki yerde cümleleri tekrar etti; CPU'da çok yavaş |

Model yükleme (önbellekten değil, yerel sunucudan): 2-4 sn.

**Canlı mod (10 sn'lik parçalar, gerçek zaman hızında), kamera analizi açık:**
- whisper-base: her parçanın metni parça bittikten 1,6-2,2 sn sonra hazır. Ana iş parçacığı 60 fps, kamera analizi medyan 15 fps, en düşük 11 fps (alt sınır 10).
- whisper-small: kamera açıkken otomatik tarayıcıda model yüklenmedi (takıldı); kamerasız parça başına ~7,4 sn işlem. Kamera açıkken ölçülemedi.

**Ses cihazdan çıkıyor mu:** hiçbir ölçümde sayfanın kendi adresi dışında istek yok (CDN'den wasm çekme kapatıldı, uzaktan model indirme kapalı). Sonrasında tarayıcıda localStorage, IndexedDB ve Cache Storage boş. Ses bellekte tutuluyor; çevirmenin hemen ardından işçideki kopya sıfırlanıyor, sayfadaki kopya ya işçiye devrediliyor ya da sıfırlanıyor. Not: işçinin kendi istekleri ağ kaydında ayrıca izlenmedi; gerçek Chrome'da Network sekmesiyle bir kez bakılmalı.

**Maskeleme:** metinlerde isim ve telefon yakalandı; ilk denemede küçük harfle yazılmış adres ("Kadıköy moda caddesi") ve tireli telefon ("05-132-123-45-67") kaçtı, düzeltildi ve testlere eklendi.

## Üç ölçüt

1. **Kamera açıkken fps:** whisper-base ile **geçti** (kamera analizi en düşük 11 fps, ana iş parçacığı 60). whisper-small ile **ölçülemedi**.
2. **Türkçe metin kalitesi:** whisper-small ile **kullanılabilir**, whisper-base ile sınırda. Sentetik sesle ölçüldü; gerçek kayıtla doğrulanmalı.
3. **Ses cihazdan çıkmıyor:** **geçti** (dış istek yok, kalıcı depolama yok); gerçek Chrome'da işçi istekleri bir kez kontrol edilmeli.

## Öneri

- Pilot (Nezih'in Mac'inde, yüz yüze, localhost): whisper-small, **canlı mod** (10 sn'lik parçalar, arka planda). Oturum sonunda toplu çevirme 10 dakikalık bir oturumda CPU'da ~7,5 dk bekletir; bu yüzden toplu mod uygun değil.
- Karar öncesi tek eksik: gerçek Chrome'da (WebGPU) whisper-small + kamera birlikte. WebGPU'da daha hızlı olması ve kamera analiziyle çakışmaması bekleniyor. Bu da olmazsa whisper-base canlı mod yedek (metin daha hatalı).
- Katılımcının kendi cihazında yapılacak çalışmalar için 400 MB model indirmesi ayrı bir sorun; pilot kapsamında değil.
