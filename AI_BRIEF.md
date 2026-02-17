# AI / Developer Briefing

> Эта сводка предназначена для нового AI-ассистента или разработчика, который впервые открывает проект.
> Здесь собрано **всё**, чтобы быстро понять что, где и зачем.

---

## 1. Что это?

Проект решает одну задачу: **подключить GigaChat (Sber) к OpenClaw (агентный движок)**.

Между ними стоит **прокси-переводчик**, потому что GigaChat API не совместим с OpenAI:
- Свой OAuth (30-мин токены)
- `functions` вместо `tools`
- Роль `function` вместо `tool`
- SSL-сертификаты Минцифры
- Обязательный заголовок `RqUID`

### Два решения (оба в этой папке):

| | Production (рекомендуется) | Кастомный |
|---|---|---|
| **Что** | `gpt2giga` — готовый Python-прокси | `src/` — наш Node.js прокси |
| **Запуск** | `pip install gpt2giga && gpt2giga` | `npm install && npm start` |
| **Зрелость** | Протестирован сообществом | Написан с нуля, не тестирован на проде |
| **Когда** | Сейчас, для production | Если нужна кастомизация под Node.js |

---

## 2. Быстрый запуск (Production)

```bash
pip install gpt2giga
GIGACHAT_CREDENTIALS=<ключ_из_sber_studio> GIGACHAT_VERIFY_SSL_CERTS=False gpt2giga
```

