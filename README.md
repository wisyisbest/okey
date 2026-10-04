# Okey

Telefon tarayıcısında oynanan, online, basit Okey oyunu. Oda kur, kodu ya da linki paylaş; boş yerlere bot oturur. Oyun sırasında gelen oyuncu bir botun yerine geçer.

- Next.js (App Router) + TypeScript, Vercel'de çalışır
- Oyun durumu Upstash Redis'te (ortam değişkenleri yoksa bellek içi depo)
- İstemci 1 saniyede bir durumu sorgular; tüm kurallar sunucuda çalışır, herkes sadece kendi taşlarını görür
- Plan ve kurallar: [PLAN.md](PLAN.md)

## Yerelde çalıştırma

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # kural motoru testleri
```

## Vercel'e yayınlama

1. [vercel.com/new](https://vercel.com/new) adresinden bu GitHub reposunu içe aktar (ayar gerekmez, Next.js otomatik algılanır).
2. Proje sayfasında **Storage → Create / Connect → Upstash for Redis** ile ücretsiz bir Redis ekle ve projeye bağla. `KV_REST_API_URL` ve `KV_REST_API_TOKEN` (ya da `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`) değişkenleri otomatik eklenir.
3. Yeniden deploy et.

> Redis bağlanmadan da açılır, ama serverless fonksiyonlar arasında bellek paylaşılmadığı için odalar kaybolabilir. Online oyun için Redis gerekli.

## Nasıl oynanır

- Sıra sendeyken ortadaki desteye ya da soldaki oyuncunun attığı taşa dokun.
- Taşı seçmek için dokun, yerini değiştirmek için sürükle. **Seriye Diz** / **Çifte Diz** otomatik dizer.
- Atmak için taşı seç ve **At**'a bas (ya da sağdaki "At" alanına sürükle).
- Elin bittiyse atacağın taşı seçip **Bitir**'e bas: 14 taşın tamamı per (aynı renk sıralı ≥3, ya da farklı renk aynı sayı 3–4) ya da 7 çift olmalı. Okey her taşın yerine geçer, sahte okey okeyin değerini alır.
- 30 saniyede oynamayan oyuncunun hamlesini bot yapar.
