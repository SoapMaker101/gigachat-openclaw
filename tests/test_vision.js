#!/usr/bin/env node
import fetch from 'node-fetch';
const URL = process.env.PROXY_URL || 'http://127.0.0.1:8080';
const KEY = process.env.GIGACHAT_API_KEY;
const IMG = process.env.TEST_IMAGE_URL || 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/240px-Cat03.jpg';
if (!KEY) { console.error('GIGACHAT_API_KEY required'); process.exit(1); }

console.log('Vision test — image:', IMG);
const r = await fetch(`${URL}/v1/chat/completions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
  body: JSON.stringify({
    model: 'GigaChat-2-Max',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Что на картинке? Кратко.' }, { type: 'image_url', image_url: { url: IMG } }] }],
    max_tokens: 200,
  }),
});
if (!r.ok) { console.error(await r.text()); process.exit(1); }
const d = await r.json();
console.log('Model:', d.model);
console.log('Content:', d.choices[0].message.content);
console.log('Tokens:', d.usage.total_tokens);
console.log('✅ Vision test passed');
