#!/usr/bin/env node
import express from 'express';
import cors from 'cors';
import config from './config.js';
import { AuthManager } from './lib/auth-manager.js';
import { registerChat }       from './routes/chat.js';
import { registerEmbeddings } from './routes/embeddings.js';
import { registerFiles }      from './routes/files.js';
import { registerModels }     from './routes/models.js';
import { registerHealth }     from './routes/health.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use((req, _res, next) => { console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`); next(); });

const authManager = new AuthManager(config.gigachatAuthUrl, config.tokenRefreshBufferMs);

registerChat(app, authManager, config);
registerEmbeddings(app, authManager, config);
registerFiles(app, authManager, config);
registerModels(app);
registerHealth(app, authManager, config);

app.use((_req, res) => res.status(404).json({ error: { message: 'Not found' } }));
app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: { message: err.message } }); });

const server = app.listen(config.port, config.host, () => {
  console.log(`
  GigaChat OpenClaw Proxy v${config.version}
  http://${config.host}:${config.port}
  GigaChat API: ${config.gigachatApiUrl}
  Scope: ${config.defaultScope}
  `);
});

const shutdown = (sig) => { console.log(`\n${sig}`); server.close(() => process.exit(0)); setTimeout(() => process.exit(1), 5000); };
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
