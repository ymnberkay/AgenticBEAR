# Postgres'e Geçiş

AgenticBEAR varsayılan olarak **SQLite** (sıfır kurulum) kullanır, ama tek bir env değişkeniyle
**Postgres**'e geçebilir. Veri katmanı çift sürücülü (dual-driver) tasarlandı: tek bir asenkron
arayüz (`packages/server/src/db/adapter.ts`), iki backend (SQLite / Postgres).

## Sürücü seçimi

| Ortam | Davranış |
|---|---|
| `DATABASE_URL` yok | SQLite (varsayılan, `~/.subagent-manager/data.db`) |
| `DATABASE_URL` var | Otomatik Postgres |
| `DB_DRIVER=sqlite` veya `DB_DRIVER=postgres` | Açık seçim (DATABASE_URL'i geçersiz kılar) |

`DATABASE_URL` formatı: `postgres://kullanıcı:şifre@host:5432/veritabanı`

## 1) Postgres'i çalıştır (örnek: Docker)

```bash
docker run -d --name agb-pg \
  -e POSTGRES_USER=agb -e POSTGRES_PASSWORD=agb -e POSTGRES_DB=agenticbear \
  -p 5432:5432 postgres:16-alpine
```

## 2) Mevcut SQLite verisini taşı (opsiyonel)

Şema, uygulamanın migration'larıyla **otomatik** oluşturulur; bu script önce şemayı kurar,
sonra tüm satırları SQLite'tan kopyalar. Tekrar çalıştırmak güvenli (`ON CONFLICT DO NOTHING`).

```bash
DATABASE_URL="postgres://agb:agb@localhost:5432/agenticbear" \
  npm run db:migrate-pg -w @subagent/server
```

Kaynak SQLite dosyası `config.dbPath`'tir; farklıysa `SQLITE_PATH=/yol/data.db` ile değiştir.

## 3) Uygulamayı Postgres ile başlat

```bash
DATABASE_URL="postgres://agb:agb@localhost:5432/agenticbear" npm run dev -w @subagent/server
# ya da kalıcı olarak .env içine DATABASE_URL ekle
```

İlk açılışta migration'lar (001–016) Postgres'e uygulanır; admin kullanıcı yoksa seed'lenir.

## Notlar / dialect farkları

Çevirisi `db/client.ts` (`toDialect`) ve `routes/analytics.ts` (`dialect()`) içinde:

- `datetime('now')` → `now()::text` (created_at kolonları TEXT, ISO string saklanır)
- `INTEGER PRIMARY KEY AUTOINCREMENT` → `SERIAL` (`_migrations` tablosu)
- `INSERT OR IGNORE` → `ON CONFLICT DO NOTHING` (template seed)
- `MAX(a, b)` (SQLite skaler) → `GREATEST(a, b)` (analytics savings)
- `date(col)` → `to_char(col::timestamptz,'YYYY-MM-DD')`; `datetime(col) >= datetime(?)` → `col::timestamptz >= ?::timestamptz`
- `?` placeholder'lar → `$1,$2,…` (adapter otomatik çevirir)
- `COUNT`/`SUM` bigint/numeric → JS `number` (pg tip parser'ı, adapter'da ayarlı)

Boolean alanlar her iki backend'de de `INTEGER 0/1` olarak saklanır (repo mantığı değişmez).
JSON alanları `TEXT` olarak saklanır (jsonb değil) — taşınabilirlik için.

## Doğrulama (bu repoda test edildi)

Postgres 16 ile: 286 satır taşındı; login, proje listesi, org + proje analytics
(`date()`/`GREATEST`/`COUNT`), gateway-usage (`SUM`/`COUNT`), şablonlar, gateway key'leri,
ve INSERT/UPDATE/DELETE yazma yolu — hepsi çalıştı. `npm run typecheck` temiz, 84 test geçti.
