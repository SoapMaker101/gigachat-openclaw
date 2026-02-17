import fs from 'fs';
import path from 'path';

export class VectorStore {
  constructor() {
    this.entries = []; // { id, text, embedding, metadata }
  }

  async addDocuments(docs, embedFn) {
    if (!docs || !Array.isArray(docs)) return;
    console.log(`[VectorStore] Adding ${docs.length} documents...`);
    for (const d of docs) {
      const id = d.id || ('doc_' + Math.random().toString(36).substr(2, 9));
      const text = d.text || '';
      const metadata = d.metadata || {};
      
      let embedding = d.embedding || null;
      if (!embedding && embedFn && text) {
        try {
          embedding = await embedFn(text);
        } catch (err) {
          console.error(`[VectorStore] Embedding generation failed for doc ${id}:`, err.message);
        }
      }
      
      if (embedding) {
        this.entries.push({ id, text, embedding, metadata });
      }
    }
    console.log(`[VectorStore] Total entries: ${this.entries.length}`);
  }

  async query(queryText, topK = 5, embedFn) {
    if (!queryText) return [];
    
    let qEmb = null;
    if (embedFn) {
      try {
        qEmb = await embedFn(queryText);
      } catch (err) {
        console.error(`[VectorStore] Query embedding failed:`, err.message);
        return [];
      }
    }

    if (!qEmb) {
      console.warn('[VectorStore] No query embedding, returning empty result.');
      return [];
    }

    const scored = this.entries
      .filter(e => e.embedding && e.embedding.length === qEmb.length)
      .map(e => {
        const score = this._cosineSimilarity(e.embedding, qEmb);
        return { ...e, score }; // return doc + score
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
      
    return scored;
  }

  _cosineSimilarity(a, b) {
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    if (na === 0 || nb === 0) return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  }

  saveToDisk(filePath) {
    try {
      const data = JSON.stringify(this.entries, null, 2);
      fs.writeFileSync(filePath, data, 'utf8');
      console.log(`[VectorStore] Saved to ${filePath}`);
    } catch (e) {
      console.error('[VectorStore] Save failed:', e);
    }
  }

  loadFromDisk(filePath) {
    if (!fs.existsSync(filePath)) return;
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this.entries = parsed;
        console.log(`[VectorStore] Loaded ${this.entries.length} entries from ${filePath}`);
      }
    } catch (e) {
      console.error('[VectorStore] Load failed:', e);
    }
  }
}

// Singleton instance
export const vectorStore = new VectorStore();
