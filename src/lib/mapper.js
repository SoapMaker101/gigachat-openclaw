/**
 * Format Mapper: OpenAI ↔ GigaChat
 * Handles request/response/tools/structured-output/vision
 */

// ======================== REQUEST ========================

export function openAIRequestToGigaChat(openAI) {
  let model = openAI.model || 'GigaChat-2-Max';
  if (model.startsWith('gigachat/')) model = model.replace('gigachat/', '');

  let messages = mapMessagesToGigaChat(openAI.messages || []);
  const vision = extractVisionImages(messages);
  messages = vision.messages;

  const giga = {
    model,
    messages,
    temperature: openAI.temperature ?? 0.7,
    max_tokens: openAI.max_tokens ?? openAI.maxTokens ?? 2048,
  };

  if (openAI.stream === true) giga.stream = true;
  if (openAI.top_p !== undefined) giga.top_p = openAI.top_p;
  if (openAI.repetition_penalty !== undefined) giga.repetition_penalty = openAI.repetition_penalty;

  // Structured Output overrides tools/functions
  let isStructuredOutput = false;
  if (openAI.response_format?.type === 'json_schema' && openAI.response_format.json_schema) {
    const so = buildStructuredOutput(openAI.response_format.json_schema, giga.messages);
    giga.functions = so.functions;
    giga.function_call = so.function_call;
    giga.messages = so.messages;
    isStructuredOutput = true;
  } else {
    const functions = extractGigaChatFunctions(openAI);
    if (functions.length > 0) {
      giga.functions = functions;
      giga.function_call = openAI.function_call || 'auto';
    }
  }

  return { body: giga, isStructuredOutput, imageUrls: vision.imageUrls };
}

// ======================== MESSAGES ========================

function mapMessagesToGigaChat(messages) {
  return messages.map(msg => {
    const role = msg.role === 'tool' ? 'function' : msg.role;
    const out = { role, content: msg.content ?? '' };
    if (msg.name) out.name = msg.name;
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      const first = msg.tool_calls[0];
      out.function_call = {
        name: first.function?.name ?? first.name,
        arguments: first.function?.arguments ?? first.arguments ?? '{}',
      };
    } else if (msg.function_call) {
      out.function_call = msg.function_call;
    }
    return out;
  });
}

// ======================== TOOLS ========================

function extractGigaChatFunctions(openAI) {
  if (openAI.functions?.length > 0) return openAI.functions.map(normalizeFunction);
  if (openAI.tools?.length > 0) {
    return openAI.tools.map(t =>
      normalizeFunction(t.type === 'function' && t.function ? t.function : t)
    );
  }
  return [];
}

function normalizeFunction(fn) {
  return {
    name: fn.name,
    description: fn.description || '',
    parameters: fn.parameters?.type === 'object'
      ? fn.parameters
      : { type: 'object', properties: fn.parameters?.properties || {}, required: fn.parameters?.required || [] },
  };
}

// ======================== STRUCTURED OUTPUT ========================

function buildStructuredOutput(jsonSchema, messages) {
  const schemaName = jsonSchema.name || 'json_response';
  const schema = jsonSchema.schema || jsonSchema;
  console.log(`[Mapper] Structured Output → hidden function "${schemaName}"`);

  const modifiedMessages = [...messages];
  const lastUserIdx = modifiedMessages.map(m => m.role).lastIndexOf('user');
  if (lastUserIdx >= 0) {
    modifiedMessages[lastUserIdx] = {
      ...modifiedMessages[lastUserIdx],
      content: modifiedMessages[lastUserIdx].content + '\n\nReturn your response as JSON matching the provided schema.',
    };
  }

  return {
    functions: [{ name: schemaName, description: jsonSchema.description || 'Return structured JSON', parameters: schema }],
    function_call: { name: schemaName },
    messages: modifiedMessages,
  };
}

export function parseStructuredOutput(functionCall) {
  try {
    const args = typeof functionCall.arguments === 'string'
      ? JSON.parse(functionCall.arguments)
      : functionCall.arguments;
    return JSON.stringify(args, null, 2);
  } catch {
    return typeof functionCall.arguments === 'string'
      ? functionCall.arguments
      : JSON.stringify(functionCall.arguments);
  }
}

// ======================== VISION ========================

