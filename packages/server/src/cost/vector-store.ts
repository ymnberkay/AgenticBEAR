/**
 * Qdrant vektör deposu — REST/fetch üzerinden (ekstra paket yok).
 * Tek collection; entry'ler payload.namespace ile (role/agent) ayrılır.
 * Erişilemezse metodlar hata fırlatır; semantic-cache yakalayıp L2'ye düşer.
 */
import { randomUUID } from 'node:crypto';
import { costConfig } from './config.js';
import type { CachePayload, VectorStore } from './types.js';

function nsFilter(namespace: string) {
  return { must: [{ key: 'namespace', match: { value: namespace } }] };
}

export class QdrantStore implements VectorStore {
  private base = costConfig.semanticCache.qdrantUrl.replace(/\/$/, '');
  private collection = costConfig.semanticCache.collection;
  private ensured = false;

  private async req(path: string, method: string, body?: unknown): Promise<Response> {
    return fetch(`${this.base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async ensureCollection(dim: number): Promise<void> {
    if (this.ensured) return;
    const head = await this.req(`/collections/${this.collection}`, 'GET');
    if (head.ok) {
      this.ensured = true;
      return;
    }
    const res = await this.req(`/collections/${this.collection}`, 'PUT', {
      vectors: { size: dim, distance: 'Cosine' },
    });
    if (!res.ok) throw new Error(`Qdrant collection oluşturulamadı (${res.status}): ${await res.text()}`);
    this.ensured = true;
  }

  async upsert(point: { id: string; vector: number[]; payload: CachePayload }): Promise<void> {
    const res = await this.req(`/collections/${this.collection}/points?wait=true`, 'PUT', {
      points: [{ id: point.id || randomUUID(), vector: point.vector, payload: point.payload }],
    });
    if (!res.ok) throw new Error(`Qdrant upsert hatası (${res.status}): ${await res.text()}`);
  }

  async search(
    namespace: string,
    vector: number[],
    topK: number,
  ): Promise<Array<{ score: number; payload: CachePayload }>> {
    const res = await this.req(`/collections/${this.collection}/points/search`, 'POST', {
      vector,
      limit: topK,
      filter: nsFilter(namespace),
      with_payload: true,
    });
    if (!res.ok) throw new Error(`Qdrant search hatası (${res.status}): ${await res.text()}`);
    const data = (await res.json()) as { result: Array<{ score: number; payload: CachePayload }> };
    return data.result ?? [];
  }

  async findByHash(namespace: string, hash: string): Promise<CachePayload | null> {
    const res = await this.req(`/collections/${this.collection}/points/scroll`, 'POST', {
      filter: {
        must: [
          { key: 'namespace', match: { value: namespace } },
          { key: 'promptHash', match: { value: hash } },
        ],
      },
      limit: 1,
      with_payload: true,
    });
    if (!res.ok) throw new Error(`Qdrant scroll hatası (${res.status}): ${await res.text()}`);
    const data = (await res.json()) as { result: { points: Array<{ payload: CachePayload }> } };
    return data.result?.points?.[0]?.payload ?? null;
  }

  async deleteByNamespace(namespace: string): Promise<void> {
    const res = await this.req(`/collections/${this.collection}/points/delete?wait=true`, 'POST', {
      filter: nsFilter(namespace),
    });
    if (!res.ok) throw new Error(`Qdrant delete hatası (${res.status}): ${await res.text()}`);
  }
}
