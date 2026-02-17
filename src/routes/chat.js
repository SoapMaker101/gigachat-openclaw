import { openAIRequestToGigaChat, gigaChatResponseToOpenAI, uploadImagesAndAttach } from '../lib/mapper.js';
import { pipeGigaChatStreamToOpenAI } from '../lib/stream-handler.js';
import { callGigaChat } from '../lib/gigachat-client.js';
import { convertErrorToOpenAI } from '../lib/utils.js';
import { FileManager } from '../lib/file-manager.js';

export function registerChat(app, authManager, config) {
  const fileManager = new FileManager(config.gigachatApiUrl);

  app.post('/v1/chat/completions', async (req, res) => {
    const t0 = Date.now();
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json(convertErrorToOpenAI(new Error('Missing Authorization'), 401));
    }

    const apiKey = authHeader.slice(7).trim();
    const scope  = req.body.scope || config.defaultScope;

    console.log(`\n[Chat] === Model: ${req.body.model || 'default'} | Stream: ${req.body.stream || false} | Msgs: ${req.body.messages?.length || 0}`);

    try {
      const token = await authManager.getToken(apiKey, scope);
      const { body: gigaBody, isStructuredOutput, imageUrls } = openAIRequestToGigaChat(req.body);
      const requestedModel = req.body.model;

      // Vision: upload images → attach file_ids
      if (imageUrls.length > 0) {
        console.log(`[Chat] Vision: ${imageUrls.length} image(s)`);
        try {
          gigaBody.messages = await uploadImagesAndAttach(gigaBody.messages, imageUrls, fileManager, token);
        } catch (e) {
          console.error(`[Chat] ⚠️ Vision failed: ${e.message} — continuing without images`);
        }
      }

      const gigaRes = await callGigaChat({
        url: `${config.gigachatApiUrl}/chat/completions`,
        body: gigaBody,
        token, apiKey, scope, authManager,
        label: 'Chat',
      });

      // Stream
      if (gigaBody.stream) {
        return pipeGigaChatStreamToOpenAI(gigaRes.body, res, requestedModel);
      }

      // JSON
      const gigaJson = await gigaRes.json();
      const openAIResponse = gigaChatResponseToOpenAI(gigaJson, requestedModel, isStructuredOutput);
      console.log(`[Chat] ✅ ${Date.now() - t0}ms | Tokens: ${openAIResponse.usage.total_tokens}`);
      res.json(openAIResponse);

    } catch (error) {
      console.error(`[Chat] ❌ ${Date.now() - t0}ms: ${error.message}`);
      res.status(500).json(convertErrorToOpenAI(error, 500));
    }
  });
}
