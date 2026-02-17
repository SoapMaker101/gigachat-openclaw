#!/usr/bin/env node
import fetch from 'node-fetch';

const URL = process.env.PROXY_URL || 'http://127.0.0.1:8080';
const KEY = process.env.GIGACHAT_API_KEY;
const C = { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', b: '\x1b[36m', d: '\x1b[90m', x: '\x1b[0m' };
let pass = 0, fail = 0;

function ok(name, detail = '') { pass++; console.log(`${C.g}✓ PASS${C.x}: ${name}${detail ? `  ${C.d}${detail}${C.x}` : ''}`); }
function no(name, detail = '') { fail++; console.log(`${C.r}✗ FAIL${C.x}: ${name}${detail ? `  ${C.r}${detail}${C.x}` : ''}`); }

async function run(name, fn) {
  console.log(`\n${C.b}━━━ ${name} ━━━${C.x}`);
  try { await fn(); } catch (e) { no(name, e.message); }
}

async function main() {
  console.log(`${C.b}GigaChat Proxy Test Suite${C.x}`);
  console.log(`${C.d}URL: ${URL} | Key: ${KEY ? KEY.slice(0, 16) + '…' : 'NOT SET'}${C.x}`);
  if (!KEY) console.log(`${C.y}⚠ GIGACHAT_API_KEY not set — some tests skipped${C.x}`);

  await run('Health', async () => {
    const r = await fetch(`${URL}/health`);
    const d = await r.json();
    if (d.status !== 'ok') throw new Error(`status=${d.status}`);
    ok('Health', `v${d.version} uptime=${Math.round(d.uptime)}s`);
  });

  await run('Chat', async () => {
    if (!KEY) return no('Chat', 'no key');
    const r = await fetch(`${URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ model: 'GigaChat-2-Max', messages: [{ role: 'user', content: 'Ответь одним словом: ОК' }], max_tokens: 20 }),
    });
    if (!r.ok) throw new Error(await r.text());
    const d = await r.json();
    if (!d.choices?.[0]?.message?.content) throw new Error('empty content');
    ok('Chat', `"${d.choices[0].message.content.slice(0, 40)}" tokens=${d.usage.total_tokens}`);
  });

  await run('Embeddings', async () => {
    if (!KEY) return no('Embeddings', 'no key');
    const r = await fetch(`${URL}/v1/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ model: 'Embeddings', input: ['Тест'] }),
    });
    if (!r.ok) throw new Error(await r.text());
    const d = await r.json();
    const dim = d.data?.[0]?.embedding?.length;
    if (!dim) throw new Error('no embedding');
    ok('Embeddings', `dim=${dim}`);
  });

  await run('Streaming', async () => {
    if (!KEY) return no('Streaming', 'no key');
    const r = await fetch(`${URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ model: 'GigaChat-2-Max', messages: [{ role: 'user', content: '1+1=' }], stream: true, max_tokens: 20 }),
    });
    if (!r.ok) throw new Error(await r.text());
    let done = false, n = 0;
    for await (const ch of r.body) {
      for (const l of ch.toString().split('\n')) {
        if (l.trim() === 'data: [DONE]') done = true;
        else if (l.startsWith('data: ')) n++;
      }
    }
    if (!done) throw new Error('no [DONE]');
    ok('Streaming', `chunks=${n} [DONE]=true`);
  });

  await run('Error handling (bad key)', async () => {
    const r = await fetch(`${URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer bad_key' },
      body: JSON.stringify({ model: 'GigaChat-2-Max', messages: [{ role: 'user', content: 'x' }] }),
    });
    if (r.ok) throw new Error('expected error');
    const d = await r.json();
    if (!d.error?.message) throw new Error('no error.message');
    ok('Error handling', `${r.status}: ${d.error.message.slice(0, 50)}…`);
  });

  console.log(`\n${C.b}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.x}`);
  console.log(`Total: ${pass + fail}  ${C.g}Pass: ${pass}${C.x}  ${fail ? C.r : C.g}Fail: ${fail}${C.x}`);
  process.exit(fail > 0 ? 1 : 0);
}

main();
