# AgenticBEAR Backend Dokümantasyonu

Bu belge, AgenticBEAR projesinin `packages/server` dizininde yer alan backend servisinin detaylı bir analizini sunar.

---

## 1. Genel Bakış

AgenticBEAR backend'i, büyük dil modelleri (LLM'ler) ve yapay zeka ajanlarının orkestrasyonunu, yönetimini ve maliyet takibini sağlayan merkezi bir platformdur. Temel amacı, karmaşık çok adımlı AI iş akışlarını tasarlamak, yürütmek ve optimize etmek için geliştiricilere ve kullanıcılara güçlü araçlar sunmaktır.

**Çözdüğü Sorunlar:**
*   **Karmaşık AI İş Akışı Yönetimi:** Ajanlar arası işbirliği, görev ayrıştırma (decomposition) ve bağımlılık yönetimi ile karmaşık problemleri çözme.
*   **LLM Maliyet Optimizasyonu:** Akıllı yönlendirme, önbellekleme ve anlamsal eşleştirme ile LLM çağrılarının maliyetini düşürme.
*   **Çoklu LLM Sağlayıcı Desteği:** Farklı LLM sağlayıcılarını (Anthropic, OpenAI, Gemini vb.) tek bir arayüz üzerinden yönetme ve kullanma esnekliği.
*   **Maliyet Şeffaflığı ve Takibi:** Her bir çalıştırmanın (run) ve adımın (step) token ve maliyetini detaylı bir şekilde takip etme, maliyet tasarruflarını görselleştirme.
*   **Gerçek Zamanlı İletişim:** Model Context Protocol (MCP) ve Server-Sent Events (SSE) kullanarak LLM'lerle ve UI ile gerçek zamanlı etkileşim.

---

## 2. Teknoloji Yığını

AgenticBEAR backend'i modern, performans odaklı ve geliştirici dostu teknolojiler üzerine inşa edilmiştir.

*   **Fastify@5:** Yüksek performanslı, düşük overhead'li bir web çatısı. REST API endpoint'lerini sunmak için kullanılır.
*   **TypeScript:** Statik tipleme ile kod kalitesini ve sürdürülebilirliği artıran ana geliştirme dilidir.
*   **Node.js (>=20, ES Modules):** Asenkron I/O işlemleri ve sunucu tarafı JavaScript yürütmesi için çalışma zamanı ortamı.
*   **@anthropic-ai/sdk@0.52:** Anthropic Claude LLM'leri ile entegrasyon için resmi SDK.
*   **@modelcontextprotocol/sdk@1.27:** LLM'ler ve araçlar arasında standartlaştırılmış iletişim için Model Context Protocol (MCP) SDK'sı.
*   **better-sqlite3@11:** Hafif, hızlı ve sunucu tarafı SQLite veritabanı etkileşimleri için senkron bir kütüphane. Geliştirme ve küçük ölçekli dağıtımlar için tercih edilmiştir.
*   **zod@3:** Schema tanımlama ve veri doğrulama kütüphanesi. API istek/yanıtları ve konfigürasyonlar için kullanılır.
*   **nanoid@5:** Küçük, güvenli, URL dostu ve benzersiz ID'ler oluşturmak için kullanılır.
*   **chokidar:** Dosya sistemi değişikliklerini izlemek için kullanılır (örneğin, geliştirme ortamında otomatik yeniden başlatma).
*   **dotenv:** Ortam değişkenlerini `.env` dosyasından yüklemek için.
*   **vitest@3:** Hızlı ve modern bir test çatısı. Birim ve entegrasyon testleri için kullanılır.
*   **tsx@4:** TypeScript dosyalarını doğrudan Node.js'de çalıştırmak için bir araç, geliştirme sırasında derleme adımına gerek kalmaz.

---

## 3. Klasör Yapısı

`packages/server/src/` altındaki ana klasörler ve önemli dosyalar:

