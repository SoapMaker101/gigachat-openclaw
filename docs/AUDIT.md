# Audit Report — v2.3 → v2.4

Findings from full audit of the v2.3 codebase. All items fixed in v2.4.

## Critical Bugs Fixed

| # | Bug | Fix in v2.4 |
|---|-----|-------------|
| 1 | `response.buffer()` crashes in node-fetch v3 | Replaced with `response.arrayBuffer()` + `Buffer.from()` |
| 2 | No multipart middleware → `/v1/files` upload always fails | Added `multer` to deps + configured in `routes/files.js` |

## Medium Bugs Fixed

| # | Bug | Fix |
|---|-----|-----|
| 3 | `_isStructuredOutput` flag leaked to GigaChat API body | Mapper now returns `{ body, isStructuredOutput, imageUrls }` — no internal flags on body |
| 4 | `_imageUrls` marker leaked on failed-upload messages | All messages cleaned; `uploadImagesAndAttach()` always strips internal markers |
| 5 | Streaming `function_call` not converted to `tool_calls` | `gigaChatChunkToOpenAISSE()` now maps `delta.function_call` → `delta.tool_calls` |
| 6 | `split(':')` in AuthManager.getStats() breaks on base64 keys | Cache key uses null-byte separator `\0` instead of `:` |

## Structural Improvements

| # | Issue | Fix |
|---|-------|-----|
| 7 | Duplicate `sleep()` in chat.js and embeddings.js | Extracted to `lib/utils.js` |
| 8 | Duplicate ~80-line retry logic in 2 routes | Extracted to `lib/gigachat-client.js` — single `callGigaChat()` |
| 9 | No 403 handler in chat route | `callGigaChat()` handles 403 for all routes |
| 10 | No `RqUID` on GET/DELETE file requests | All file routes now include `RqUID` header |
| 11 | Version hardcoded in 3 places | `config.js` reads from `package.json`; all others reference `config.version` |
| 12 | Scope resolution inconsistent across routes | All routes use same pattern via shared helper |
| 13 | `logLevel` config defined but never used | Removed |
