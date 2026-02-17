import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import { getAgent } from '../lib/ssl-agent.js';
import { convertErrorToOpenAI } from '../lib/utils.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

export function registerFiles(app, authManager, config) {
  // helper — get token from Authorization header
  async function getTokenFromReq(req) {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) throw new Error('Missing Authorization');
    const apiKey = h.slice(7).trim();
    const scope  = config.defaultScope;
    return { token: await authManager.getToken(apiKey, scope), apiKey, scope };
  }

  function rqHeaders(token) {
    return { Authorization: `Bearer ${token}`, Accept: 'application/json', RqUID: uuidv4() };
  }

  // POST /v1/files — upload
  app.post('/v1/files', upload.single('file'), async (req, res) => {
    try {
      const { token } = await getTokenFromReq(req);
      if (!req.file) throw new Error('No file provided');

      const boundary = `----B${uuidv4().replace(/-/g, '')}`;
      const preamble = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${req.file.originalname}"\r\nContent-Type: ${req.file.mimetype}\r\n\r\n`;
      const purpose  = `\r\n--${boundary}\r\nContent-Disposition: form-data; name="purpose"\r\n\r\ngeneral\r\n--${boundary}--\r\n`;
      const body = Buffer.concat([Buffer.from(preamble), req.file.buffer, Buffer.from(purpose)]);

      const r = await fetch(`${config.gigachatApiUrl}/files`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, RqUID: uuidv4(), 'Content-Type': `multipart/form-data; boundary=${boundary}` },
        body, agent: getAgent(),
      });
      if (!r.ok) throw new Error(`Upload failed: ${r.status} - ${await r.text()}`);
      res.json(await r.json());
    } catch (e) {
      res.status(e.message.includes('Authorization') ? 401 : 500).json(convertErrorToOpenAI(e));
    }
  });

  // GET /v1/files
  app.get('/v1/files', async (req, res) => {
    try {
      const { token } = await getTokenFromReq(req);
      const r = await fetch(`${config.gigachatApiUrl}/files`, { headers: rqHeaders(token), agent: getAgent() });
      if (!r.ok) throw new Error(`${r.status} - ${await r.text()}`);
      res.json(await r.json());
    } catch (e) { res.status(500).json(convertErrorToOpenAI(e)); }
  });

  // GET /v1/files/:id
  app.get('/v1/files/:id', async (req, res) => {
    try {
      const { token } = await getTokenFromReq(req);
      const r = await fetch(`${config.gigachatApiUrl}/files/${req.params.id}`, { headers: rqHeaders(token), agent: getAgent() });
      if (!r.ok) throw new Error(`${r.status} - ${await r.text()}`);
      res.json(await r.json());
    } catch (e) { res.status(500).json(convertErrorToOpenAI(e)); }
  });

  // DELETE /v1/files/:id
  app.delete('/v1/files/:id', async (req, res) => {
    try {
      const { token } = await getTokenFromReq(req);
      const r = await fetch(`${config.gigachatApiUrl}/files/${req.params.id}/delete`, { method: 'POST', headers: rqHeaders(token), agent: getAgent() });
      if (!r.ok) throw new Error(`${r.status} - ${await r.text()}`);
      res.json(await r.json());
    } catch (e) { res.status(500).json(convertErrorToOpenAI(e)); }
  });
}
