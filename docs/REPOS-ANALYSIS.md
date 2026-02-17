# Анализ репозиториев — финальный отчёт

---

## 🔥 Главное открытие: gpt2giga

**`gpt2giga`** — это **готовый, зрелый, production-grade прокси** OpenAI → GigaChat на Python/FastAPI.  
Он решает **ту же самую задачу**, что и наш `gigachat_openclaw`, но:

| Критерий | Наш прокси (Node.js) | gpt2giga (Python) |
|----------|----------------------|-------------------|
| Язык | Node.js / Express | Python / FastAPI |
| Поддержка OpenAI API | ✅ Chat, Embeddings, Files | ✅ Chat, Embeddings, Files + **Responses API** |
| Поддержка Anthropic | ❌ | ✅ `/v1/messages` |
| Auth | OAuth с кэшем | OAuth + **pass-token** + **user/pass** |
| Streaming | ✅ SSE | ✅ SSE + error events |
| Tools | ✅ tools → functions | ✅ + **$ref resolution** + reserved names |
| Structured Output | ✅ function emulation | ✅ function emulation |
| Vision | ✅ upload → attachments | ✅ + **SSRF protection** + кэш SHA256 |
| SSL | rejectUnauthorized: false | Custom CA bundle + cert files |
| Retries | ✅ 401/429/500 | ✅ через gigachat SDK |
| Security | Базовый | **PROD mode**, API key, CORS, SSRF filter |
| Logging | console.log | **loguru** + sensitive data redaction |
| Deployment | npm start | **Docker**, uvicorn, DEV/PROD modes |

### Вывод по gpt2giga

**Два варианта:**

**Вариант A:** Использовать `gpt2giga` как есть.
```bash
pip install gpt2giga
GIGACHAT_CREDENTIALS=<key> gpt2giga --port 8080
```
Плюсы: Зрелый, протестированный, поддерживается сообществом.
Минусы: Python (нужен Python на сервере), нет контроля над кодом.

**Вариант B:** Оставить наш `gigachat_openclaw` (Node.js).
Плюсы: Полный контроль, Node.js (ближе к OpenClaw), можно кастомизировать.
Минусы: Менее зрелый, нужно самим поддерживать.

**Рекомендация:** Если нужно быстро запустить — **gpt2giga**. Если нужна кастомизация и Node.js стек — наш прокси, но заимствуя идеи из gpt2giga.

---

## 📋 OpenClaw — как вызывает провайдеров

### API типы

OpenClaw поддерживает 7 API типов:
```
openai-completions      ← наш случай
openai-responses
anthropic-messages
google-generative-ai
github-copilot
bedrock-converse-stream
ollama
```

Для GigaChat нужен `"api": "openai-completions"`.

### Конфигурация провайдера

```json
{
  "baseUrl": "http://127.0.0.1:8080/v1",
  "apiKey": "<key>",
  "api": "openai-completions",
  "models": [{"id": "GigaChat-2-Max", "contextWindow": 131072}]
}
```

### Что OpenClaw отправляет

**Запрос:**
```
POST {baseUrl}/chat/completions
Authorization: Bearer {apiKey}
Content-Type: application/json

{
  "model": "GigaChat-2-Max",
  "messages": [...],
  "stream": true,
  "user": "..."
}
```

**Ожидает в ответе (streaming):**
```
data: {"id":"...","object":"chat.completion.chunk","choices":[{"delta":{"content":"..."}}]}\n\n
data: [DONE]\n\n
```

**Tool calls в ответе:**
```json
{
  "tool_calls": [{"id": "...", "type": "function", "function": {"name": "...", "arguments": "..."}}]
}
```

### Embeddings

```
POST {baseUrl}/embeddings
{
  "model": "...",
  "input": ["text"]
}
```

Ответ: `{ "data": [{"embedding": [...]}] }`

### Совместимость с нашим прокси

| Что OpenClaw отправляет | Наш прокси | Статус |
|------------------------|------------|--------|
| POST /v1/chat/completions | ✅ Обрабатываем | ✅ |
| Authorization: Bearer | ✅ Извлекаем apiKey | ✅ |
| messages array | ✅ Конвертируем роли | ✅ |
| stream: true | ✅ SSE с [DONE] | ✅ |
| tool_calls в ответе | ✅ function_call → tool_calls | ✅ |
| POST /v1/embeddings | ✅ Обрабатываем | ✅ |
| GET /v1/models | ✅ Возвращаем список | ✅ |
| Поле `user` в запросе | ⚠️ Игнорируем (не критично) | ⚠️ |

**Вывод:** Наш прокси **совместим** с OpenClaw по контракту `openai-completions`.

---

## 📚 Официальные SDK (gigachat, gigachat-java)

### Что полезного нашли

**1. OAuth может возвращать `tok`/`exp` вместо `access_token`/`expires_at`**

Python SDK обрабатывает оба варианта:
```python
access_token = data.get("access_token") or data.get("tok")
expires_at = data.get("expires_at") or data.get("exp")
```

→ **Наш прокси обрабатывает только `access_token`/`expires_at`.** Стоит добавить fallback.

**2. Буфер обновления токена = 60 секунд (не 5 минут)**

