// Participant-facing text catalog and rating scales (decisions 2026-11-20, "metinler ve ölçekler").
// MVP: every participant-facing string lives here as key -> text (default Turkish); the app never hard-codes copy.
// Post-MVP the researcher edits texts and adds languages; a study can already override keys via `texts`.
// Researcher-facing report sentences (screens.ts describe) are separate and never shown to participants.

export const DEFAULT_LOCALE = 'tr'

export const TEXTS_TR = {
  'welcome.title': 'Merhaba, katıldığın için teşekkürler',
  'welcome.body': 'Birkaç kısa görevde bir prototipi kullanacaksın. Doğru ya da yanlış bir yol yok; test edilen sen değil, tasarım.',
  'welcome.tasks': 'Görevler',
  'welcome.start': 'Başlayalım',
  'consent.title': 'Başlamadan önce',
  'consent.stored': 'Saklananlar: tıklamaların, ekran geçişlerin, verdiğin puanlar ve yazdığın cevaplar.',
  'consent.notStored': 'Saklanmayanlar: kamera görüntüsü ve ses. Kamera açıksa görüntü sadece bu tarayıcıda işlenir; dışarı yalnızca saniyelik sayılar çıkar.',
  'consent.thirdParty': 'Prototip Figma\'dan yüklenir ve Figma kendi kullanım verilerini toplayabilir. Kamera görüntün ne Figma\'ya ne bize gider.',
  'consent.camera': 'Kamera isteğe bağlı. Görüntü cihazından çıkmaz; sadece saniyelik sayılar kaydedilir.',
  'consent.cameraOption': 'Kamerayı kullanmayı kabul ediyorum',
  'consent.microphoneOption': 'Mikrofonu kullanmayı kabul ediyorum (ses kaydedilmez, sadece konuşup konuşmadığın sayılır)',
  'consent.faceSignals': 'Göz kırpma ve baş hareketi gibi yüz sinyallerinin sayı olarak kullanılmasına izin veriyorum.',
  'consent.accept': 'Kabul ediyorum, devam et',
  'check.title': 'Kamera kontrolü',
  'check.running': 'Kameranı hazırlıyoruz, birkaç saniye ekrana bakman yeterli.',
  'check.ok': 'Her şey hazır.',
  'check.cameraOff': 'Kamera olmadan devam ediyoruz. Bu tamamen normal, test aynı şekilde çalışır.',
  'check.hintDark': 'İpucu: ortam biraz karanlık görünüyor, yüzünü aydınlatan bir ışık yardımcı olur.',
  'check.hintNoise': 'İpucu: ortamda ses var gibi görünüyor, mümkünse sessiz bir yere geç.',
  'warmup.intro': 'Başlamadan önce kısa bir not:',
  'warmup.welcome': 'Bu çalışmayla bize yardım ediyorsun. Test ettiğimiz şey tasarım, sen değilsin. Beğenmediğin ya da sorunlu gördüğün yerleri açıkça söyle, alınmayız.',
  'warmup.s1': 'Bu çalışmayla bize yardım ediyorsun, teşekkürler.',
  'warmup.s2': 'Test ettiğimiz şey tasarım, sen değilsin.',
  'warmup.s3': 'Beğenmediğin ya da sorunlu gördüğün yerleri açıkça söyle.',
  'warmup.s4': 'Alınmayız; her yorum tasarımı iyileştirmemize yardım eder.',
  'warmup.ok': 'Tamam',
  'warmup.done': 'Isınma bitti, görevlere geçebiliriz.',
  'task.intro': 'Görev {index} / {total}',
  'task.start': 'Göreve başla',
  'task.done': 'Bitirdim',
  'comment.add': 'Yorum ekle',
  'comment.pick': 'Yorumunun ilgili olduğu yere tıkla.',
  'comment.prompt': 'Bu nokta hakkında ne söylemek istersin?',
  'comment.save': 'Kaydet',
  'common.cancel': 'Vazgeç',
  'context.title': 'Başlamadan önce birkaç kısa soru',
  'fivesec.intro': 'Şimdi bir ekranı birkaç saniyeliğine göstereceğiz. Sadece bak, bir şeye tıklaman gerekmiyor.',
  'fivesec.start': 'Göster',
  'fivesec.after': 'Ekran kapandı. Hatırladığın kadarıyla cevapla.',
  'task.doneHint': "Görevi bitirdiğini düşündüğünde Bitirdim'e bas.",
  'task.reachedHint': "Görev tamamlanmış görünüyor. Hazır olduğunda Bitirdim'e bas.",
  'task.loading': 'Prototip yükleniyor…',
  'task.blocked': 'Prototip açılamadı. Lütfen araştırmacıya haber ver.',
  'rating.expectation': 'Bu görevin ne kadar kolay ya da zor olacağını düşünüyorsun?',
  'rating.seq': 'Bu görev genel olarak ne kadar kolay ya da zordu?',
  'probe.default': 'Bu ekranda ne düşünüyordun, ne arıyordun?',
  'probe.atTransition': "Az önceki '{screen}' ekranında ne düşünüyordun, ne arıyordun?",
  'probe.atTransitionNoName': 'Az önceki ekranda ne düşünüyordun, ne arıyordun?',
  'probe.planned': "Az önceki '{screen}' ekranıyla ilgili kısa bir soru:",
  'probe.plannedNoName': 'Az önceki ekranla ilgili kısa bir soru:',
  'probe.dontRemember': 'Hatırlamıyorum',
  'probe.placeholder': 'Aklına geleni yazabilirsin',
  'probe.dictationHint': 'İstersen klavyenin dikte özelliğiyle konuşarak yazabilirsin.',
  'probe.send': 'Gönder',
  'retro.intro': 'Görevden birkaç ana kısaca dönelim.',
  'session.hardestTask': 'Varsa, en çok zorlandığın görev hangisiydi ve neden?',
  'session.summary': 'Teşekkürler! Kendi verinin özetini aşağıda görebilirsin.',
  'session.summaryCamera': 'Kamera kullanıldı mı',
  'session.summaryAnswers': 'Yazdığın cevaplar',
  'session.summaryRatings': 'Verdiğin puanlar',
  'session.download': 'Oturum dosyasını indir',
  'session.delete': 'Oturumumu sil',
  'session.deleteConfirm': 'Oturumundaki tüm veriler bu sekmeden silinecek ve kamera kapanacak. Emin misin?',
  'session.deleted': 'Oturumun bu sekmeden silindi. Dosyayı indirdiysen İndirilenler klasöründen de sil. Bu sekmeyi kapatabilirsin.',
  'common.yes': 'Evet',
  'common.no': 'Hayır',
  'common.next': 'Devam',
  'common.skip': 'Geç',
  'scale.veryHard': 'Çok zor',
  'scale.veryEasy': 'Çok kolay'
} as const