```
packages/server/src/
├── index.ts                  # Fastify uygulamasını başlatan ana giriş noktası
├── cost/                     # Maliyet optimizasyonu ve takibi sistemi
│   ├── layers/
│   │   ├── router.ts         # L2 Router (Haiku ile sınıflandırma)
│   │   ├── semantic-cache.ts # L1 Semantic Cache (Qdrant)
│   │   └── prompt-cache.ts   # L3 Prompt Cache (Anthropic cache_control)
│   ├── __tests__/
│   │   ├── middleware.test.ts
│   │   ├── router.test.ts
│   │   ├── prompt-cache.test.ts
│   │   └── semantic-cache.test.ts
│   ├── middleware.ts         # LLM çağrılarına maliyet takibi ekleyen middleware
│   ├── metrics.ts            # Oturum boyu maliyet metrikleri (actual/baseline/saved)
│   ├── pricing.ts            # LLM fiyatlandırma mantığı
│   ├── config.ts             # Maliyet sistemi konfigürasyonları
│   ├── types.ts              # LlmRequest, LlmResult, MiddlewareDeps tipleri
│   ├── embedding.ts          # Embedding sağlayıcısı (Voyage / local)
│   ├── hash.ts               # Önbellekleme için hash fonksiyonları
│   └── vector-store.ts       # Qdrant REST entegrasyonu
├── db/
│   ├── client.ts             # SQLite bağlantısı + inline migration'lar (001-006)
│   └── repositories/
│       ├── run.repo.ts
│       ├── task.repo.ts
│       ├── agent.repo.ts
│       ├── project.repo.ts
│       ├── provider.repo.ts
│       ├── memory.repo.ts
│       └── activity.repo.ts
├── engine/
│   ├── execution-engine.ts   # TaskQueue, dependency graph, paralel batch, doc step
│   └── handoff.ts            # Ajanlar arası görev devri
├── llm/
│   ├── client.ts             # Birleşik LLM istemcisi (provider dispatch)
│   ├── provider-registry.ts  # Built-in + custom provider yönetimi, pricing resolution
│   ├── anthropic.ts          # Anthropic SDK çağrıları
│   ├── openai.ts             # OpenAI-uyumlu çağrılar
│   └── gemini.ts             # Gemini çağrıları
├── mcp/
│   ├── server.ts             # MCP sunucusu (SSE)
│   ├── llm-service.ts        # MCP üzerinden LLM servisi
│   └── tools.ts              # list_agents, ask_agent, ask_orchestrator, multi_agent_discuss
├── routes/
│   ├── projects.ts
│   ├── agents.ts
│   ├── runs.ts
│   ├── analytics.ts          # /api/projects/:id/analytics (savings dahil)
│   ├── providers.ts
│   ├── settings.ts
│   ├── templates.ts
│   └── events.ts             # SSE (Server-Sent Events)
├── services/
│   ├── orchestrator.service.ts # Objective → task decomposition
│   ├── agent-runner.service.ts # Tek görev yürütme
│   ├── claude.service.ts       # Provider-agnostic LLM facade + cost middleware
│   └── token-tracker.service.ts # Run bazlı token & cost agregasyonu
└── utils/                    # Yardımcı fonksiyonlar (logger, event-bus, vb.)
```

---

## 4. Servisler

`packages/server/src/services/` dizini, projenin çekirdek iş mantığını barındıran servisleri içerir.

*   **`orchestrator.service.ts`**:
    *   **Görev:** Bir hedefi (objective) alt görevlere ayırır (task decomposition), bu görevleri uygun ajanlara atar, görevler arası bağımlılıkları yönetir ve genel iş akışını koordine eder.
    *   **Çıktı:** `decomposition: { reasoning, tasks[], apiResult: ClaudeCallResult }` döner; engine bunu DB'ye yazar.

*   **`agent-runner.service.ts`**:
    *   **Görev:** Tek bir ajanın belirli bir görevi (task) yürütmesi.
    *   **Fonksiyonellik:** Ajan context'ini kurar, `claudeService.sendMessage()` çağrılarını yapar, çıktıyı ve token/cost bilgisini engine'e döner.

*   **`claude.service.ts`**:
    *   **Görev:** Provider-agnostic LLM çağrı arayüzü. Her çağrıyı `costMiddleware.complete()` üzerinden geçirir.
    *   **Fonksiyonellik:** `providerId` ve `model`'a göre provider-registry'den resolve edilir, pricing yüklenir, semantic cache → router → prompt cache zincirinden geçer. Sonuçta `ClaudeCallResult` (artık `actualCostUsd` ve `baselineCostUsd` içeriyor) döner.

