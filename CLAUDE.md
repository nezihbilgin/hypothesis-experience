# CLAUDE.md

Hypothesis & Real Experience: tasarımcının ekran bazlı hipotezini katılımcının gerçek davranışıyla karşılaştıran,
tarayıcıda çalışan self-moderated usability test aracı. Sahibi Nezih; Türkçe yazışır.

Önce oku:
- `docs/HANDOFF-hypothesis-experience.md`: ilkeler, veri modeli, sinyaller, fazlar. Kaynak doğruluk burası.
- `FAZ0-RAPOR.md`: Faz 0 sonuçları ve Faz 1'e taşınan kararlar (bölüm "Faz 1'e taşınan kararlar").

Durum (19 Kasım 2026): Faz 0 kapandı. Sıradaki iş Faz 1, `core` ve `sensing` paketleriyle başlıyor.

Kurallar:
- İlke 1: raporda ve kodda duygu/niyet çıkarımı yok, sadece gözlemlenen davranış. Yüz ifadesi skoru kullanılmaz.
- İlke 2: eşikler katılımcının ısınma görevinden öğrenilen kendi baseline'ına göre (`max(floor, 2 × p95)`).
- İlke 3: kamera kareleri cihazdan çıkmaz; sunucuya sadece saniyelik sayılar gider.
- `packages/core` saf ve deterministik kalır; her değişiklik Vitest testiyle gelir.
- `packages/core/src/compat/` ve `test/senti-ref/` sadece Senti regresyon testi içindir; ürün modeli `src/screens.ts`.

Komutlar:
- `npm install`
- `npm test` (core testleri), `npm run typecheck`
- `npm run spikes:dev` (spike sayfaları, http://localhost:5173), `npm run spikes` (build + preview, :4173)

Yayın: `main`'e push edilince GitHub Actions test eder ve `apps/spikes`'ı https://nezihbilgin.github.io/hypothesis-experience/ adresine yayınlar.
Figma Embed client-id (açık bilgi) `apps/spikes/src/env.js` içinde.
