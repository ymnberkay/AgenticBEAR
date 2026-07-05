# AgenticBEAR — Sunum Dokümanı

> **Tek cümleyle:** Birden çok LLM sağlayıcısını (Anthropic, OpenAI, Gemini, DeepSeek, Azure Foundry, yerel modeller) tek çatı altında toplayan; agent ekipleriyle gerçek dosya yazabilen; ve her LLM çağrısını **çok katmanlı bir maliyet-optimizasyon hattından** geçirerek belirgin tasarruf sağlayan, **OpenAI-uyumlu bir LLM gateway'i** olan kurumsal bir AI platformu.

---

## 1. Teknoloji Yığını

### Backend
| Alan | Teknoloji |
|------|-----------|
| Dil / Runtime | **TypeScript** · **Node.js v24** |
| Web framework | **Fastify 5** (+ `@fastify/cors`, `@fastify/static`) |
| Veritabanı | **SQLite** (`better-sqlite3` 11) — gömülü, sıfır-kurulum |
| Vektör DB | **Qdrant** (semantic cache için) |
| LLM SDK | `@anthropic-ai/sdk` + **birleşik (unified) HTTP client** (OpenAI-uyumlu & Gemini için) |
| MCP | `@modelcontextprotocol/sdk` (SSE üzerinden — Claude Code vb. araçlar bağlanır) |
| Doğrulama / Yardımcı | `zod`, `nanoid`, `chokidar`, `dotenv` |
| Geliştirme / Test | `tsx` (hot-reload), **`vitest`** (75 test) |

### Frontend
| Alan | Teknoloji |
|------|-----------|
| UI | **React 19** + **Vite** |
| Routing | **TanStack Router** |
| Veri/State | **TanStack Query** (server state) + **Zustand** (client state) |
| Stil | **TailwindCSS 4** + CSS değişkenleri (tema) |
| Animasyon / İkon | `framer-motion` · `lucide-react` |

### Yapı
- **Monorepo** (npm workspaces): `packages/shared` (ortak tipler/sabitler), `packages/server` (API + motor), `packages/client` (React arayüz).

---

## 2. Mimari

### Monorepo & Giriş Yolları
Tüm LLM trafiği tek bir **maliyet choke-point**'inden geçer; böylece her yol otomatik optimize olur ve Analytics'e yansır.

| Giriş Yolu | Ne işe yarar |
|-----------|--------------|
| **Run Engine** | Orchestrator hedefi alt-görevlere böler → specialist'ler paralel çalışır → gerçek dosya yazar |
| **Chat** | Bir agent'la birebir sohbet; orchestrator specialist'lere delege eder; agent'lar dosya yazar |
| **MCP** | Claude Code / herhangi bir MCP istemcisi → `ask_agent`, `ask_orchestrator` |
| **Gateway** | Dış uygulamalar → `POST /v1/chat/completions` (OpenAI-uyumlu) |

### Maliyet Choke-Point
```
Düz metin çağrısı ─▶ ClaudeService ─▶ costMiddleware (L0→L1→L2→L3 + metrik) ─▶ unified client ─▶ sağlayıcı
Tool-use çağrısı  ─▶ completeWithTools ─▶ (L4 + L1 answer-cache + L2 level-router) ─▶ unified client ─▶ sağlayıcı
                                          └─ unified client ─▶ provider-registry ─▶ Anthropic | OpenAI | Gemini | OpenAI-uyumlu | Anthropic-uyumlu
```

---

## 3. Veritabanı

- **SQLite** (`better-sqlite3`) — migration'lar kod içinde gömülü, açılışta otomatik çalışır.
- Başlıca tablolar: `projects`, `agents`, `runs`, `tasks`, `run_steps`, `file_changes`, `project_documents` (knowledge), `llm_providers` (custom sağlayıcılar), `gateway_keys`, `gateway_usage`, `settings`, `agent_memories`, `agent_activities`.
- **Qdrant**: L1 semantic cache vektörleri (prompt → cevap, namespace bazlı).

---

## 4. Maliyet Optimizasyon Katmanları (Çekirdek Özellik)

Her LLM çağrısı, açılıp kapanabilen bağımsız katmanlardan geçer:

