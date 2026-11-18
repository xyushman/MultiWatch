// Durable storage for the shared wall state.
//
// Two backends, picked by environment:
//   * Upstash Redis REST  - when UPSTASH_REDIS_REST_URL and
//                           UPSTASH_REDIS_REST_TOKEN are set (Vercel).
//   * Local JSON file     - everything else (Railway, Docker, `npm run serve`).
//
// Only a single small object is stored, so this deliberately avoids any
// dependency and any schema.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KEY = 'multiwatch:state';

const REST_URL = (process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/+$/, '');
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const useRemote = Boolean(REST_URL && REST_TOKEN);

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = process.env.MULTIWATCH_DATA_FILE
  || path.join(here, '..', 'data', 'state.json');

export const backend = useRemote ? 'upstash' : 'file';

// Serializes writes so two concurrent requests cannot interleave a
// read-modify-write and lose the newer value.
let writeQueue = Promise.resolve();

async function readFileState() {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null; // missing file or unreadable JSON: treat as "nothing yet"
  }
}

async function writeFileState(value) {
  writeQueue = writeQueue.then(async () => {
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    // Write then rename so a crash cannot leave a half-written state file.
    const temp = `${DATA_FILE}.tmp`;
    await fs.writeFile(temp, JSON.stringify(value, null, 2), 'utf8');
    await fs.rename(temp, DATA_FILE);
  });
  return writeQueue;
}

export async function readState() {
  if (useRemote) {
    const res = await fetch(`${REST_URL}/get/${KEY}`, {
      headers: { Authorization: `Bearer ${REST_TOKEN}` },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Upstash GET failed: ${res.status}`);
    const body = await res.json();
    if (!body || body.result === null || body.result === undefined) return null;
    try {
      return JSON.parse(body.result);
    } catch {
      return null;
    }
  }
  return readFileState();
}

export async function writeState(value) {
  const payload = { ...value, updatedAt: Date.now() };

  if (useRemote) {
    const res = await fetch(`${REST_URL}/set/${KEY}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${REST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      // Upstash stores the raw body as the value, so the state is stored as a
      // JSON string and parsed again on read.
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Upstash SET failed: ${res.status}`);
    return payload;
  }

  await writeFileState(payload);
  return payload;
}
