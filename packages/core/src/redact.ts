// Masking personal data in think-aloud transcripts (decisions 2026-11-21, think-aloud). Runs on the participant's
// device before anything is stored: names, phone numbers, e-mail addresses, street addresses and card numbers become
// fixed tokens. The researcher may correct the text but never remove a token (preservesMasks). Pure and
// deterministic; Turkish first, English patterns where they are the same shape.

export const MASK = {
  name: '[isim]',
  phone: '[telefon]',
  email: '[e-posta]',
  address: '[adres]',
  card: '[kart]'
} as const
export type MaskKind = keyof typeof MASK

const UP = 'A-ZÇĞİÖŞÜ'
const LO = 'a-zçğıöşü'
const WORD = `[${UP}][${LO}]+`

// Common Turkish first names (a name list is the only signal a single lower-case-free word gives).
const FIRST_NAMES = (
  'Ahmet Mehmet Mustafa Ali Hüseyin Hasan İbrahim İsmail Osman Yusuf Murat Ömer Ramazan Halil Süleyman Abdullah Mahmut ' +
  'Recep Salih Fatih Kadir Emre Hakan Burak Serkan Selim Cem Can Kerem Kaan Mert Onur Eren Barış Tolga Tuncay Volkan ' +
  'Nezih Oğuz Orhan Erkan Erdem Emir Arda Deniz Umut Uğur Levent Serdar Sinan Tamer Yasin Yiğit Berk Baran Doruk Efe ' +
  'Fatma Ayşe Emine Hatice Zeynep Elif Meryem Şerife Zehra Sultan Hanife Merve Özlem Esra Büşra Kübra Elif Ebru Derya ' +
  'Seda Gizem Gamze Pınar Ceren Cansu Selin Sena Nur Nurcan Aslı Burcu Damla Didem Dilek Duygu Ece Eda Ezgi Gül Gülşen ' +
  'Hande İrem Melis Melike Nazlı Neslihan Sibel Simge Tuğba Yasemin Yeliz Zerrin Aylin Aysel Ayten Berna Canan Defne ' +
  'Asya Azra Ela Eylül Lara Mira Nil Ada Beren İpek Şule Tülay Leyla Hülya Filiz Nermin Sevgi Sevim Songül Şeyma'
)
  .split(/\s+/)
  .filter(Boolean)
const NAME_SET = new Set(FIRST_NAMES.map((n) => n.toLocaleLowerCase('tr')))

interface Rule {
  kind: MaskKind
  re: RegExp
}

const RULES: Rule[] = [
  { kind: 'email', re: /[\w.+-]+\s?@\s?[\w-]+(?:\.[\w-]+)+/g },
  // 13-19 digits in groups (a card number), before phone numbers.
  { kind: 'card', re: /\b(?:\d[ -]?){12,18}\d\b/g },
  // Turkish mobile/landline: +90 / 0 prefix, 10 digits in groups; also bare 10-11 digit runs.
  { kind: 'phone', re: /(?<!\d)(?:\+\s?90[ -]?)?\d(?:[ -]?\d){9,11}(?!\d)/g },
  {
    kind: 'address',
    re: new RegExp(
      `(?:(?:[${UP}][${LO}]+|\\d+\\.?)\\s+(?:[${UP}${LO}]+\\s+){0,2})?(?:[Mm]ahallesi|[Mm]ahalle|[Mm]ah\\.|[Cc]addesi|[Cc]adde|[Cc]ad\\.|[Ss]okağı|[Ss]okak|[Ss]ok\\.|[Ss]k\\.|[Bb]ulvarı|[Bb]lv\\.|Street|St\\.|Avenue|Ave\\.|Road)` +
        `(?:\\s*,?\\s*(?:[Nn]o|[Nn]umara|[Dd]aire|[Kk]at|[Aa]pt\\.?|[Aa]partmanı)\\s*[:.]?\\s*\\d+[A-Za-z]?)*`,
      'gu'
    )
  }
]

/** Names: "adım X", "ismim X", "ben X" (+ surname), and known first names with an optional capitalized surname. */
function maskNames(text: string): string {
  let out = text.replace(new RegExp(`\\b(adım|ismim|ben|my name is|I am|I'm)\\s+(${WORD})(\\s+${WORD})?`, 'giu'), (m, lead: string, first: string) =>
    lead.toLocaleLowerCase('tr') === 'ben' && !NAME_SET.has(first.toLocaleLowerCase('tr')) ? m : `${lead} ${MASK.name}`
  )
  out = out.replace(new RegExp(`(?<![${UP}${LO}])(${WORD})(\\s+${WORD})?(?![${LO}])`, 'gu'), (m, first: string) => (NAME_SET.has(first.toLocaleLowerCase('tr')) ? MASK.name : m))
  return out
}

/** Masks personal data. Returns the masked text and how many of each kind were masked. */
export function redact(text: string): { text: string; counts: Record<MaskKind, number> } {
  const counts: Record<MaskKind, number> = { name: 0, phone: 0, email: 0, address: 0, card: 0 }
  let out = text
  for (const r of RULES)
    out = out.replace(r.re, () => {
      counts[r.kind]++
      return MASK[r.kind]
    })
  const before = out
  out = maskNames(out)
  counts.name = (out.match(/\[isim\]/g)?.length ?? 0) - (before.match(/\[isim\]/g)?.length ?? 0)
  return { text: out.replace(/(\[isim\])(\s+\[isim\])+/g, '$1'), counts }
}

const TOKENS = /\[(?:isim|telefon|e-posta|adres|kart)\]/g

/** A researcher's correction is accepted only if every mask token of the original is still there, and no masked
 * value was typed back in (the edit is re-masked; it must not mask anything new compared to the edit itself). */
export function preservesMasks(original: string, edited: string): boolean {
  const count = (s: string): Map<string, number> => {
    const m = new Map<string, number>()
    for (const t of s.match(TOKENS) ?? []) m.set(t, (m.get(t) ?? 0) + 1)
    return m
  }
  const a = count(original)
  const b = count(edited)
  for (const [t, n] of a) if ((b.get(t) ?? 0) < n) return false
  return redact(edited).text === edited
}