Ключ берётся из [Sber Studio](https://developers.sber.ru/studio/).

Подробная инструкция развёртывания: **`DEPLOY.md`**

### Быстрый запуск (кастомный Node.js прокси)

```bash
cd gigachat_openclaw
npm install
npm start
GIGACHAT_API_KEY=<base64-key> npm test
```

---

## 3. Структура файлов — что где искать

```
gigachat_openclaw/
│
├── DEPLOY.md               ← ⭐ ГЛАВНЫЙ ФАЙЛ: пошаговое развёртывание gpt2giga + OpenClaw
├── AI_BRIEF.md             ← ЭТО — сводка для AI/разработчика
├── README.md               ← Документация по кастомному Node.js прокси
│
├── systemd/                ← АВТОЗАПУСК на сервере
│   ├── gpt2giga.service    ← systemd unit для gpt2giga
│   └── env.example         ← Пример .env для сервера
│
├── openclaw.config.example.json ← ⭐ Пример конфига OpenClaw для GigaChat
│
├── src/                    ← КАСТОМНЫЙ Node.js ПРОКСИ (v2.4)
│   ├── server.js           ← Express entry point
│   ├── config.js           ← Конфигурация
│   ├── lib/
│   │   ├── auth-manager.js ← OAuth lifecycle
│   │   ├── gigachat-client.js ← Unified fetch + retry
│   │   ├── mapper.js       ← OpenAI ↔ GigaChat conversion
│   │   ├── stream-handler.js ← SSE streaming
│   │   ├── file-manager.js ← Vision image upload
│   │   ├── ssl-agent.js    ← HTTPS agent
│   │   └── utils.js        ← Shared helpers
│   └── routes/
│       ├── chat.js         ← POST /v1/chat/completions
│       ├── embeddings.js   ← POST /v1/embeddings
│       ├── files.js        ← /v1/files CRUD
│       ├── models.js       ← GET /v1/models
│       └── health.js       ← GET /health
│
├── tests/                  ← Тесты для кастомного прокси
│   ├── test_proxy.js
│   ├── test_structured_output.js
│   └── test_vision.js
│
├── docs/                   ← Документация
│   ├── ARCHITECTURE.md     ← Архитектура Node.js прокси
│   ├── TROUBLESHOOTING.md  ← Решение проблем
│   ├── AUDIT.md            ← Аудит и исправления
│   └── REPOS-ANALYSIS.md   ← Сравнение gpt2giga / LiteLLM / OpenClaw
│
├── package.json
├── .env.example
└── .gitignore
```

---

## 4. Ключевые решения

### Почему не прямой вызов GigaChat?

GigaChat API отличается от OpenAI:

| OpenAI | GigaChat | Что делает прокси |
|--------|----------|-------------------|
| `Authorization: Bearer sk-...` | OAuth2 token (30 мин TTL) | AuthManager автоматически получает/обновляет |
| `tools: [{ type: "function", function: {...} }]` | `functions: [{ name, parameters }]` | Mapper конвертирует |
| `role: "tool"` | `role: "function"` | Mapper конвертирует |
| `tool_calls: [{ id, function }]` | `function_call: { name, arguments }` | Mapper конвертирует в обе стороны |
| `response_format: { json_schema }` | Нет | Эмуляция через hidden function |
| `content: [{ type: "image_url" }]` | `attachments: [file_id]` | FileManager загружает → file_id |
| Стандартные SSL | Сертификаты Минцифры | ssl-agent.js |
| Нет `RqUID` | `RqUID: UUID v4` обязателен | gigachat-client.js добавляет |

### Почему единый `gigachat-client.js`?

Раньше каждый роут (`chat.js`, `embeddings.js`) дублировал ~80 строк retry-логики. Теперь одна функция `callGigaChat()` обрабатывает все ошибки:
- 401 → `authManager.refreshToken()` + retry
- 403 → понятное сообщение со scope
- 429 → exponential backoff (до 3 раз)
- 500/502/503 → retry через 1с

### Почему нет `form-data` npm?

`FileManager` строит `multipart/form-data` вручную через `Buffer.concat()` — это убирает зависимость. Для роута `/v1/files` (где клиент шлёт файл) используется `multer`.

---

## 5. Как добавить новую фичу

### Добавить новый endpoint

1. Создай файл в `src/routes/my-route.js`
2. Экспортируй `registerMyRoute(app, authManager, config)`
3. Импортируй в `src/server.js` и вызови `registerMyRoute(app, authManager, config)`

### Добавить новую конвертацию

Весь маппинг в `src/lib/mapper.js`. Добавь новую функцию и экспортируй.

### Добавить новую модель

Обнови массив в `src/routes/models.js`.

---

## 6. Как запустить тесты

```bash
# Все основные (5 проверок)
GIGACHAT_API_KEY=<key> npm test

# Structured Output (JSON Schema)
GIGACHAT_API_KEY=<key> npm run test:structured

# Vision (Image Input)
GIGACHAT_API_KEY=<key> npm run test:vision
```

---

## 7. Внешние ссылки (документация)

### GigaChat API (Sber)

- **Главная:** <https://developers.sber.ru/docs/ru/gigachat/api/main>
- **Chat endpoint:** <https://developers.sber.ru/docs/ru/gigachat/api/reference/rest/post-chat>
- **Embeddings:** <https://developers.sber.ru/docs/ru/gigachat/guides/embeddings>
- **Files:** <https://developers.sber.ru/docs/ru/gigachat/guides/working-with-files>
- **Functions:** <https://developers.sber.ru/docs/ru/gigachat/guides/functions/calling-builtin-functions>
- **Совместимость с OpenAI:** <https://developers.sber.ru/docs/ru/gigachat/guides/openai-compatibility>
- **Sber Studio (ключи):** <https://developers.sber.ru/studio/>

### GigaChain JS SDK

- **Документация:** <https://developers.sber.ru/docs/ru/gigachain/tools/js/gigachat>
  
  Это официальный JS SDK от Сбера. Наш прокси делает то же самое, но в формате HTTP-сервера, совместимого с OpenAI.

### LiteLLM

- **GigaChat provider:** <https://docs.litellm.ai/docs/providers/gigachat>
  
  LiteLLM — Python-библиотека, которая поддерживает GigaChat через свой адаптер. Наш прокси вдохновлён их подходом, но реализован как отдельный HTTP-сервер на Node.js и в некоторых аспектах (retry, vision upload) превосходит их.

---

## 8. Версии и история

| Версия | Что |
|--------|-----|
| v1.0 | Базовый прокси (много багов) |
| v2.0 | Полный редизайн: streaming, tools mapping, retry |
| v2.1 | PERS embeddings, 403 handling |
| v2.2 | Новые модели 2024, 429/500 retry, 128K context |
| v2.3 | Structured Output, частичная Vision |
| **v2.4** | **Текущая.** Full audit fix: Vision upload, unified retry, no flag leaks, multer, streaming tool_calls |

Подробности: `docs/AUDIT.md`.

---

## 9. Типичные задачи

### «Добавить поддержку новой модели GigaChat»

1. Обнови `src/routes/models.js`
2. Обнови `openclaw.config.example.json`

### «GigaChat вернул ошибку — как понять?»

1. Смотри логи прокси (console output)
2. Логи содержат: `[Chat]`, `[Embed]`, `[Auth]`, `[FileManager]`, `[Stream]`
3. Ошибки помечены `❌`, предупреждения `⚠️`
4. См. `docs/TROUBLESHOOTING.md`

### «Подключить к другому клиенту (не OpenClaw)»

Прокси полностью совместим с OpenAI API. Укажи `baseURL: http://127.0.0.1:8080/v1` и любой API-ключ GigaChat как `apiKey`.

```python
# Python / OpenAI SDK
from openai import OpenAI
client = OpenAI(base_url="http://127.0.0.1:8080/v1", api_key="<gigachat-key>")
```

```javascript
// Node.js / OpenAI SDK
import OpenAI from 'openai';
const client = new OpenAI({ baseURL: 'http://127.0.0.1:8080/v1', apiKey: '<gigachat-key>' });
```

---

## 10. Контрольный чеклист перед деплоем

### Если используешь gpt2giga (рекомендуется):

- [ ] Python 3.10+ установлен
- [ ] `pip install gpt2giga` выполнен
- [ ] `.env` создан из `systemd/env.example`
- [ ] `curl http://127.0.0.1:8080/health` — OK
- [ ] systemd сервис создан и работает
- [ ] Конфиг OpenClaw обновлён (см. `openclaw.config.example.json`)
- [ ] `openclaw chat --message "Тест"` — работает

Подробная инструкция: **`DEPLOY.md`**

### Если используешь кастомный Node.js прокси:

- [ ] `npm install` выполнен
- [ ] `.env` создан из `.env.example`
- [ ] `GIGACHAT_API_KEY=<key> npm test` — 5/5 pass
- [ ] Для production: `pm2 start src/server.js --name gigachat-proxy`

---

## 11. Принятое решение и почему

После анализа 4 репозиториев (openclaw, gigachat SDK, gigachat-java SDK, gpt2giga) было принято решение использовать **gpt2giga** как production-прокси:

1. **Готовность:** gpt2giga уже работает, протестирован, поддерживается
2. **Функциональность:** Покрывает всё (chat, streaming, tools, vision, embeddings, structured output)
3. **Безопасность:** SSRF protection, API keys, PROD mode, data redaction
4. **Совместимость:** Полностью совместим с OpenClaw `api: "openai-completions"`

Кастомный Node.js прокси (`src/`) сохранён как:
- Справочный материал по архитектуре
- Запасной вариант если нужна кастомизация
- Учебный проект по интеграции GigaChat

Подробный анализ: `docs/REPOS-ANALYSIS.md`
