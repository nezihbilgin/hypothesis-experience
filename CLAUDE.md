# CLAUDE.md

Hypothesis & Real Experience: tasarımcının ekran bazlı hipotezini katılımcının gerçek davranışıyla karşılaştıran,
tarayıcıda çalışan self-moderated usability test aracı. Sahibi Nezih; Türkçe yazışır.

Önce oku:
- `docs/decisions.md`: tarihli kararlar, en yenisi en üstte. Handoff ile çelişirse bu dosya geçerli. Her oturumun başında oku.
- `docs/HANDOFF-hypothesis-experience.md`: ilkeler, veri modeli, sinyaller, fazlar.
- `FAZ0-RAPOR.md`: Faz 0 sonuçları ve Faz 1'e taşınan kararlar (bölüm "Faz 1'e taşınan kararlar").

Planı ya da mimariyi değiştiren her kararı `docs/decisions.md` dosyasına tarihli bir giriş olarak ekle (en üste). Planlama sohbeti de aynı dosyaya yazıyor.

Durum (20 Kasım 2026): Faz 1 sürüyor. `faz1-core` branch'inde `core` 20 Kasım kararlarına uyarlandı: iki eksen (efor, sürtünme),
`effort-mismatch`, yüz sinyalleri çalışma ayarına bağlı, ekran geçişinde soru motoru, metin kataloğu ve düzenlenebilir ölçekler.
`sensing` paketi de hazır (worker, saniye toplayıcı, göz kırpma, VAD, kalite ölçümü; deneme sayfası `apps/spikes/sensing.html`).
`embed-sdk` hazır (tek dosyalık script, mobile hazır olay şeması v2). Katılımcı akışı v1 `apps/web`'de (decisions "Katılımcı akışı v1 kapsamı").
Sıradaki: Nezih'in gerçek Chrome + test Figma prototipiyle v1 kabul denemesi, sonra M3 pilot kapısı.

Kurallar:
- İlke 1: raporda ve kodda duygu/niyet çıkarımı yok, sadece gözlemlenen davranış. Duygu/ifade sınıflandırma skoru kullanılmaz; ham kas hareketi blendshape'leri (göz kırpma, kaş) sadece destekleyici sinyal olarak kullanılabilir (decisions 2026-11-20).
- İlke 2: eşikler katılımcının ısınma görevinden öğrenilen kendi baseline'ına göre (`max(floor, 2 × p95)`).
- İlke 3: kamera kareleri cihazdan çıkmaz; sunucuya sadece saniyelik sayılar gider.
- `packages/core` saf ve deterministik kalır; her değişiklik Vitest testiyle gelir.
- `packages/core/src/compat/` ve `test/senti-ref/` sadece Senti regresyon testi içindir; ürün modeli `src/screens.ts`.

Komutlar:
- `npm install`
- `npm test` (core, sensing ve embed-sdk testleri), `npm run typecheck`, `npm run embed` (embed-sdk'yı `packages/embed-sdk/dist/hx-embed.js` olarak derler)
- `npm run web` (katılımcı uygulaması: build + preview, http://localhost:4173; `?study=<url>`, `?local=<ad>`, `?p=<etiket>`; araştırmacı raporu http://localhost:4173/report.html), `npm run web:dev` (:5180)
- `npm run spikes:dev` (spike sayfaları, http://localhost:5173), `npm run spikes` (build + preview, :4173)

Yayın: `main`'e push edilince GitHub Actions test eder ve `apps/spikes`'ı https://nezihbilgin.github.io/hypothesis-experience/ adresine yayınlar.
Figma Embed client-id (açık bilgi) `apps/spikes/src/env.js` içinde.
