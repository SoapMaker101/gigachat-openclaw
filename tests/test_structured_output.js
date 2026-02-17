#!/usr/bin/env node
import fetch from 'node-fetch';
const URL = process.env.PROXY_URL || 'http://127.0.0.1:8080';
const KEY = process.env.GIGACHAT_API_KEY;
if (!KEY) { console.error('GIGACHAT_API_KEY required'); process.exit(1); }

const r = await fetch(`${URL}/v1/chat/completions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
  body: JSON.stringify({
    model: 'GigaChat-2-Max',
    messages: [{ role: 'user', content: 'Извлеки: Иван Петров, 30 лет, Москва, программист' }],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'person',
        schema: { type: 'object', properties: { name: { type: 'string' }, age: { type: 'integer' }, city: { type: 'string' }, job: { type: 'string' } }, required: ['name', 'age'] },
      },
    },
    temperature: 0.1,
  }),
});
if (!r.ok) { console.error(await r.text()); process.exit(1); }
const d = await r.json();
const content = d.choices[0].message.content;
console.log('Response:', content);
try {
  const parsed = JSON.parse(content);
  console.log('Parsed:', parsed);
  console.log(parsed.name && parsed.age ? '✅ PASS' : '❌ Missing fields');
} catch (e) {
  console.error('❌ Not valid JSON:', e.message);
}
