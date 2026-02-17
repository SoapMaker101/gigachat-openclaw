import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';
import { getAgent } from './ssl-agent.js';

export class FileManager {
  constructor(apiUrl) {
    this.apiUrl = apiUrl || 'https://gigachat.devices.sberbank.ru/api/v1';
    this.fileCache = new Map();
  }

  async uploadImage(imageBuffer, mimeType, filename, token) {
    // Build multipart body manually (no form-data dep needed for internal use)
    const boundary = `----FormBoundary${uuidv4().replace(/-/g, '')}`;
    const preamble = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="file"; filename="${filename}"`,
      `Content-Type: ${mimeType}`,
      '',
    ].join('\r\n');
    const purposePart = [
      '',
      `--${boundary}`,
      'Content-Disposition: form-data; name="purpose"',
      '',
      'general',
      `--${boundary}--`,
      '',
    ].join('\r\n');

    const body = Buffer.concat([
      Buffer.from(preamble, 'utf-8'),
      imageBuffer,
      Buffer.from(purposePart, 'utf-8'),
    ]);

    const rquid = uuidv4();
    console.log(`[FileManager] → POST ${this.apiUrl}/files (${imageBuffer.length} bytes)`);

    const res = await fetch(`${this.apiUrl}/files`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'RqUID': rquid,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
      agent: getAgent(),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`File upload failed: ${res.status} - ${text}`);
    }
    const data = await res.json();
    console.log(`[FileManager] ✅ Uploaded: ${data.id}`);
    return data.id;
  }

  async downloadImage(url) {
    console.log(`[FileManager] Downloading ${url.substring(0, 60)}…`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();          // node-fetch v3 compat
    const buffer = Buffer.from(arrayBuffer);
    const mimeType = res.headers.get('content-type') || 'image/jpeg';
    return { buffer, mimeType };
  }

  decodeBase64Image(base64Data) {
    let data = base64Data, mimeType = 'image/jpeg';
    if (base64Data.startsWith('data:')) {
      const m = base64Data.match(/^data:([^;]+);base64,(.+)$/);
      if (m) { mimeType = m[1]; data = m[2]; }
    }
    return { buffer: Buffer.from(data, 'base64'), mimeType };
  }

  async processImageUrl(imageUrl, token) {
    const cached = this.fileCache.get(imageUrl);
    if (cached) return cached;

    let buffer, mimeType, filename;
    if (imageUrl.startsWith('data:')) {
      const d = this.decodeBase64Image(imageUrl);
      buffer = d.buffer; mimeType = d.mimeType;
      filename = `img_${Date.now()}.${mimeType.split('/')[1] || 'jpg'}`;
    } else {
      const d = await this.downloadImage(imageUrl);
      buffer = d.buffer; mimeType = d.mimeType;
      try { filename = new URL(imageUrl).pathname.split('/').pop(); } catch { filename = `img_${Date.now()}.jpg`; }
    }

    if (buffer.length > 15 * 1024 * 1024) {
      throw new Error(`Image too large: ${(buffer.length / 1048576).toFixed(1)} MB (max 15 MB)`);
    }

    const fileId = await this.uploadImage(buffer, mimeType, filename, token);
    this.fileCache.set(imageUrl, fileId);
    return fileId;
  }

  clearCache() { this.fileCache.clear(); }
  getStats()   { return { cachedFiles: this.fileCache.size }; }
}
