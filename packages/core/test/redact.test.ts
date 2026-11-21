import { describe, expect, it } from 'vitest'
import { preservesMasks, redact } from '../src'

describe('redact (think-aloud transcripts)', () => {
  it('masks names, phone, e-mail, address and card number', () => {
    const r = redact('Ayşe Yılmaz için gönderiyorum, telefonu 0532 123 45 67, adresi Kadıköy Moda Caddesi no 5, mail ayse.yilmaz@ornek.com, kart 4543 1234 5678 9012.')
    expect(r.text).toBe('[isim] için gönderiyorum, telefonu [telefon], adresi [adres], mail [e-posta], kart [kart].')
    expect(r.counts).toEqual({ name: 1, phone: 1, email: 1, address: 1, card: 1 })
  })
  it('masks a name after "adım" / "ismim" even when it is not in the list', () => {
    expect(redact('Merhaba, adım Tarkan Güvenç, başlıyorum.').text).toBe('Merhaba, adım [isim], başlıyorum.')
    expect(redact('ismim Zorlu').text).toBe('ismim [isim]')
  })
  it('leaves ordinary words, screen names and numbers alone', () => {
    const t = 'Hediye kartı ekranında 2 kart seçtim, 150 TL ödedim. Siparişlerim butonu çalışmadı.'
    expect(redact(t).text).toBe(t)
  })
  it('a researcher edit must keep every mask and must not type a value back in', () => {
    const orig = 'telefonu [telefon], [isim] ile konuştum'
    expect(preservesMasks(orig, 'telefonu [telefon], [isim] ile görüştüm')).toBe(true)
    expect(preservesMasks(orig, 'telefonu 0532 123 45 67, [isim] ile konuştum')).toBe(false)
    expect(preservesMasks(orig, 'telefonu [telefon], Ayşe ile konuştum')).toBe(false)
  })
})
