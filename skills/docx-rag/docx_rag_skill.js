// Very small DOCX-RAG tool skill
// It uses existing /v1/rag/index and /v1/rag/query endpoints exposed by the proxy
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');

async function indexDocx(filePath) {
  // convert docx to rag input chunks using our server helper if available
  const raw = fs.readFileSync(filePath);
  // Fallback: instruct user to place chunks via /v1/rag/index; here we do a minimal index using server proxy
  const ragInputPath = '/tmp/docx_rag_input.json';
  if (!fs.existsSync(ragInputPath)) {
    throw new Error('DOCX chunks file not prepared. Please prepare JSON via docx_to_rag.py');
  }
  const req = await fetch('http://127.0.0.1:8080/v1/rag/index', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_GIGACHAT_API_KEY'
    },
    body: fs.readFileSync(ragInputPath)
  });
  const res = await req.json();
  return res;
}

async function queryRag(query, topK) {
  const res = await fetch('http://127.0.0.1:8080/v1/rag/query', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_GIGACHAT_API_KEY'
    },
    body: JSON.stringify({ query, topK })
  });
  return res.json();
}

module.exports = {
  name: 'docx-rag',
  run: async (params) => {
    const action = params.action;
    if (action === 'index') {
      const filePath = params.filePath;
      return indexDocx(filePath);
    } else if (action === 'query') {
      const { query, topK } = params;
      return queryRag(query, topK || 3);
    } else {
      throw new Error('Unknown action');
    }
  }
};
