# Troubleshooting

## Connection

### `ECONNREFUSED 127.0.0.1:8080`

Proxy is not running. Start it: `npm start`.

### SSL / `UNABLE_TO_VERIFY_LEAF_SIGNATURE`

GigaChat uses self-signed certificates. The proxy handles this automatically via `rejectUnauthorized: false`. If you call GigaChat directly, add the same setting to your HTTP client.

## Authentication

### `GigaChat OAuth failed: 401`

- **Wrong credentials.** Verify your base64 key in [Sber Studio](https://developers.sber.ru/studio/).
- **Expired key.** Regenerate in Sber Studio.
- **Wrong scope.** Ensure `GIGACHAT_DEFAULT_SCOPE` matches your account type (`PERS`, `B2B`, `CORP`).

### `403 Forbidden`

- Scope mismatch. Check your access level.
- Some features (e.g. vision, certain models) may require `B2B` or `CORP`.

## Chat

### Streaming hangs / no `[DONE]`

Check proxy logs. If GigaChat itself hangs, the proxy will wait indefinitely. Restart the proxy and retry.

### Tool calls not appearing

- **Non-streaming:** Proxy converts `function_call` → `tool_calls[]`. Working correctly.
- **Streaming:** Proxy converts `delta.function_call` → `delta.tool_calls`. If your client still uses the legacy format, check your client library version.
- **GigaChat limit:** Only one function call per request.

## Embeddings

### `402 Payment Required` or `403 Forbidden`

Older PERS accounts may not support embeddings. Solutions:
1. Upgrade in Sber Studio
2. Use `GIGACHAT_API_B2B` scope
3. Create a new PERS account (new ones have embeddings enabled)

## Vision

### `Image too large`

Max 15 MB per image. Resize or compress before sending.

### Images not processed

- Only `GigaChat-2-Max` and `GigaChat-2-Pro` support vision.
- Max 1 image per message, 10 per conversation.
- If the image URL is unreachable, the proxy continues without it and logs a warning.

## Rate Limits

### `429 Too Many Requests`

The proxy retries automatically up to 3 times with exponential backoff. If you still see 429, reduce request frequency.

## Useful Commands

```bash
# Health check
curl http://127.0.0.1:8080/health

# List models
curl http://127.0.0.1:8080/v1/models

# Run tests
GIGACHAT_API_KEY=<key> npm test
```