*   **`token-tracker.service.ts`**:
    *   **Görev:** Her `run` için token ve maliyet agregasyonu.
    *   **Fonksiyonellik:** `recordUsage()` artık opsiyonel `{ actualCostUsd, baselineCostUsd }` override alır — middleware'den gelen gerçek değerleri token×fiyat yaklaşımı yerine kullanır. `getRunTotals()` artık `totalBaselineCostUsd` da döner.

---

## 5. Cost Optimization Sistemi (3 Katman)

AgenticBEAR, LLM çağrılarının maliyetini düşürmek için üç katmanlı bir optimizasyon sistemi kullanır. Bu sistem, `packages/server/src/cost/` dizininde bulunur.

**Maliyet Metrikleri (Cost Metrics):**
*   **`actualCostUsd`**: Gerçekte ödenen maliyet (router downgrade, cache hit, prompt cache hepsi sonrası).
*   **`baselineCostUsd`**: Optimizasyon katmanları olmasaydı ödenecek tahmini maliyet — istenen modelde, cache hit yok varsayımıyla.
*   **`savedUsd`**: `baselineCostUsd - actualCostUsd` (negatife düşmesin diye `max(0, …)` clamp'lendi).
*   **`savedPct`**: `(savedUsd / baselineCostUsd) * 100`.

**Optimizasyon Katmanları:**

*   **L1: Semantic Cache (`cost/layers/semantic-cache.ts`)**
    *   **Mekanizma:** Embedding (Voyage veya local) + Qdrant vektör DB. Cacheable çağrılar için promptun semantik komşusu var mı bakılır.
    *   **İşleyiş:** Cache hit → LLM çağrısı yapılmaz, payload doğrudan döner; `actualCostUsd = 0`, `baselineCostUsd = istenen-model fiyatıyla hesaplanmış`.
    *   **Faydası:** Aynı/çok benzer prompt'ların tekrar LLM'e gönderilmemesi.

*   **L2: Router (`cost/layers/router.ts`)** *(yalnızca Anthropic ailesi)*
    *   **Mekanizma:** Ucuz bir model (Claude Haiku) ile gelen prompt'u TRIVIAL / SIMPLE / COMPLEX olarak sınıflandırır.
    *   **İşleyiş:** TRIVIAL/SIMPLE → daha ucuz Anthropic modeline downgrade; COMPLEX → istenen modelde kalır. Router'ın kendi sınıflandırma çağrısının token maliyeti (`routerOverheadTokens`) gerçek maliyete eklenir.
    *   **Faydası:** Görev karmaşıklığına göre dinamik model seçimi.

*   **L3: Prompt Cache (`cost/layers/prompt-cache.ts`)** *(yalnızca Anthropic ailesi)*
    *   **Mekanizma:** Anthropic'in native `cache_control` breakpoint'lerini system prompt bloklarına yerleştirir.
    *   **İşleyiş:** Sonraki çağrılar büyük system prompt'unun cache'den okunmasıyla daha düşük input token fiyatına denk gelir.
    *   **Faydası:** Uzun system prompt'lu tekrarlayan ajan çağrılarında dramatik tasarruf.

---

## 6. Execution Engine

`packages/server/src/engine/` dizini, ajanların ve görevlerin nasıl yürütüldüğünü yöneten çekirdek mantığı içerir.

*   **`execution-engine.ts`**:
    *   **TaskQueue:** Bağımlılığa göre `ready` task'ları yöneten kuyruk.
    *   **Dependency Graph:** `tasks.dependencies` üzerinden topolojik sıralama; bir görev ancak tüm bağımlılıkları tamamlanınca `ready` olur.
    *   **Parallel Batch:** `settings.maxConcurrentAgents` kadar bağımsız task aynı anda yürütülür (`Promise.allSettled`).
    *   **Documentation Step:** Tüm task'lar bitince, system prompt'unda `document/rapor/özet` gibi kelimeler içeren bir specialist agent varsa, çalışmanın özetini `reports/run-<ts>.txt` olarak workspace'e yazar.
    *   **Memory:** Tamamlanan task'ların kısa özetleri her agent için `agent_memories` tablosuna `summary` tipinde yazılır.

*   **`handoff.ts`**:
    *   **Görev Devri:** Bir agent'ın işi başka bir agent'a aktarması (run_steps'e `type: handoff` satırı yazılır).
    *   **Handoff Task:** Yeni bir takip görevi başka bir agent'a atanır; mevcut task'a bağımlı olarak kuyruğa eklenir.

---

## 7. Veritabanı Şeması

AgenticBEAR, `better-sqlite3` kullanarak bir SQLite veritabanı kullanır. Şema, `packages/server/src/db/client.ts` içinde inline migration'lar (001-006) ile yönetilir ve `packages/server/src/db/repositories/` altındaki repository'ler aracılığıyla erişilir.

**Ana Tablolar:**

*   **`projects`**: Proje meta verisi (workspace yolu, status, orchestrator agent id).
*   **`agents`**: Ajan tanımı (role, slug, system_prompt, model_config JSON, permissions, color, icon).
*   **`runs`**: Bir objective'in tek yürütmesi.
    *   **Migration 006:** `total_baseline_cost_usd REAL DEFAULT 0` — cost-layer olmasaydı toplam maliyet.
*   **`tasks`**: Run içindeki alt görevler (parent_task_id, dependencies JSON, order, status).
*   **`run_steps`**: Tek bir LLM çağrısı / handoff / file_read / file_write / reasoning / error eylemi.
    *   **Migration 006:** `baseline_cost_usd REAL DEFAULT 0` — bu adım için baseline maliyet.
*   **`file_changes`**: Agent'ların yaptığı dosya değişiklikleri (operation: create/modify/delete).
*   **`agent_memories`**: Agent'ların geçmiş etkileşim ve özetleri (cross-run kalıcı bellek).
*   **`agent_activities`**: MCP tool çağrıları ve direkt agent etkileşim logları.
*   **`llm_providers`**: Kullanıcı tanımlı custom LLM provider'lar (kind, base_url, api_key, models JSON).
*   **`settings`**: Tek satır global ayarlar (api_key, default_model, theme, default_workspace_path, max_concurrent_agents, openai_api_key, gemini_api_key).

**Migration Sistemi:**
`packages/server/src/db/client.ts` içinde `001`'den `006`'ya kadar olan migration'lar inline olarak tanımlanmıştır. `_migrations` tablosu uygulanmış migration'ları izler — her başlatmada eksikler sırayla çalıştırılır.

| Migration | Açıklama |
|---|---|
| 001_initial | projects, agents, runs, tasks, run_steps, file_changes, templates, settings |
| 002_agent_activity | agent_activities |
| 003_agent_memory | agent_memories |
| 004_settings_provider_keys | settings'e openai_api_key + gemini_api_key |
| 005_llm_providers | llm_providers tablosu |
| 006_cost_savings | run_steps.baseline_cost_usd + runs.total_baseline_cost_usd |

---

## 8. MCP Entegrasyonu

Model Context Protocol (MCP), LLM'ler ve harici araçlar arasında standartlaştırılmış, bağlam farkında bir iletişim protokolüdür. AgenticBEAR, `packages/server/src/mcp/` dizininde MCP ile entegrasyonu sağlar.

*   **`@modelcontextprotocol/sdk`:** Bu SDK kullanılarak AgenticBEAR backend'i bir MCP sunucusu gibi davranır; Claude Code CLI buna SSE üzerinden bağlanır.
*   **Araçlar (`mcp/tools.ts`):**
    *   `list_agents()`: Tüm projelerin ajanlarını ve rollerini listeler.
    *   `ask_agent(agent_id, query, context?)`: Belirli bir ajanın kimliğini ve system prompt'unu yükleyip soruyu o ajan gibi yanıtlar.
    *   `ask_orchestrator(query, context?)`: Orkestratör ajanı çağırır (genelde decomposition için).
    *   `multi_agent_discuss(...)`: Birden fazla ajan belirli bir konu üzerinde sırayla yorum yapar.
*   **SSE Üzerinden Bağlanış:** Claude Code CLI, AgenticBEAR'ın MCP server endpoint'ine SSE ile bağlanır; tool çağrıları request/response olarak yürür, uzun süreli operasyonlarda streaming desteklenir.

---

## 9. LLM Provider Sistemi

AgenticBEAR, çeşitli LLM sağlayıcılarını desteklemek için esnek bir mimariye sahiptir (`packages/server/src/llm/`).

*   **`provider-registry.ts`**: Built-in + kullanıcı tanımlı provider'ların merkezi kayıt defteri. `resolveProvider(providerId, model)` ve `modelPricing(providerId, model)` fonksiyonlarını sağlar.
*   **Yerleşik Sağlayıcılar:**
    *   **Anthropic (`anthropic.ts`):** Claude modelleri (Opus, Sonnet, Haiku). L2/L3 katmanları yalnızca bu aileye uygulanır.
    *   **OpenAI (`openai.ts`):** GPT modelleri için entegrasyon.
    *   **Gemini (`gemini.ts`):** Google Gemini modelleri için entegrasyon.
*   **Kullanıcı Tanımlı (Custom) Sağlayıcılar:**
    *   `llm_providers` tablosunda saklanır. `kind` alanı `anthropic | anthropic-compatible | openai | openai-compatible | gemini` değerlerinden biri.
    *   Örnek hedefler: DeepSeek, Ollama, LM Studio, OpenRouter.
    *   Her custom provider için `base_url`, `api_key` ve `models_json` (her model için fiyat) tanımlanır.

---

## 10. REST API Endpoint'leri

Fastify tarafından sunulan REST API endpoint'leri `packages/server/src/routes/` dizininde tanımlanmıştır.

*   **`/api/projects`** — Projeleri listeleme, oluşturma, güncelleme, silme.
*   **`/api/agents`** — Ajanları listeleme, oluşturma, güncelleme, silme.
*   **`/api/runs`** — Çalıştırmaları listeleme, başlatma, pause/cancel.
*   **`/api/projects/:id/analytics`** — Proje analitiği (toplam token, cost, agent breakdown, son 30 gün).
    *   **Yeni Alanlar (Migration 006 + savings tracking):**
        *   `totalBaselineCostUsd` — Optimizasyonlar olmadan tahmini toplam.
        *   `totalSavedUsd` — `max(0, baseline - actual)`.
        *   `savedPct` — Tasarruf yüzdesi.
        *   Per-agent ve per-date breakdown'larda da `baselineCostUsd` + `savedUsd` döner.
        *   Bu veriler UI'daki **Saved** stat kartını (yeşil aksanlı) besler.
*   **`/api/providers`** — LLM sağlayıcılarını (built-in + custom) listeleme/CRUD.
*   **`/api/settings`** — Tek satır global ayarları yönetme.
*   **`/api/templates`** — Ajan/proje şablonları.
*   **`/api/events`** — SSE endpoint (run progress, task lifecycle, token updates).

---

## 11. Kurulum ve Çalıştırma

1.  **Bağımlılıkları Yükle (monorepo kök dizini):**
    ```bash
    cd /Users/cenkay/Projects/AgenticBEAR
    npm install
    ```

2.  **Geliştirme Modunda Çalıştır:**
    Kök dizinden `concurrently` ile hem server hem client başlar:
    ```bash
    npm run dev
    ```
    *   Server: `http://localhost:3001`
    *   Client (Vite): `http://localhost:5174` (5173 doluysa otomatik kayar)

3.  **Sadece Server veya Client:**
    ```bash
    npm run dev:server   # tsx watch packages/server/src/index.ts
    npm run dev:client   # vite (packages/client)
    ```

4.  **Build:**
    ```bash
    npm run build        # client (vite) + server (esbuild bundle → dist/server.js)
    ```

5.  **Production Çalıştırma:**
    ```bash
    npm start            # NODE_ENV=production node dist/server.js
    ```

6.  **Typecheck:**
    ```bash
    npm run typecheck    # tsc -b packages/shared packages/server packages/client
    ```

**Önemli:** `node >= 20` gerektirilir (package.json `engines`).

---

## 12. Test Stratejisi

AgenticBEAR backend'i, `Vitest` test çatısı kullanılarak test edilir.

*   **Test Çatısı:** `vitest@3`
*   **Test Konumu:** Cost katmanı testleri `packages/server/src/cost/__tests__/`:
    *   `middleware.test.ts` — End-to-end choke-point davranışı
    *   `router.test.ts` — L2 router sınıflandırma + downgrade kararları
    *   `prompt-cache.test.ts` — L3 cache_control breakpoint yerleştirme
    *   `semantic-cache.test.ts` — L1 cache hit/miss, namespace izolasyonu
*   **Çalıştırma:**
    ```bash
    cd packages/server
    npm test         # vitest run
    npm run test:watch
    ```

---

Bu doküman, AgenticBEAR backend'ine genel bir bakış sağlamak ve geliştiricilerin projeye hızlıca adapte olmalarına yardımcı olmak amacıyla hazırlanmıştır.
