export function registerModels(app) {
  app.get('/v1/models', (_req, res) => {
    res.json({
      object: 'list',
      data: [
        { id: 'GigaChat-2-Max',  object: 'model', created: 1706745600, owned_by: 'sber', context_window: 131072 },
        { id: 'GigaChat-2-Pro',  object: 'model', created: 1706745600, owned_by: 'sber', context_window: 131072 },
        { id: 'GigaChat-2-Lite', object: 'model', created: 1706745600, owned_by: 'sber', context_window: 131072 },
        { id: 'GigaChat-Plus',   object: 'model', created: 1706745600, owned_by: 'sber', context_window: 32768  },
        { id: 'GigaChat-Pro',    object: 'model', created: 1706745600, owned_by: 'sber', context_window: 32768  },
      ],
    });
  });
}
