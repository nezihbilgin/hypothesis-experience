# Hypothesis & Real Experience (çalışma adı)

Tasarımcının ekran bazlı hipotezini katılımcının gerçek davranışıyla karşılaştıran self-moderated usability test aracı.
Tasarım kararları: [docs/HANDOFF-hypothesis-experience.md](./docs/HANDOFF-hypothesis-experience.md). Faz 0 durumu: [FAZ0-RAPOR.md](./FAZ0-RAPOR.md).

```
packages/core/   Saf, deterministik model (Vitest). Senti felt.ts'ten port edildi.
  src/engine.ts      baseline yüzdelik, runs, impulse+EMA eğrisi, aynı tür birleştirme
  src/screens.ts     ekran pencereli model: iki eksen (efor, sürtünme), 4 sapma tipi, Türkçe rapor cümleleri
  src/questions.ts   ekran geçişinde soru seçimi (planlı + sinyalle), görev sonu kısa retro
  src/texts.ts       katılımcı metin kataloğu (TR varsayılan) ve düzenlenebilir puan ölçekleri
  src/study.ts       çalışma tanımı JSON'u ve doğrulama (örnek: test/fixtures/study.example.json)
  src/adapters/figma.ts  Figma Embed mesajları -> interaction_event
  src/signals.ts     rage click tespiti (Figma ve embed-sdk ortak)
  src/quality.ts     kamera kalite kontrolü kararı (fps, yüz, ışık ipucu)
  src/aggregate.ts   görev bazında özet (ekran başına sapma sayısı, beklenen/yaşanan zorluk)
  src/compat/        Senti uyumluluk modeli (sadece regresyon testi için)
  test/              regresyon (docs/evidence), Senti'nin birim testleri, ekran modeli testleri
apps/spikes/     Faz 0 tarayıcı spike'ları (Vite, çok sayfalı)
```

## Çalıştırma

Node 20+ gerekir.

```bash
npm install
npm test            # core testleri
npm run spikes      # spike sayfalarını derler ve http://localhost:4173 adresinde açar
```

Kamera ve ekran kaydı güvenli bağlam ister: `localhost` ya da `https`. Başka bir bilgisayardan (eski laptop) test için
sayfaların https üzerinden yayınlanması gerekir (GitHub Pages önerilir).

Lisans notu: `packages/core/src/compat/`, `engine.ts` ve `test/senti-ref/` Senti'den (MIT, Techkeyy) uyarlanmıştır; lisans metni `packages/core/test/senti-ref/LICENSE-senti`.
