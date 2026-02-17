import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';
import { getAgent } from './ssl-agent.js';

export class AuthManager {
  constructor(authUrl, refreshBufferMs = 5 * 60 * 1000) {
    this.authUrl = authUrl;
    this.refreshBufferMs = refreshBufferMs;
    this.cache = new Map();
  }

  _cacheKey(apiKey, scope) {
    return `${apiKey}\0${scope}`;
  }

  async getToken(apiKey, scope = 'GIGACHAT_API_PERS') {
    const key = this._cacheKey(apiKey, scope);
    const cached = this.cache.get(key);
    if (cached && Date.now() < cached.expiresAt - this.refreshBufferMs) {
      return cached.token;
    }
    const { token, expiresAt } = await this.authenticate(apiKey, scope);
    this.cache.set(key, { token, expiresAt });
    console.log(`[Auth] Token acquired (expires in ${Math.round((expiresAt - Date.now()) / 1000)}s)`);
    return token;
  }

  async authenticate(apiKey, scope) {
    const rquid = uuidv4();
    const res = await fetch(this.authUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Bearer ${apiKey}`,
        'RqUID': rquid,
      },
      body: `scope=${scope}`,
      agent: getAgent(),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GigaChat OAuth failed: ${res.status} - ${text}`);
    }
    const data = await res.json();
    return { token: data.access_token, expiresAt: data.expires_at };
  }

  async refreshToken(apiKey, scope = 'GIGACHAT_API_PERS') {
    this.cache.delete(this._cacheKey(apiKey, scope));
    return this.getToken(apiKey, scope);
  }

  getStats() {
    const entries = [];
    for (const [key, val] of this.cache.entries()) {
      const idx = key.lastIndexOf('\0');
      entries.push({
        scope: key.slice(idx + 1),
        expiresIn: Math.round((val.expiresAt - Date.now()) / 1000),
      });
    }
    return { count: this.cache.size, entries };
  }

  clearCache() { this.cache.clear(); }
}
