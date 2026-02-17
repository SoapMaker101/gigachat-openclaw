import { openAIEmbeddingsToGigaChat, gigaChatEmbeddingsToOpenAI } from '../lib/mapper.js';
import { callGigaChat } from '../lib/gigachat-client.js';
import { convertErrorToOpenAI } from '../lib/utils.js';

export function registerEmbeddings(app, authManager, config) {
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

    } catch (error) {
      console.error(`[Embed] ❌ ${Date.now() - t0}ms: ${error.message}`);
      res.status(500).json(convertErrorToOpenAI(error, 500));
    }
  });
}