function extractVisionImages(messages) {
  let hasImages = false;
  const imageUrls = [];

  const processed = messages.map((msg, idx) => {
    if (!Array.isArray(msg.content)) return msg;

    const textParts = [];
    for (const part of msg.content) {
      if (part.type === 'text') {
        textParts.push(part.text);
      } else if (part.type === 'image_url') {
        hasImages = true;
        const url = part.image_url?.url || part.image_url;
        imageUrls.push({ url, messageIndex: idx });
      }
    }
    return { ...msg, content: textParts.join('\n') || '' };
  });

  return { messages: processed, imageUrls: hasImages ? imageUrls : [], hasImages };
}

/**
 * Upload images and inject attachments into messages
 */
export async function uploadImagesAndAttach(messages, imageUrls, fileManager, token) {
  if (!imageUrls?.length) return messages;
  console.log(`[Mapper] Vision: Uploading ${imageUrls.length} image(s)…`);

  const uploads = [];
  for (const { url, messageIndex } of imageUrls) {
    try {
      const fileId = await fileManager.processImageUrl(url, token);
      uploads.push({ fileId, messageIndex });
    } catch (e) {
      console.error(`[Mapper] ❌ Image upload failed (msg ${messageIndex}): ${e.message}`);
    }
  }

  return messages.map((msg, idx) => {
    const ids = uploads.filter(u => u.messageIndex === idx).map(u => u.fileId);
    return ids.length > 0 ? { ...msg, attachments: ids } : msg;
  });
}

// ======================== RESPONSE ========================

export function gigaChatResponseToOpenAI(giga, requestedModel, isStructuredOutput = false) {
  const choice = giga.choices?.[0];
  if (!choice) throw new Error('Invalid GigaChat response: no choices');

  const message = { role: 'assistant', content: choice.message?.content ?? '' };

  if (choice.message?.function_call) {
    const fc = choice.message.function_call;
    if (isStructuredOutput) {
      message.content = parseStructuredOutput(fc);
    } else {
      message.tool_calls = [{
        id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        type: 'function',
        function: {
          name: fc.name,
          arguments: typeof fc.arguments === 'string' ? fc.arguments : JSON.stringify(fc.arguments || {}),
        },
      }];
    }
  }

  return {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: requestedModel || giga.model || 'gigachat/GigaChat-2-Max',
    choices: [{ index: 0, message, finish_reason: choice.finish_reason || 'stop' }],
    usage: {
      prompt_tokens: giga.usage?.prompt_tokens ?? 0,
      completion_tokens: giga.usage?.completion_tokens ?? 0,
      total_tokens: giga.usage?.total_tokens ?? 0,
    },
  };
}

// ======================== STREAMING ========================

export function gigaChatChunkToOpenAISSE(chunk, requestedModel) {
  const choice = chunk.choices?.[0];
  const delta = choice?.delta ?? {};
  const finishReason = choice?.finish_reason;

  const openAIDelta = finishReason
    ? {}
    : { role: delta.role || 'assistant', content: delta.content ?? '' };

  // Convert function_call to tool_calls in streaming (BUG-5 fix)
  if (delta.function_call && !finishReason) {
    openAIDelta.tool_calls = [{
      index: 0,
      id: `call_${Date.now()}`,
      type: 'function',
      function: delta.function_call,
    }];
  }

  return `data: ${JSON.stringify({
    id: chunk.id || `chatcmpl-${Date.now()}`,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: requestedModel || chunk.model || 'gigachat/GigaChat-2-Max',
    choices: [{ index: 0, delta: openAIDelta, finish_reason: finishReason || null }],
  })}\n\n`;
}

export const SSE_DONE = 'data: [DONE]\n\n';

// ======================== EMBEDDINGS ========================

export function openAIEmbeddingsToGigaChat(openAI) {
  const input = Array.isArray(openAI.input) ? openAI.input : [openAI.input];
  let model = openAI.model || 'Embeddings';
  if (model.startsWith('gigachat/')) model = model.replace('gigachat/', '');
  const valid = ['Embeddings', 'Embeddings-2', 'EmbeddingsGigaR'];
  if (!valid.includes(model)) {
    console.warn(`[Mapper] Unknown embeddings model "${model}", using "Embeddings"`);
    model = 'Embeddings';
  }
  return { model, input };
}

export function gigaChatEmbeddingsToOpenAI(giga, requestedModel) {
  if (!giga.data || !Array.isArray(giga.data)) throw new Error('Invalid embeddings response');
  return {
    object: 'list',
    data: giga.data.map(item => ({ object: 'embedding', embedding: item.embedding, index: item.index })),
    model: requestedModel || giga.model || 'gigachat/Embeddings',
    usage: { prompt_tokens: giga.usage?.prompt_tokens ?? 0, total_tokens: giga.usage?.total_tokens ?? 0 },
  };
}
