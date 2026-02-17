# Развёртывание GigaChat + OpenClaw через gpt2giga

Полная пошаговая инструкция: от нуля до работающего агента OpenClaw с GigaChat.

---

## Архитектура

```
┌──────────────────┐     HTTP (OpenAI format)     ┌──────────────┐     HTTPS (GigaChat API)     ┌──────────────┐
│    OpenClaw      │ ──────────────────────────▶  │   gpt2giga   │ ──────────────────────────▶  │   GigaChat   │
│  (Node.js агент) │  localhost:8080/v1/...       │  (Python)    │  OAuth + functions + SSL     │   (Sber)     │
│                  │ ◀──────────────────────────  │  порт 8080   │ ◀──────────────────────────  │              │
└──────────────────┘     JSON / SSE               └──────────────┘     JSON / SSE               └──────────────┘
```

**gpt2giga** — прокси-переводчик. Принимает запросы в формате OpenAI, транслирует в GigaChat API, возвращает обратно в формате OpenAI. OpenClaw думает, что разговаривает с OpenAI.

---

## Шаг 0: Получить ключ GigaChat

1. Зайди на https://developers.sber.ru/studio/
2. Создай проект (или выбери существующий)
3. Перейди в раздел «Ключи API»
4. Создай ключ. Скопируй **Authorization Key** (это base64 строка)
5. Запомни **scope** твоего аккаунта:
   - `GIGACHAT_API_PERS` — физлица (бесплатно с лимитами)
   - `GIGACHAT_API_B2B` — бизнес
   - `GIGACHAT_API_CORP` — корпорации

---

## Шаг 1: Установка gpt2giga

### Вариант A: pip (рекомендуется)

```bash
# Убедись что Python 3.10+ установлен
python3 --version

# Установи gpt2giga
pip install gpt2giga
```

### Вариант B: из репозитория (если нужна последняя dev-версия)

```bash
cd /opt
git clone https://github.com/Rai220/gpt2giga.git
cd gpt2giga
pip install -e .
```

---

## Шаг 2: Настройка переменных окружения

Создай файл `/opt/gpt2giga/.env` (или задай ENV переменные):

```bash
# === Обязательные ===

# Твой Authorization Key из Sber Studio (base64 строка)
GIGACHAT_CREDENTIALS=твой_ключ_из_sber_studio

# Scope твоего аккаунта
GIGACHAT_SCOPE=GIGACHAT_API_PERS

# === Опциональные ===

# Порт (по умолчанию 8080, можно менять)
GPT2GIGA_PORT=8080

# Хост (по умолчанию 127.0.0.1 — только localhost)
GPT2GIGA_HOST=127.0.0.1

# SSL верификация к GigaChat (False для обхода сертификатов Минцифры)
GIGACHAT_VERIFY_SSL_CERTS=False

# Модель для эмбеддингов (по умолчанию EmbeddingsGigaR — 2560-dim)
GPT2GIGA_EMBEDDINGS=Embeddings
```

---

## Шаг 3: Запуск gpt2giga

### Ручной запуск (для проверки)

```bash
# Из директории с .env
gpt2giga
```

Должно появиться:
```
INFO:     Uvicorn running on http://127.0.0.1:8080
```

### Проверка

В другом терминале:

```bash
# Health check
curl http://127.0.0.1:8080/health

# Тест чата
curl -X POST http://127.0.0.1:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "GigaChat-2-Max",
    "messages": [{"role": "user", "content": "Привет! Ответь одним словом."}],
    "max_tokens": 20
  }'
```

Если получил JSON с `choices[0].message.content` — всё работает.

### Тест стриминга

```bash
curl -X POST http://127.0.0.1:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "GigaChat-2-Max",
    "messages": [{"role": "user", "content": "Посчитай от 1 до 5"}],
    "stream": true
  }'
```

Должны пойти чанки `data: {...}` и в конце `data: [DONE]`.

---

## Шаг 4: Автозапуск через systemd

Создай сервис:

```bash
sudo nano /etc/systemd/system/gpt2giga.service
```

Вставь:

```ini
[Unit]
Description=GigaChat OpenAI Proxy (gpt2giga)
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/gpt2giga
EnvironmentFile=/opt/gpt2giga/.env
ExecStart=/usr/local/bin/gpt2giga
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Активируй:

```bash
sudo systemctl daemon-reload
sudo systemctl enable gpt2giga
sudo systemctl start gpt2giga

