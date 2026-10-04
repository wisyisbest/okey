# Mobil Web Okey: Plan

## Hedef
Telefonda tarayıcıdan oynanan, basit, **online** bir Okey oyunu.
- Oda kur / koda katıl, 4 kişilik masa
- Eksik oyuncular **bot** ile tamamlanır (oda sahibi "Başlat" dediğinde ya da süre dolduğunda)
- **Vercel** üzerinde yayın

## Teknoloji
| Katman | Seçim | Neden |
|---|---|---|
| Uygulama | **Next.js (App Router) + TypeScript** | Vercel'in yerel çatısı, API route'lar ile tek repo |
| Arayüz | React + sade CSS (mobil öncelikli, yatay/dikey) | Ek bağımlılık yok, hızlı |
| Oyun durumu | **Upstash Redis** (Vercel Marketplace, ücretsiz katman) | Vercel serverless fonksiyonları durumsuzdur, durum bir yerde tutulmalı |
| Gerçek zaman | Kısa aralıklı **polling** (~1 sn, sürüm numarası ile) | Vercel serverless WebSocket tutamaz; okey sıra tabanlı olduğu için polling yeterli |
| Yerel geliştirme | Redis env yoksa bellek içi depo | `npm run dev` ile anında çalışır |

**Sunucu otoriter**: Tüm kurallar sunucuda çalışır, her oyuncu sadece kendi ıstakasını görür (hile önlenir).

## Oyun kuralları (klasik Okey)
- 106 taş: 4 renk × 1–13 × 2 + 2 sahte okey
- Gösterge taşı açılır, okey = göstergenin bir üstü (13 → 1), sahte okey okeyin yerine geçer
- Başlayan 15, diğerleri 14 taş alır
- Sıra: ortadan ya da soldaki oyuncunun attığı taştan çek → bir taş at
- Bitirme: 14 taşın tamamı per (aynı renk ardışık ≥3 / farklı renk aynı sayı 3–4) ya da **7 çift** ile, 15. taşı atarak bitir
- Okey joker olarak her yere geçer; okey atarak bitirmek bonus
- Ortada taş biterse el berabere
- Puanlama (basit): her oyuncu 20 puanla başlar, kazanan dışındakiler -2 (okey ile biterse -4, çiftle biterse -4); 0'a düşen olunca maç biter (bunu sonra ekleyebiliriz, MVP'de tek el yeterli)

## Bot
- Sırası gelince sunucu otomatik oynar (insan hamlesini işleyen istek içinde, ardından sıradaki botlar)
- Strateji: soldan atılan taş eldeki bir perle/çiftle işe yarıyorsa onu al, yoksa ortadan çek; en az işe yarayan taşı at; bitirebiliyorsa biter
- İnsan oyuncu sırasında 30 sn hareketsiz kalırsa / bağlantısı koparsa bot onun yerine oynar

## Ekranlar
1. **Giriş**: isim gir → "Oda Kur" veya "Koda Katıl" (4 haneli kod)
2. **Lobi**: koltuklar, paylaşma linki, "Botlarla Başlat"
3. **Masa** (mobil, yatay önerilir):
   - Alt: kendi ıstakan (2 sıra, sürükle-bırak / dokun-seç ile dizme), "Seriye Diz" / "Çifte Diz" butonları
   - Orta: deste (kalan sayısı), gösterge taşı
   - Köşeler: rakipler ve attıkları son taş
   - "Çek", "At", "Bitir" eylemleri, sıra göstergesi + süre
4. **El sonu**: kazanan, açılan eli, "Yeni El"

## Dosya yapısı
```
src/lib/okey/      tiles.ts, rules.ts (per/çift kontrolü), bot.ts, game.ts (durum makinesi)
src/lib/store.ts   Redis / bellek içi depo
src/app/api/       room (oluştur/katıl/başlat), state (GET, polling), action (çek/at/bitir)
src/app/           page.tsx (giriş), room/[code]/page.tsx (lobi+masa)
src/components/    Tile, Rack, Table
tests/             kural motoru birim testleri
```

## Adımlar
1. Proje iskeleti (Next.js, TS, lint)
2. Kural motoru + testler (desteleme, okey hesaplama, el bitirme kontrolü, joker dahil)
3. Durum makinesi + bot
4. API + depo (Redis / bellek)
5. Mobil arayüz
6. Uçtan uca deneme (tarayıcıda 1 insan + 3 bot)
7. Vercel'e yayın: projeyi GitHub repo'sundan bağla, Upstash Redis entegrasyonunu ekle (env değişkenleri otomatik gelir)

## Kapsam dışı (MVP sonrası)
Hesap/giriş, sohbet, puan tablosu, 101 Okey, ses efektleri.
