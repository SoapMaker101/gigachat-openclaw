# RAG (Retrieval-Augmented Generation) — GigaChat OpenClaw Proxy

## Overview

The proxy now includes a built-in RAG workflow powered by GigaChat's native `Embeddings` model.  
Documents are indexed as vectors in an in-memory store, and semantic search retrieves the most relevant chunks for any query.

**No external vector database required** — everything runs inside the proxy process.

## Architecture

```
┌────────────┐   POST /v1/rag/index    ┌──────────────┐    GigaChat     ┌──────────────┐
│   Client    │ ──────────────────────► │  Proxy RAG   │ ─ Embeddings ─► │  GigaChat    │
│             │   POST /v1/rag/query    │  Endpoints   │ ◄──────────────  │  API         │
│             │ ◄────────────────────── │              │                  │              │
└────────────┘                         │  VectorStore  │                  └──────────────┘
                                       │  (in-memory)  │
                                       └──────────────┘
```

## Endpoints

All endpoints require `Authorization: Bearer <your-gigachat-api-key>` (same key used for chat).

### 1. Index Documents

```http
POST /v1/rag/index
Content-Type: application/json
Authorization: Bearer <GIGACHAT_API_KEY>

{
  "docs": [
    { "id": "doc1", "text": "OpenClaw is an AI assistant platform...", "metadata": { "source": "readme" } },
    { "id": "doc2", "text": "GigaChat supports embeddings via the Embeddings model...", "metadata": { "source": "docs" } }
  ],
  "model": "Embeddings"
}
```

**Response:**
```json
{ "ok": true, "indexed": 2, "total": 2 }
```

**Supported models:** `Embeddings`, `Embeddings-2`, `EmbeddingsGigaR`

### 2. Query (Semantic Search)

```http
POST /v1/rag/query
Content-Type: application/json
Authorization: Bearer <GIGACHAT_API_KEY>

{
  "query": "How does OpenClaw work?",
  "topK": 3,
  "model": "Embeddings"
}
```

**Response:**
```json
{
  "results": [
    { "id": "doc1", "text": "OpenClaw is an AI assistant platform...", "score": 0.92, "metadata": { "source": "readme" } },
    { "id": "doc2", "text": "GigaChat supports embeddings...", "score": 0.78, "metadata": { "source": "docs" } }
  ]
}
```

### 3. Stats

```http
GET /v1/rag/stats
```

**Response:**
```json
{ "totalDocuments": 42, "embeddingDimension": 1024 }
```

### 4. Clear Store

```http
DELETE /v1/rag/clear
```

**Response:**
```json
{ "ok": true, "cleared": 42 }
```

## Standard Embeddings Endpoint

The original OpenAI-compatible `/v1/embeddings` endpoint is preserved:

```http
POST /v1/embeddings
Content-Type: application/json
Authorization: Bearer <GIGACHAT_API_KEY>

{
  "input": "Hello world",
  "model": "Embeddings"
}
```

This returns vectors in the standard OpenAI format and can be used by any OpenAI-compatible client (LangChain, LlamaIndex, etc.).

## Full RAG Workflow Example

### Step 1: Index your documents

```bash
curl -X POST http://localhost:8080/v1/rag/index \
  -H "Authorization: Bearer YOUR_GIGACHAT_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "docs": [
      {"id": "1", "text": "The proxy converts OpenAI format to GigaChat format automatically."},
      {"id": "2", "text": "GigaChat supports function calling via the functions parameter."},
      {"id": "3", "text": "Vision support requires uploading images to GigaChat file storage."}
    ]
  }'
```

### Step 2: Query

```bash
curl -X POST http://localhost:8080/v1/rag/query \
  -H "Authorization: Bearer YOUR_GIGACHAT_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "How do I use function calling?", "topK": 2}'
```

### Step 3: Use results as context for chat

```bash
curl -X POST http://localhost:8080/v1/chat/completions \
  -H "Authorization: Bearer YOUR_GIGACHAT_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "GigaChat-2-Max",
    "messages": [
      {"role": "system", "content": "Answer based on the following context:\n\nGigaChat supports function calling via the functions parameter."},
      {"role": "user", "content": "How do I use function calling?"}
    ]
  }'
```

## Notes

- **In-memory storage**: The vector store lives in process memory. Restarting the proxy clears all indexed documents. For persistence, consider adding disk save/load (the `VectorStore` class supports `saveToDisk()` / `loadFromDisk()`).
- **Authentication**: RAG endpoints use the same GigaChat API key as chat/embeddings. The key is passed in the `Authorization: Bearer` header.
- **Embedding dimensions**: GigaChat's `Embeddings` model produces 1024-dimensional vectors.
- **Batch indexing**: You can index many documents at once. Each document generates one API call to GigaChat Embeddings.

## Environment Variables

No additional env vars needed — RAG uses the same GigaChat API connection as chat. The relevant existing vars:

| Variable | Description | Default |
|----------|-------------|---------|
| `GIGACHAT_API_URL` | GigaChat API base URL | `https://gigachat.devices.sberbank.ru/api/v1` |
| `GIGACHAT_AUTH_URL` | OAuth token endpoint | `https://ngw.devices.sberbank.ru:9443/api/v2/oauth` |
| `GIGACHAT_DEFAULT_SCOPE` | API scope | `GIGACHAT_API_PERS` |
