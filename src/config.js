import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));

export default {
  version: pkg.version,
  port: parseInt(process.env.PORT || '8080', 10),
  host: process.env.HOST || '127.0.0.1',
  gigachatApiUrl: process.env.GIGACHAT_API_URL || 'https://gigachat.devices.sberbank.ru/api/v1',
  gigachatAuthUrl: process.env.GIGACHAT_AUTH_URL || 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth',
  // Options: GIGACHAT_API_PERS | GIGACHAT_API_B2B | GIGACHAT_API_CORP
  defaultScope: process.env.GIGACHAT_DEFAULT_SCOPE || 'GIGACHAT_API_PERS',
  // Refresh token this many ms before expiry
  tokenRefreshBufferMs: parseInt(process.env.TOKEN_REFRESH_BUFFER_MS || '300000', 10),
};
