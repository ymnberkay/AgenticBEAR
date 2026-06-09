/**
 * Embedding sağlayıcısı — L1 semantic cache için. Provider seçimi config'ten gelir
 * (gemini | voyage | openai | local). Erişilemezse embed() hata fırlatır; semantic-cache
 * bunu yakalayıp L2'ye düşer (cache hiç yokmuş gibi).
 *
 * LLM provider'dan bağımsızdır — Gemini agent'ı bir prompt sorduğunda da, OpenAI agent'ı
 * sorduğunda da TEK bir embedder kullanılır. Yoksa farklı embedder'lar farklı vektör uzaylarında
 * çalıştığı için cache eşleşmesi olmaz (her sorgu kendi embedder'ının cache'ini sadece görür).
 */
import { createLogger } from '../utils/logger.js';
import { settingsRepo } from '../db/repositories/settings.repo.js';
import { providerRepo } from '../db/repositories/provider.repo.js';
import { costConfig } from './config.js';
import type { Embedder } from './types.js';

const log = createLogger('cost:embed');

/**
 * Custom provider'larda model id prefix'i eşleşen ilk enabled provider'ın API key'i.
 * Kullanıcı top-level settings.{provider}ApiKey set etmemişse buradan yakalanır
 * (örn. Gemini'i custom 'openai-compatible' provider olarak eklemişse).
 */
function findKeyFromCustomProviders(modelPrefixes: string[]): string {
  try {
    for (const p of providerRepo.findAll()) {
      if (p.enabled === false) continue;
      if (!p.apiKey) continue;
      if (p.models.some((m) => modelPrefixes.some((pref) => m.id.startsWith(pref)))) {
        return p.apiKey;
      }
    }
  } catch {
    // DB hazır değilse sessizce geç
  }
  return '';
}

/** Gemini text-embedding-004 — settings/env/custom-provider sırasıyla key'i bulur. */
class GeminiEmbedder implements Embedder {
  private getKey(): string {
    try {
      const k = settingsRepo.getSettings().geminiApiKey;
      if (k) return k;
    } catch {
      // DB henüz başlatılmadıysa atla
    }
    if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
    return findKeyFromCustomProviders(['gemini-']);
  }

  available(): boolean {
    return !!this.getKey();
  }

  async embed(text: string): Promise<number[]> {
    const apiKey = this.getKey();
    if (!apiKey) throw new Error('GEMINI_API_KEY tanımlı değil (settings veya env)');

    const model = costConfig.semanticCache.geminiModel;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: `models/${model}`,
        content: { parts: [{ text }] },
      }),
    });

    if (!res.ok) {
      throw new Error(`Gemini embedding hatası (${res.status}): ${await res.text()}`);
    }

    const data = (await res.json()) as { embedding?: { values: number[] } };
    const vec = data.embedding?.values;
    if (!vec || vec.length === 0) throw new Error('Gemini boş embedding döndürdü');
    return vec;
  }
}

class VoyageEmbedder implements Embedder {
  available(): boolean {
    return !!process.env.VOYAGE_API_KEY;
  }

  async embed(text: string): Promise<number[]> {
    const apiKey = process.env.VOYAGE_API_KEY;
    if (!apiKey) throw new Error('VOYAGE_API_KEY tanımlı değil');

    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ input: [text], model: costConfig.semanticCache.voyageModel }),
    });

    if (!res.ok) {
      throw new Error(`Voyage embedding hatası (${res.status}): ${await res.text()}`);
    }

    const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
    const vec = data.data[0]?.embedding;
    if (!vec || vec.length === 0) throw new Error('Voyage boş embedding döndürdü');
    return vec;
  }
}

/** OpenAI text-embedding-3-small — settings/env/custom-provider sırasıyla key'i bulur. */
class OpenAiEmbedder implements Embedder {
  private getKey(): string {
    try {
      const k = settingsRepo.getSettings().openAiApiKey;
      if (k) return k;
    } catch {
      // DB henüz başlatılmadıysa atla
    }
    if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
    return findKeyFromCustomProviders(['gpt-', 'o1-', 'o3-']);
  }

  available(): boolean {
    return !!this.getKey();
  }

  async embed(text: string): Promise<number[]> {
    const apiKey = this.getKey();
    if (!apiKey) throw new Error('OPENAI_API_KEY tanımlı değil (settings veya env)');

    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ input: text, model: costConfig.semanticCache.openaiModel }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI embedding hatası (${res.status}): ${await res.text()}`);
    }

    const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
    const vec = data.data[0]?.embedding;
    if (!vec || vec.length === 0) throw new Error('OpenAI boş embedding döndürdü');
    return vec;
  }
}

/**
 * Yerel embedding sağlayıcısı (bge-small / all-MiniLM) bu ortamda kurulu değil.
 * available() false döner → L1 sessizce devre dışı kalır.
 */
class LocalEmbedder implements Embedder {
  private warned = false;
  available(): boolean {
    if (!this.warned) {
      log.warn('Yerel embedding sağlayıcısı kurulu değil; L1 semantic cache devre dışı.');
      this.warned = true;
    }
    return false;
  }
  async embed(): Promise<number[]> {
    throw new Error('Yerel embedding sağlayıcısı uygulanmadı');
  }
}

let cached: Embedder | null = null;

export function getEmbedder(): Embedder {
  if (cached) return cached;
  switch (costConfig.semanticCache.embeddingProvider) {
    case 'gemini':
      cached = new GeminiEmbedder();
      break;
    case 'openai':
      cached = new OpenAiEmbedder();
      break;
    case 'local':
      cached = new LocalEmbedder();
      break;
    case 'voyage':
    default:
      cached = new VoyageEmbedder();
      break;
  }
  return cached;
}

/** Test ve config reload için. */
export function resetEmbedderCache(): void {
  cached = null;
}
