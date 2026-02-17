export function registerHealth(app, authManager, config) {
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      version: config.version,
      uptime: process.uptime(),
      oauth: authManager.getStats(),
      config: { gigachatApiUrl: config.gigachatApiUrl, defaultScope: config.defaultScope },
    });
  });

  app.get('/', (_req, res) => {
    res.json({
      name: 'GigaChat OpenClaw Proxy',
      version: config.version,
      endpoints: {
        chat:       'POST /v1/chat/completions',
        embeddings: 'POST /v1/embeddings',
        files:      'POST /v1/files  |  GET /v1/files  |  DELETE /v1/files/:id',
        models:     'GET  /v1/models',
        health:     'GET  /health',
      },
    });
  });
}
