/**
 * Embedding sağlayıcısı. Anthropic embedding sunmadığı için Voyage AI (voyage-3) kullanılır.
 * Sağlayıcı config'ten seçilir (voyage | local). Erişilemezse embed() hata fırlatır;
 * semantic-cache bunu yakalayıp L2'ye düşer (cache hiç yokmuş gibi).
 */
import { createLogger } from '../utils/logger.js';
import { costConfig } from './config.js';
import type { Embedder } from './types.js';

const log = createLogger('cost:embed');

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

/**
 * Yerel embedding sağlayıcısı (bge-small / all-MiniLM) bu ortamda kurulu değil.
 * available() false döner → L1 sessizce devre dışı kalır. Kurmak için ayrı bir
 * yerel embedding servisi gerekir; o zaman bu sınıf HTTP ile ona bağlanır.
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
  cached = costConfig.semanticCache.embeddingProvider === 'local'
    ? new LocalEmbedder()
    : new VoyageEmbedder();
  return cached;
}