Оба SDK используют 60-секундный буфер. Наш прокси использует 5 минут — это более агрессивно, но безопаснее.

**3. Заголовки `X-Request-ID`, `X-Session-ID`, `X-Client-ID`**

GigaChat API поддерживает трекинг-заголовки. Мы отправляем `RqUID`, но не `X-Request-ID` и `X-Session-ID`.

**4. `User-Agent` header**

SDK отправляют `User-Agent: GigaChat-python-lib` / `GigaChat-java-lib`. Мы не отправляем.

**5. `storage` объект для stateful conversations**

Python SDK поддерживает `storage: { is_stateful, limit, thread_id, assistant_id }`. Мы не обрабатываем (не критично для базового use case).

**6. `functions_state_id` в ответах**

При использовании встроенных функций (text2image, get_file_content) GigaChat возвращает `functions_state_id`. Мы не прокидываем его обратно.

---

## 🎯 Что заимствовать из gpt2giga

| # | Идея | Сложность | Приоритет |
|---|------|-----------|-----------|
| 1 | **$ref resolution** в JSON Schema для tools | Средняя | Высокий — без этого сложные schemas ломают GigaChat |
| 2 | **SSRF protection** при скачивании изображений | Низкая | Высокий для production |
| 3 | **Image caching** с SHA256 хэшем и TTL | Низкая | Средний |
| 4 | **Anthropic API** поддержка (/v1/messages) | Высокая | Низкий (если нужна) |
| 5 | **DEV/PROD modes** с разным уровнем security | Низкая | Средний |
| 6 | **Sensitive data redaction** в логах | Низкая | Высокий для production |
| 7 | **Token passthrough** (forward auth header) | Низкая | Средний |

---

## 🎯 Что исправить в нашем прокси

### Критично (для совместимости)

| # | Что | Где | Описание |
|---|-----|-----|----------|
| 1 | OAuth fallback `tok`/`exp` | `auth-manager.js` | GigaChat может вернуть `tok` вместо `access_token` |
| 2 | $ref resolution | `mapper.js` | JSON Schema с $ref ломает GigaChat |

### Желательно (для production)

| # | Что | Где |
|---|-----|-----|
| 3 | SSRF protection в FileManager | `file-manager.js` |
| 4 | `User-Agent` header | `gigachat-client.js` |
| 5 | Redact tokens в логах | Все файлы с console.log |

### Не критично

| # | Что | Описание |
|---|-----|----------|
| 6 | `X-Session-ID` header | Полезно для дебага на стороне Сбера |
| 7 | `functions_state_id` прокидывание | Нужно если используются встроенные функции GigaChat |
| 8 | Поле `user` из запроса | OpenClaw может передавать, мы игнорируем |

---

## 📊 Итоговая таблица совместимости

```
OpenClaw ──(openai-completions)──→ Наш Прокси ──(GigaChat API)──→ GigaChat
                                      │
                                      │  Альтернатива:
                                      │
OpenClaw ──(openai-completions)──→ gpt2giga ──(GigaChat SDK)──→ GigaChat
```

| Фича | OpenClaw ожидает | Наш прокси | gpt2giga |
|------|-----------------|------------|----------|
| Chat | ✅ | ✅ | ✅ |
| Streaming SSE | ✅ data: [DONE] | ✅ | ✅ |
| tool_calls формат | ✅ [{id,type,function}] | ✅ | ✅ |
| Embeddings | ✅ /v1/embeddings | ✅ | ✅ |
| Models list | ✅ /v1/models | ✅ | ✅ |
| Vision | — (зависит от агента) | ✅ | ✅ |
| Structured Output | — (зависит от агента) | ✅ | ✅ |
| $ref в schemas | Возможно | ❌ | ✅ |
| SSRF protection | — | ❌ | ✅ |

---

## 🏁 Рекомендации

### Путь 1: Быстрый запуск (gpt2giga)

```bash
pip install gpt2giga
GIGACHAT_CREDENTIALS=<key> gpt2giga --port 8080
```

Обнови конфиг OpenClaw:
```json
{
  "baseUrl": "http://127.0.0.1:8080/v1",
  "api": "openai-completions"
}
```

**Плюсы:** Работает прямо сейчас. Production-ready.
**Минусы:** Python dependency.

### Путь 2: Свой прокси (gigachat_openclaw)

```bash
cd gigachat_openclaw && npm install && npm start
```

**Плюсы:** Node.js, полный контроль, тот же стек что OpenClaw.
**Минусы:** Нужно тестировать и поддерживать.

### Путь 3: Гибрид

Использовать `gpt2giga` для быстрого запуска, параллельно допиливать `gigachat_openclaw` заимствуя лучшие идеи. Когда свой прокси стабилен — переключиться.

---

## 🔗 Ссылки

- **GigaChat API:** https://developers.sber.ru/docs/ru/gigachat/api/main
- **GigaChain JS SDK:** https://developers.sber.ru/docs/ru/gigachain/tools/js/gigachat
- **LiteLLM GigaChat:** https://docs.litellm.ai/docs/providers/gigachat
- **gpt2giga (PyPI):** https://pypi.org/project/gpt2giga/
- **Sber Studio:** https://developers.sber.ru/studio/