export type TextKey = keyof typeof TEXTS_TR
export type TextCatalog = Record<TextKey, string>

/** Catalog for a study: defaults overlaid with the study's overrides (unknown keys ignored). */
export function buildCatalog(overrides: Partial<Record<string, string>> = {}): TextCatalog {
  const out = { ...TEXTS_TR } as TextCatalog
  for (const [k, v] of Object.entries(overrides)) if (k in out && typeof v === 'string' && v.trim()) out[k as TextKey] = v
  return out
}

/** Text with {placeholders} filled; a missing variable stays visible as {name}. */
export function text(catalog: TextCatalog, key: TextKey, vars: Record<string, string | number> = {}): string {
  return catalog[key].replace(/\{(\w+)\}/g, (all, name: string) => (name in vars ? String(vars[name]) : all))
}

// ---- Rating scales --------------------------------------------------------------------------------------
export interface RatingScale {
  min: number
  max: number
  /** Labels by scale value; any subset (usually the ends). Text, not keys: the researcher writes them. */
  labels: Record<number, string>
}

/** Default 1-7 (SEQ), ends labelled from the catalog. Code must never assume 7. */
export const defaultScale = (catalog: TextCatalog = TEXTS_TR): RatingScale => ({ min: 1, max: 7, labels: { 1: catalog['scale.veryHard'], 7: catalog['scale.veryEasy'] } })

export function validateScale(s: unknown, label: string): string[] {
  const o = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>
  const errors: string[] = []
  const int = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)
  if (!int(o.min) || !int(o.max) || o.min >= o.max) errors.push(`${label}: min ve max tam sayı olmalı, min < max.`)
  else if (o.max - o.min > 10) errors.push(`${label}: en fazla 11 seçenek olabilir.`)
  if (o.labels !== undefined) {
    if (!o.labels || typeof o.labels !== 'object') errors.push(`${label}: labels bir nesne olmalı, örn. {"1": "Çok zor"}.`)
    else if (int(o.min) && int(o.max))
      for (const [k, v] of Object.entries(o.labels as Record<string, unknown>)) {
        const n = Number(k)
        if (!Number.isInteger(n) || n < o.min || n > o.max) errors.push(`${label}: "${k}" etiketi ölçeğin dışında.`)
        else if (typeof v !== 'string' || !v.trim()) errors.push(`${label}: ${k} etiketi boş olamaz.`)
      }
  }
  return errors
}

/** Rating mapped to 0..1 (0 = scale minimum) so different scales can be compared. */
export function normalizeRating(value: number, scale: RatingScale): number {
  return Math.min(1, Math.max(0, (value - scale.min) / (scale.max - scale.min)))
}
