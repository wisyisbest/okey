# Okey

Telefon tarayıcısında oynanan, online, basit Okey oyunu. Oda kur, kodu ya da linki paylaş; boş yerlere bot oturur. Oyun sırasında gelen oyuncu bir botun yerine geçer.

- Next.js (App Router) + TypeScript, Vercel'de çalışır
- Oyun durumu Supabase (Postgres) ya da Upstash Redis'te (ortam değişkenleri yoksa bellek içi depo)
- İstemci 1 saniyede bir durumu sorgular; tüm kurallar sunucuda çalışır, herkes sadece kendi taşlarını görür
- Plan ve kurallar: [PLAN.md](PLAN.md)

## Yerelde çalıştırma

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # kural motoru testleri
```

## Vercel'e yayınlama

1. [vercel.com/new](https://vercel.com/new) adresinden bu GitHub reposunu içe aktar (Next.js otomatik algılanır).
2. Depolama için iki seçenek var:
   - **Supabase:** `supabase/okey.sql` dosyasını Supabase SQL Editor'da bir kez çalıştır (`__SECRET_SHA256__` yerine gizli anahtarın sha256 özetini yaz). Vercel'e `SUPABASE_URL`, `SUPABASE_KEY` (publishable key) ve `OKEY_DB_SECRET` değişkenlerini ekle. Tablolar API'ye kapalı ayrı bir `okey` şemasında durur; erişim sadece gizli anahtar isteyen `okey_*` fonksiyonlarıyla olur.
   - **Upstash Redis:** Vercel proje sayfasında **Storage → Upstash for Redis** ekle; `KV_REST_API_URL` / `KV_REST_API_TOKEN` otomatik gelir.
3. Yeniden deploy et.

> Veritabanı bağlanmadan da açılır, ama serverless fonksiyonlar arasında bellek paylaşılmadığı için odalar kaybolabilir.

## Nasıl oynanır

- Sıra sendeyken ortadaki desteye ya da soldaki oyuncunun attığı taşa dokun.
- Taşı seçmek için dokun, yerini değiştirmek için sürükle. **Seriye Diz** / **Çifte Diz** otomatik dizer.
- Atmak için taşı seç ve **At**'a bas (ya da sağdaki "At" alanına sürükle).
- Elin bittiyse atacağın taşı seçip **Bitir**'e bas: 14 taşın tamamı per (aynı renk sıralı ≥3, ya da farklı renk aynı sayı 3–4) ya da 7 çift olmalı. Okey her taşın yerine geçer, sahte okey okeyin değerini alır.
- Atılan taşlar masanın köşelerinde görünür; bir yığına dokununca o oyuncunun attığı tüm taşlar listelenir.
- 45 saniyede oynamayan oyuncunun hamlesini bot yapar.
- Ortadan ya da soldaki yığından taşı ıstakada istediğin yere sürükleyerek de çekebilirsin.
- Göstergenin eşi elindeyse ilk taşını atmadan önce **Göster**'e basabilirsin: diğerleri 1 puan kaybeder.
- 💬 düğmesiyle hazır mesaj ya da emoji gönderilir.
- **Kalk** dersen yerine bot oynar; aynı linkle ve aynı adla dönünce koltuğunu geri alırsın.
- Maç: herkes 20 puanla başlar. El bitince diğerleri 2 puan kaybeder (okey atarak ya da çiftten bitirirse 4). Biri 0'a düşünce maç biter, en yüksek puanlı kazanır. Eller arasında 15 saniye sonra yeni el kendiliğinden başlar.
