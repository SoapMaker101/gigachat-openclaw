/**
 * Shared GigaChat API client — single place to call GigaChat with retry logic
 */

import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';
import { getAgent } from './ssl-agent.js';
import { sleep } from './utils.js';

/**
 * Call GigaChat API with automatic retry on 401/403/429/500
 */
export async function callGigaChat(
  { url, body, token, apiKey, scope, authManager, label = 'API' },
  { isRetry = false, retryCount = 0 } = {}
) {
  const rquid = uuidv4();
  console.log(`[${label}] → POST ${url}  RqUID: ${rquid}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'RqUID': rquid,
    },
    body: JSON.stringify(body),
    agent: getAgent(),
  });

  // 401 — refresh token, retry once
  if (response.status === 401 && !isRetry) {
    console.warn(`[${label}] ⚠️ 401 → refreshing token…`);
    const newToken = await authManager.refreshToken(apiKey, scope);
    return callGigaChat(
      { url, body, token: newToken, apiKey, scope, authManager, label },
      { isRetry: true, retryCount }
    );
  }

  // 403 — meaningful error
  if (response.status === 403) {
    const text = await response.text();
    throw new Error(
      `GigaChat 403 Forbidden (scope: ${scope}). ` +
      `Check your access level or upgrade scope. Detail: ${text}`
    );
  }

  // 429 — rate limit, up to 3 retries with exp backoff
  if (response.status === 429 && retryCount < 3) {
    const ra = response.headers.get('retry-after');
    const delay = ra ? parseInt(ra) * 1000 : Math.pow(2, retryCount) * 1000;
    console.warn(`[${label}] ⚠️ 429 → retry in ${delay}ms (${retryCount + 1}/3)`);
    await sleep(delay);
    return callGigaChat(
      { url, body, token, apiKey, scope, authManager, label },
      { isRetry, retryCount: retryCount + 1 }
    );
  }

  // 500/502/503 — server error, retry once
  if ([500, 502, 503].includes(response.status) && retryCount === 0) {
    console.warn(`[${label}] ⚠️ ${response.status} → retry in 1 s`);
    await sleep(1000);
    return callGigaChat(
      { url, body, token, apiKey, scope, authManager, label },
      { isRetry, retryCount: 1 }
    );
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GigaChat ${label} error: ${response.status} - ${text}`);
  }

  console.log(`[${label}] ← ${response.status}`);
  return response;
}