| Katman | Adı | Ne yapar | Tasarruf türü |
|:---:|------|----------|---------------|
| **L0** | Context Compression | Çağrıdan önce girdiyi kısaltır (boşluk temizleme + JSON minify; agentic'te kayıpsız) | input token |
| **L1** | Semantic Cache | Aynı/benzer soru daha önce sorulduysa cevabı **Qdrant**'tan döner (LLM yok). Eşik 0.90 + **LLM-as-judge** kapısı paraphrase'leri güvenle yakalar | tüm çağrı |
| **L2** | Level-based Router | İsteğin **karmaşıklığını 1–10** sınıflar; modellere atanan **seviyeye** göre, karmaşıklığı karşılayan **en ucuz** modeli seçer (istenen model = tavan) | ucuz model |
| **L3** | Prompt Cache | Tekrarlanan uzun system prefix'ini ucuza faturalandırır (Anthropic `cache_control` + OpenAI/Azure otomatik `cached_tokens` kredilemesi) | input token |
| **L4** | Output Minimization | "Tembel kıdemli dev" direktifi ile agent'ı gereksiz/over-engineer kod yazmamaya yönlendirir | output token |

### Ek cache & sıkıştırma mekanizmaları
- **Tool-result cache**: read-only araçların (`read_file`/`list_files`) sonucunu cache'ler; bir write'ta o workspace için invalidate eder.
- **Agentic answer-cache**: chat/agent'ta **araç KULLANMAYAN** (saf-cevap) turn'leri L1'e yazar → tekrar gelen aynı soru bedavaya gelir. **Güvenli:** sadece yan etkisiz cevaplar saklanır, asla bir dosya yazımını atlamaz.
- **Output sıkıştırma (RTK-tarzı)**: tool çıktısı (listing/log) bağlama girmeden önce **tekrar satır dedup + JSON minify + head/tail kırpma** ile küçültülür (agentic); gateway'de kullanıcı mesajındaki tekrar eden satırlar da toplanır. Büyük çıktılarda input token'ı belirgin düşürür.

### Tasarruf nereye gitmez (dürüst sınırlar)
- Tool-use (dosya yazan) çağrılar L1/L2/L3'ü **bilerek atlar** (yan etki güvenliği) — sadece L0 + agentic answer-cache + level-router uygulanır.
- Tamamen benzersiz, kısa, tek-modelli trafik: cache/router yapısı gereği az tasarruf eder (beklenen davranış).

---

## 5. Ölçülen Tasarruf (canlı testlerden)

| Senaryo | Katman | Sonuç |
|---------|--------|-------|
| Gateway — tekrarlı/benzer sorular (10'luk batch) | L1 + judge | **8/10 hit → %80 tasarruf** |
| Gateway — uzun sabit system prompt (tekrarlı) | L3 prompt cache | çağrı başına **~%47** |
| Gateway — basit sorular, pahalı tavan model | L2 router | **~%69** (örnek: flash → flash-lite) |
| Chat/Agent — tekrar eden saf-cevap soru | L1 answer-cache | **%50** (her hit'te o çağrı bedava) |
| Agentic kod yazımı (ponytail) | L4 | ~%20 (referans benchmark) |

> Rakamlar kullanım desenine bağlıdır: tekrarlı/benzer trafikte tasarruf yüksektir; tamamen benzersiz trafikte düşer.

---

## 6. LLM Gateway (OpenAI-Uyumlu)

- Dış uygulamalar standart **OpenAI SDK**'sıyla `serviceurl/v1` adresine bağlanır — kod değişikliği gerekmez.
- **API Key yönetimi**: oluştur/iptal, **model kapsamı** (belirli modeller veya `owner:<sağlayıcı>` joker), **expire süresi** (7/30/90 gün, 1 yıl, süresiz).
- **Models kataloğu**: Anthropic/OpenAI/Gemini'den **canlı** model keşfi + custom sağlayıcı modelleri; arama, filtre, sayfalama, yenile.
- Her çağrı maliyet hattından geçer → otomatik tasarruf + kullanım kaydı.

---

## 7. Agentic Sistem

- **Proje = agent ekibi + workspace**: bir **orchestrator** + çok sayıda **specialist** (backend, frontend, QA, docs…).
- **Orchestrator = katı koordinatör**: kendisi iş yapmaz, işi doğru specialist'e **delege eder** (backend işi → backend ajanı vb.).
- **Gerçek dosya yazımı**: agent'lar tool-use (function calling) ile workspace'e **gerçekten dosya yazar** (sandbox'lı; path-traversal engelli). Her değişiklik `file_changes`'e kaydedilir.
- **Chat sekmesi**: herhangi bir agent'la sohbet + canlı tool aktivitesi (`📝 wrote …`, `→ delegated to backend`) + **workspace paneli** (dizin ağacı + bu sohbette değişen dosyalar, tıkla-önizle).
- **Knowledge dokümanları**: projeye eklenen belgeler tüm agent'ların bağlamına otomatik enjekte edilir.
- **Güvenlik sınırları**: iterasyon limiti, delegasyon derinliği limiti, workspace sandbox.

---

## 8. Sağlayıcı Bağımsızlığı

- **Built-in**: Anthropic, OpenAI, Gemini (Settings'te key).
- **Custom LLM Providers**: DeepSeek, Azure AI Foundry, yerel (Ollama/LM Studio), OpenRouter veya herhangi bir **OpenAI-/Anthropic-uyumlu** uç nokta — model başına fiyat (USD/1M token) ve **seviye (1–10)** tanımlanır.
- Tek **unified client** tüm sağlayıcılar için **normalize edilmiş token kullanımı** döner → maliyet her sağlayıcıda ölçülebilir.

---

## 9. Analytics & Usage Paneli

- **Proje Analytics**: token/maliyet (zaman aralığı filtreli), savings-by-layer (L0–L3), cache hit oranı, router kademeleri, modele göre dağılım, son çağrılar.
- **Organizasyon Usage** (Settings → Usage): üstte birleşik özet (input/output/cost/saved) + model başı tablo; altta **Agentic** (proje filtreli) ve **Gateway** (key + model filtreli) ayrı panelleri.

---

## 10. Kalite & Mühendislik

- **75 otomatik test** (vitest), `tsc` ile uçtan uca tip güvenliği.
- Dayanıklılık: Qdrant/embedder erişilemezse sessizce cache atlanır (sistem durmaz).
- Hot-reload geliştirme (`tsx watch` + Vite HMR).
- 4 ayrı dokümantasyon (ARCHITECTURE / AGENTS / GATEWAY / COST_OPTIMIZATION).

---

## Özet — Neden Değerli?

1. **Tek noktadan çok-sağlayıcı**: tüm modeller tek OpenAI-uyumlu kapıdan, kod değişmeden.
2. **Otomatik maliyet tasarrufu**: 5+ katman (L0–L4) + akıllı cache & routing — tekrarlı trafikte **%50–80**.
3. **Gerçekten iş yapan agent'lar**: dosya yazan, delege eden, koordine olan ekip.
4. **Tam ölçümleme**: her çağrı, her katman, her tasarruf rakamla Analytics'te.
5. **Sağlayıcı-bağımsız & kurumsal**: API key kapsamı/expire, kullanım takibi, audit için kayıt.
