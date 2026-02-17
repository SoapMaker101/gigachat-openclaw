# Architecture

## Request Flow

```
OpenClaw / curl / OpenAI SDK
    │
    │  POST /v1/chat/completions
    │  Authorization: Bearer <base64-gigachat-credentials>
    │  Body: OpenAI format
    ▼
┌──────────────────────────────────────────┐
│  Express Server (src/server.js)          │
│                                          │
│  1. Extract Bearer key from header       │
│  2. AuthManager → get/refresh OAuth token│
│  3. Mapper → convert OpenAI → GigaChat   │
│     ├─ messages: tool → function         │
│     ├─ tools → functions                 │
│     ├─ response_format → hidden function │
│     └─ image_url → upload to /files      │
│  4. GigaChat Client → POST to Sber API  │
│     └─ retry on 401/429/500             │
│  5. Mapper → convert GigaChat → OpenAI   │
│     ├─ function_call → tool_calls        │
│     └─ structured output → JSON content  │
│  6. Return response                      │
└──────────────────────────────────────────┘
    │
    ▼
GigaChat API (gigachat.devices.sberbank.ru)
  Authorization: Bearer <oauth-token>
  RqUID: <uuid-v4>
```

## Key Modules

### AuthManager (`lib/auth-manager.js`)

- Gets OAuth token from `ngw.devices.sberbank.ru:9443/api/v2/oauth`
- Caches tokens by `apiKey + scope`
- Refreshes 5 minutes before expiry (configurable)
- Uses null-byte separator in cache key (avoids bugs with base64 colons)

### Mapper (`lib/mapper.js`)

Central conversion layer — **no network calls**, pure data transformation.

| Direction | What |
|-----------|------|
| Request → | `openAIRequestToGigaChat()`: messages, tools, response_format, vision |
| ← Response | `gigaChatResponseToOpenAI()`: function_call → tool_calls, structured output |
| ← Stream | `gigaChatChunkToOpenAISSE()`: delta → SSE with tool_calls (not function_call) |
| Embeddings | `openAIEmbeddingsToGigaChat()` / `gigaChatEmbeddingsToOpenAI()` |

Returns `{ body, isStructuredOutput, imageUrls }` — **no internal flags leak to GigaChat**.

### GigaChat Client (`lib/gigachat-client.js`)

Single `callGigaChat()` function used by **all** routes:

- Adds `RqUID` (UUID v4) header to every request
- 401 → refresh token, retry once
- 403 → meaningful error with scope hint
- 429 → exponential backoff (3 retries)
- 500/502/503 → 1 retry after 1 s

### FileManager (`lib/file-manager.js`)

Handles vision image lifecycle:

1. Download image from URL **or** decode base64
2. Build `multipart/form-data` body manually (no `form-data` npm dep needed — raw boundary approach)
3. Upload to `POST /files` with `purpose=general`
4. Return `file_id`
5. Cache `url → file_id` in memory

### Stream Handler (`lib/stream-handler.js`)

Reads GigaChat response body line-by-line, converts each chunk via mapper, writes OpenAI SSE format, ends with `data: [DONE]\n\n`.

## Version Management

Version is read from `package.json` at startup — single source of truth. `GET /health` and server banner both use `config.version`.
