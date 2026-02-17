import { openAIEmbeddingsToGigaChat, gigaChatEmbeddingsToOpenAI } from '../lib/mapper.js';
import { callGigaChat } from '../lib/gigachat-client.js';
import { convertErrorToOpenAI } from '../lib/utils.js';
import { vectorStore } from '../lib/vectorStore.js';
import path from 'path';

// Persist vector store between restarts
const DATA_PATH = path.resolve(process.cwd(), 'vectorStore.json');
try { vectorStore.loadFromDisk(DATA_PATH); console.log('[RAG] VectorStore loaded from disk:', DATA_PATH); } catch (e) { /* ignore */ }

/**
 * Helper: get an embedding vector for a single text via GigaChat Embeddings API
 */
async function embedText(text, authManager, apiKey, scope, config, model) {
  const token = await authManager.getToken(apiKey, scope);
  const gigaBody = openAIEmbeddingsToGigaChat({
    input: [text],
    model: model || 'Embeddings',
  });

  const gigaRes = await callGigaChat({
    url: `${config.gigachatApiUrl}/embeddings`,
    body: gigaBody,
    token, apiKey, scope, authManager,
    label: 'RAG-Embed',
  });

  const gigaJson = await gigaRes.json();
  if (gigaJson?.data?.[0]?.embedding) {
    return gigaJson.data[0].embedding;
  }
  throw new Error('No embedding returned from GigaChat');
}

export function registerEmbeddings(app, authManager, config) {

  // ======================== Standard OpenAI-compatible /v1/embeddings ========================
  app.post('/v1/embeddings', async (req, res) => {
    const t0 = Date.now();
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json(convertErrorToOpenAI(new Error('Missing Authorization'), 401));
    }

    const apiKey = authHeader.slice(7).trim();
    const scope  = req.body.scope || config.defaultScope;
    const inputCount = Array.isArray(req.body.input) ? req.body.input.length : 1;
    console.log(`\n[Embed] Model: ${req.body.model || 'default'} | Input: ${inputCount} text(s)`);

    try {
      const token = await authManager.getToken(apiKey, scope);
      const requestedModel = req.body.model;
      const gigaBody = openAIEmbeddingsToGigaChat(req.body);

      const gigaRes = await callGigaChat({
        url: `${config.gigachatApiUrl}/embeddings`,
        body: gigaBody,
        token, apiKey, scope, authManager,
        label: 'Embed',
      });

      const gigaJson = await gigaRes.json();
      const openAIResponse = gigaChatEmbeddingsToOpenAI(gigaJson, requestedModel);
      console.log(`[Embed] ✅ ${Date.now() - t0}ms | Vectors: ${openAIResponse.data.length} | Dim: ${openAIResponse.data[0]?.embedding?.length}`);
      res.json(openAIResponse);

      // Persist embeddings index state if any new vectors indexed via this call isn't available yet
      // (Optional: delay to ensure all docs indexed before persisting)

    } catch (error) {
      console.error(`[Embed] ❌ ${Date.now() - t0}ms: ${error.message}`);
      res.status(500).json(convertErrorToOpenAI(error, 500));
    }
  });

  // ======================== RAG: Index documents ========================
  // POST /v1/rag/index
  // Body: { docs: [{ id?, text, metadata? }], model?: "Embeddings" }
  // Auth: Bearer <gigachat-api-key>
  app.post('/v1/rag/index', async (req, res) => {
    const t0 = Date.now();
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json(convertErrorToOpenAI(new Error('Missing Authorization'), 401));
    }

    const apiKey = authHeader.slice(7).trim();
    const scope  = req.body.scope || config.defaultScope;
    const { docs, model } = req.body;

    if (!Array.isArray(docs) || docs.length === 0) {
      return res.status(400).json({ error: { message: 'docs must be a non-empty array of {text, id?, metadata?}' } });
    }

    console.log(`\n[RAG-Index] Indexing ${docs.length} document(s)…`);

    try {
      const embedFn = async (text) => embedText(text, authManager, apiKey, scope, config, model);
      await vectorStore.addDocuments(docs, embedFn);
      // Persist to disk after indexing
      if (DATA_PATH) {
        vectorStore.saveToDisk(DATA_PATH);
        console.log('[RAG-Index] Persisted VectorStore to disk: ', DATA_PATH);
      }
      console.log(`[RAG-Index] ✅ ${Date.now() - t0}ms | Total stored: ${vectorStore.entries.length}`);
      res.json({ ok: true, indexed: docs.length, total: vectorStore.entries.length });
    } catch (error) {
      console.error(`[RAG-Index] ❌ ${Date.now() - t0}ms: ${error.message}`);
      res.status(500).json(convertErrorToOpenAI(error, 500));
    }
  });

  // ======================== RAG: Query ========================
  // POST /v1/rag/query
  // Body: { query: "search text", topK?: 5, model?: "Embeddings" }
  // Auth: Bearer <gigachat-api-key>
  app.post('/v1/rag/query', async (req, res) => {
    const t0 = Date.now();
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json(convertErrorToOpenAI(new Error('Missing Authorization'), 401));
    }

    const apiKey = authHeader.slice(7).trim();
    const scope  = req.body.scope || config.defaultScope;
    const { query, topK } = req.body;

    if (!query) {
      return res.status(400).json({ error: { message: 'query is required' } });
    }

    if (vectorStore.entries.length === 0) {
      return res.json({ results: [], message: 'Vector store is empty. Index documents first via /v1/rag/index.' });
    }

    console.log(`\n[RAG-Query] "${query.slice(0, 80)}…" | topK: ${topK || 5} | Store: ${vectorStore.entries.length}`);

    try {
      const embedFn = async (text) => embedText(text, authManager, apiKey, scope, config, model);
      const results = await vectorStore.query(query, topK || 5, embedFn);
      console.log(`[RAG-Query] ✅ ${Date.now() - t0}ms | Results: ${results.length}`);
      res.json({
        results: results.map(r => ({
          id: r.id,
          text: r.text,
          score: r.score,
          metadata: r.metadata,
        })),
      });
    } catch (error) {
      console.error(`[RAG-Query] ❌ ${Date.now() - t0}ms: ${error.message}`);
      res.status(500).json(convertErrorToOpenAI(error, 500));
    }
  });

  // ======================== RAG: Stats ========================
  // GET /v1/rag/stats
  app.get('/v1/rag/stats', (_req, res) => {
    res.json({
      totalDocuments: vectorStore.entries.length,
      embeddingDimension: vectorStore.entries[0]?.embedding?.length || null,
    });
  });

  // ======================== RAG: Clear ========================
  // DELETE /v1/rag/clear
  app.delete('/v1/rag/clear', (_req, res) => {
    const count = vectorStore.entries.length;
    vectorStore.entries = [];
    console.log(`[RAG] Cleared ${count} entries`);
    res.json({ ok: true, cleared: count });
  });
}