# Проверь
sudo systemctl status gpt2giga
# Логи
sudo journalctl -u gpt2giga -f
```

---

## Шаг 5: Подключение к OpenClaw

### 5.1 Отредактируй конфиг OpenClaw

Файл: `~/.config/openclaw/config.json` (или где у тебя конфиг)

Добавь провайдер `gigachat`:

```json
{
  "models": {
    "providers": {
      "gigachat": {
        "baseUrl": "http://127.0.0.1:8080/v1",
        "api": "openai-completions",
        "models": [
          {
            "id": "GigaChat-2-Max",
            "name": "GigaChat 2 Max",
            "contextWindow": 131072,
            "maxTokens": 8192
          },
          {
            "id": "GigaChat-2-Pro",
            "name": "GigaChat 2 Pro",
            "contextWindow": 131072,
            "maxTokens": 8192
          },
          {
            "id": "GigaChat-2-Lite",
            "name": "GigaChat 2 Lite",
            "contextWindow": 131072,
            "maxTokens": 8192
          }
        ]
      }
    },
    "default": "gigachat:GigaChat-2-Max"
  }
}
```

**Важно:**
- `baseUrl` указывает на gpt2giga (localhost:8080)
- `api` = `"openai-completions"` — OpenClaw будет использовать OpenAI формат
- `apiKey` **не нужен** — gpt2giga берёт credentials из своих ENV переменных
- Если gpt2giga настроен с `GPT2GIGA_API_KEY`, добавь `"apiKey": "<тот же ключ>"`

### 5.2 Проверь

```bash
# Список моделей (должна появиться GigaChat)
openclaw models list

# Тестовый чат
openclaw chat --model gigachat:GigaChat-2-Max --message "Привет, GigaChat!"
```

---

## Шаг 6: Проверка всех фич

### Обычный чат
```bash
openclaw chat --message "Объясни квантовые вычисления простыми словами"
```

### Стриминг (должен работать автоматически)
OpenClaw использует стриминг по умолчанию. Текст должен появляться по словам.

### Tool calling
Если у агента настроены инструменты — GigaChat поддерживает function calling. gpt2giga конвертирует OpenAI `tools` в GigaChat `functions` автоматически.

### Embeddings (RAG)
Если OpenClaw использует embeddings для памяти:
```json
{
  "memory": {
    "embeddings": {
      "provider": "gigachat",
      "model": "Embeddings"
    }
  }
}
```

---

## Схема портов (если на одном сервере)

```
Порт 8080  →  gpt2giga (GigaChat proxy)
Порт 3000  →  OpenClaw gateway (или какой у тебя)
```

Если порт 8080 занят — поменяй в `.env`:
```bash
GPT2GIGA_PORT=8765
```
И обнови `baseUrl` в конфиге OpenClaw.

---

## Troubleshooting

### "Connection refused" от OpenClaw

gpt2giga не запущен. Проверь:
```bash
sudo systemctl status gpt2giga
curl http://127.0.0.1:8080/health
```

### "401 Unauthorized" от GigaChat

Неверный `GIGACHAT_CREDENTIALS`. Проверь ключ в Sber Studio.

### "SSL certificate" ошибки

Убедись что в `.env`:
```bash
GIGACHAT_VERIFY_SSL_CERTS=False
```

### gpt2giga запускается, но OpenClaw не видит модели

- Проверь `baseUrl` в конфиге OpenClaw (должен быть `http://127.0.0.1:8080/v1`)
- Проверь `api` = `"openai-completions"`
- Проверь `curl http://127.0.0.1:8080/v1/models` — должен вернуть список

### Медленные ответы

GigaChat может отвечать 3-10 секунд на сложные запросы. Это нормально. Стриминг помогает — ответ начинает приходить быстрее.

### Ошибки с tools / function calling

GigaChat поддерживает **только один function call за запрос**. Если OpenClaw пытается вызвать несколько — будет ошибка. Это ограничение API Сбера.

---

## Обновление gpt2giga

```bash
pip install --upgrade gpt2giga
sudo systemctl restart gpt2giga
```

---

## Полезные ссылки

| Ресурс | URL |
|--------|-----|
| GigaChat API docs | https://developers.sber.ru/docs/ru/gigachat/api/main |
| GigaChain JS SDK | https://developers.sber.ru/docs/ru/gigachain/tools/js/gigachat |
| LiteLLM GigaChat | https://docs.litellm.ai/docs/providers/gigachat |
| gpt2giga GitHub | https://github.com/Rai220/gpt2giga |
| gpt2giga PyPI | https://pypi.org/project/gpt2giga/ |
| Sber Studio (ключи) | https://developers.sber.ru/studio/ |
| OpenClaw docs | (см. репозиторий openclaw-main) |

---

## Чеклист после развёртывания

- [ ] Python 3.10+ установлен
- [ ] `pip install gpt2giga` выполнен
- [ ] `.env` создан с `GIGACHAT_CREDENTIALS` и `GIGACHAT_SCOPE`
- [ ] `curl http://127.0.0.1:8080/health` возвращает OK
- [ ] `curl .../v1/chat/completions` возвращает ответ GigaChat
- [ ] systemd сервис создан и работает
- [ ] Конфиг OpenClaw обновлён с провайдером `gigachat`
- [ ] `openclaw chat --message "Тест"` работает
- [ ] Стриминг работает (текст появляется по словам)
