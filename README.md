# GigaChat OpenClaw Proxy v2.4

OpenAI-compatible HTTP proxy for [GigaChat API](https://developers.sber.ru/docs/ru/gigachat/api/main) (Sber).  
Plug it into OpenClaw, LangChain, OpenAI SDK, or any tool that speaks the OpenAI protocol.

## Features

| Feature | Status |
|---------|--------|
| Chat completions (non-stream & SSE) | ✅ |
| Function/tool calling (OpenAI tools ↔ GigaChat functions) | ✅ |
| Structured Output (JSON Schema via function emulation) | ✅ |
| Vision / image input (auto-upload to /files) | ✅ |
| Embeddings (1024-dim & 2560-dim models) | ✅ |
| Files API proxy (upload, list, delete) | ✅ |
| OAuth2 token management (auto-refresh 5 min before expiry) | ✅ |
| Smart retries (401 → refresh; 429 → backoff; 500 → retry) | ✅ |
| SSL handling (Sber self-signed certs) | ✅ |

## Quick Start

```bash
cd gigachat_openclaw
npm install
npm start            # http://127.0.0.1:8080
```

Test:

```bash
GIGACHAT_API_KEY=<base64-key> npm test
```

## Usage

```bash
# Chat
curl http://127.0.0.1:8080/v1/chat/completions \
  -H "Authorization: Bearer <KEY>" \
  -H "Content-Type: application/json" \
  -d '{"model":"GigaChat-2-Max","messages":[{"role":"user","content":"Привет!"}]}'

# Streaming
# same request + "stream": true

# Embeddings
curl http://127.0.0.1:8080/v1/embeddings \
  -H "Authorization: Bearer <KEY>" \
  -H "Content-Type: application/json" \
  -d '{"model":"Embeddings","input":["text"]}'

# Structured Output
# same chat request + "response_format":{"type":"json_schema","json_schema":{...}}

# Vision
# message content as array: [{"type":"text","text":"..."}, {"type":"image_url","image_url":{"url":"..."}}]
```

## OpenClaw Integration

Copy `openclaw.config.example.json` to your OpenClaw config directory, then:

```bash
openclaw auth add gigachat   # enter your base64 key
openclaw chat --model GigaChat-2-Max --message "Привет!"
```

## Configuration

All via environment variables (see `.env.example`):

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | Server port |
| `HOST` | `127.0.0.1` | Bind address |
| `GIGACHAT_API_URL` | `https://gigachat.devices.sberbank.ru/api/v1` | GigaChat API |
| `GIGACHAT_AUTH_URL` | `https://ngw.devices.sberbank.ru:9443/api/v2/oauth` | OAuth endpoint |
| `GIGACHAT_DEFAULT_SCOPE` | `GIGACHAT_API_PERS` | `PERS` / `B2B` / `CORP` |
| `TOKEN_REFRESH_BUFFER_MS` | `300000` (5 min) | Refresh before expiry |

## Models

| Chat Model | Context | Vision |
|------------|---------|--------|
| GigaChat-2-Max | 128 K | ✅ |
| GigaChat-2-Pro | 128 K | ✅ |
| GigaChat-2-Lite | 128 K | — |

| Embeddings Model | Dimensions |
|------------------|------------|
| Embeddings | 1024 |
| Embeddings-2 | 1024 |
| EmbeddingsGigaR | 2560 |

## Limitations

- **One function call per request** (GigaChat API limitation).
- **One image per message**, max 10 images per conversation.
- **Vision** only on `GigaChat-2-Max` / `GigaChat-2-Pro`.

## Project Structure

```
gigachat_openclaw/
├── src/
│   ├── server.js              # Express entry point
│   ├── config.js              # Reads env + package.json version
│   ├── lib/
│   │   ├── auth-manager.js    # OAuth token lifecycle
│   │   ├── gigachat-client.js # Shared fetch+retry logic
│   │   ├── mapper.js          # OpenAI ↔ GigaChat conversion
│   │   ├── stream-handler.js  # SSE piping
│   │   ├── file-manager.js    # Image download/upload for vision
│   │   ├── ssl-agent.js       # HTTPS agent
│   │   └── utils.js           # sleep, convertErrorToOpenAI
│   └── routes/
│       ├── chat.js            # POST /v1/chat/completions
│       ├── embeddings.js      # POST /v1/embeddings
│       ├── files.js           # /v1/files CRUD
│       ├── models.js          # GET /v1/models
│       └── health.js          # GET /health, GET /
├── tests/
│   ├── test_proxy.js          # Main suite (5 checks)
│   ├── test_structured_output.js
│   └── test_vision.js
├── docs/
│   ├── ARCHITECTURE.md
│   ├── TROUBLESHOOTING.md
│   └── AUDIT.md
├── .env.example
├── openclaw.config.example.json
└── package.json
```

## Links

- **GigaChat API docs:** <https://developers.sber.ru/docs/ru/gigachat/api/main>
- **GigaChat JS SDK (GigaChain):** <https://developers.sber.ru/docs/ru/gigachain/tools/js/gigachat>
- **LiteLLM GigaChat:** <https://docs.litellm.ai/docs/providers/gigachat>
- **Sber Studio (get keys):** <https://developers.sber.ru/studio/>

## License

MIT
