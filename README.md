# AgenticBEAR — SubAgent Manager

Multi-agent orchestration platform. Agent'lar oluştur, takımlara ekle, VS Code'dan MCP ile kullan.

## MCP Entegrasyonu

AgenticBEAR, projelerindeki agent'ları VS Code ve diğer MCP destekli editörlere **Model Context Protocol (MCP)** üzerinden expose eder.

### Kurulum

#### 1. API Key'leri ayarla

`.env` dosyana OpenAI ve/veya Gemini key'lerini ekle (Anthropic key'i uygulama içinden Settings sayfasından girilir):

```env
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=AI...
```

#### 2. Sunucuyu başlat

```bash
npm run dev
```

Sunucu `http://localhost:3001` üzerinde çalışır.

#### 3. Proje ID'ni öğren

Uygulamada bir proje oluştur. Proje ID'si URL'de görünür:
```
http://localhost:5173/projects/PROJE_ID/agents
```

### VS Code Bağlantısı

VS Code ayarlarına (`settings.json`) ekle:

```json
{
  "mcpServers": {
    "agenticbear": {
      "url": "http://localhost:3001/mcp/projects/PROJE_ID"
    }
  }
}
```

`PROJE_ID` yerine kendi proje ID'ni yaz.

### Cursor Bağlantısı

`.cursor/mcp.json` dosyasına ekle:

```json
{
  "mcpServers": {
    "agenticbear": {
      "url": "http://localhost:3001/mcp/projects/PROJE_ID"
    }
  }
}
```

### Mevcut MCP Tool'ları

| Tool | Açıklama |
|------|----------|
| `ask_orchestrator` | Soruyu orkestratör aracılığıyla otomatik en uygun agent'a yönlendir |
| `ask_agent` | Belirli bir agent'a direkt soru sor |
| `list_agents` | Projedeki tüm agent'ları ve bilgilerini listele |
| `multi_agent_discuss` | Birden fazla agent'a aynı konuyu paralel sor, tüm cevapları topla |

### Endpoint'ler

```
GET  /mcp/projects/:projectId   → SSE bağlantısı
POST /mcp/messages              → MCP mesaj handler (?sessionId=...)
POST /mcp/cache/invalidate      → Cache temizle { "projectId": "..." }
GET  /health/mcp                → Sağlık durumu ve aktif session sayısı
```

### Desteklenen Modeller

| Provider | Modeller |
|----------|----------|
| Anthropic | claude-opus-4, claude-sonnet-4, claude-haiku-4.5 |
| OpenAI | gpt-4o, gpt-4o-mini, o1, o3, o3-mini |
| Google | gemini-* |
