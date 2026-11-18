// Vercel serverless endpoint for the shared wall state.
// Requires UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN in the project's
// environment variables; without them this returns a clear 503 rather than
// silently losing writes (serverless has no writable disk).

import { readState, writeState, backend } from '../server/store.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  try {
    if (req.method === 'GET') {
      const state = await readState();
      return res.status(200).json(state ?? { empty: true });
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      // Serverless has no writable disk: refuse with a clear hint instead of
      // failing on EROFS halfway through the request.
      if (backend !== 'upstash') {
        return res.status(503).json({
          error: 'No writable state backend on this deployment.',
          hint: 'Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in Vercel project settings.',
        });
      }

      let body = req.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch {
          return res.status(400).json({ error: 'body is not valid JSON' });
        }
      }
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return res.status(400).json({ error: 'body must be a JSON object' });
      }
      const saved = await writeState(body);
      return res.status(200).json(saved);
    }

    res.setHeader('Allow', 'GET, PUT, POST');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (error) {
    const message = String(error?.message || error);
    if (message.includes('Upstash')) {
      return res.status(500).json({
        error: message,
        hint: 'Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in Vercel project settings.',
      });
    }
    return res.status(500).json({ error: message });
  }
}
