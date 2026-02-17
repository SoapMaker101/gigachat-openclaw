import https from 'https';

const sslAgent = new https.Agent({ rejectUnauthorized: false, keepAlive: true });

export function getAgent() {
  return sslAgent;
}
