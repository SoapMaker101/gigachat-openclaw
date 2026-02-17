import { gigaChatChunkToOpenAISSE, SSE_DONE } from './mapper.js';

export async function pipeGigaChatStreamToOpenAI(gigaChatStream, res, requestedModel) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (res.flushHeaders) res.flushHeaders();

  let chunks = 0;
  try {
    for await (const line of readLines(gigaChatStream)) {
      if (!line.trim()) continue;
      const payload = line.startsWith('data: ') ? line.slice(6).trim() : line;
      if (payload === '[DONE]') break;
      let chunk;
      try { chunk = JSON.parse(payload); } catch { continue; }
      res.write(gigaChatChunkToOpenAISSE(chunk, requestedModel));
      chunks++;
      if (res.flush) res.flush();
    }
    res.write(SSE_DONE);
    res.end();
    console.log(`[Stream] Done (${chunks} chunks)`);
  } catch (error) {
    console.error('[Stream] Error:', error.message);
    if (!res.headersSent) res.status(500).json({ error: { message: error.message } });
    else res.end();
  }
}

async function* readLines(stream) {
  let buf = '';
  for await (const chunk of stream) {
    buf += chunk.toString();
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const l of lines) yield l;
  }
  if (buf.trim()) yield buf;
}
