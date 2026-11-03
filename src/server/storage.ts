// Persistence: one tiny async key/value store of JSON documents.
//   - locally (no Blob token): files under data/
//   - on Vercel (BLOB_READ_WRITE_TOKEN set): a private Vercel Blob store
// Everything that must survive between requests (history, events, alerts, caches, the latest
// snapshot) goes through here, because serverless functions have no persistent disk.

import fs from 'node:fs/promises';
import path from 'node:path';
import { BlobNotFoundError, get, put } from '@vercel/blob';
import { ROOT } from './paths.ts';

export interface Store {
  /**
   * Read a JSON document. A document that was never written yields the fallback; any other failure
   * (network, auth, corrupt JSON) throws, so a transient error can't be mistaken for "empty" and
   * overwrite real data (a history log read as [] would be rewritten with a single point).
   */
  read<T>(key: string, fallback: T): Promise<T>;
  /** Write a JSON document (best effort: failures are logged, not thrown). */
  write(key: string, value: unknown): Promise<void>;
}

class FileStore implements Store {
  private readonly dir = path.join(ROOT, 'data');

  async read<T>(key: string, fallback: T): Promise<T> {
    let text: string;
    try {
      text = await fs.readFile(path.join(this.dir, key), 'utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return fallback; // never written yet
      throw e;
    }
    return JSON.parse(text) as T;
  }

  async write(key: string, value: unknown): Promise<void> {
    try {
      await fs.mkdir(this.dir, { recursive: true });
      await fs.writeFile(path.join(this.dir, key), JSON.stringify(value));
    } catch (e) {
      console.error(`store: could not write ${key}:`, e);
    }
  }
}

class BlobStore implements Store {
  async read<T>(key: string, fallback: T): Promise<T> {
    let r;
    try {
      // useCache:false reads the origin, so a document written a moment ago is never served stale
      r = await get(key, { access: 'private', useCache: false });
    } catch (e) {
      if (e instanceof BlobNotFoundError) return fallback; // never written yet
      throw e;
    }
    if (!r) return fallback; // never written yet
    if (r.statusCode !== 200) throw new Error(`blob ${key}: unexpected status ${r.statusCode}`);
    return JSON.parse(await new Response(r.stream).text()) as T;
  }

  async write(key: string, value: unknown): Promise<void> {
    try {
      await put(key, JSON.stringify(value), {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json',
        cacheControlMaxAge: 60,
      });
    } catch (e) {
      console.error(`store: could not write ${key}:`, e);
    }
  }
}

export const store: Store = process.env.BLOB_READ_WRITE_TOKEN ? new BlobStore() : new FileStore();

/** Read a JSON array; anything missing or malformed yields []. */
export async function readList<T>(key: string): Promise<T[]> {
  const v = await store.read<unknown>(key, []);
  return Array.isArray(v) ? (v as T[]) : [];
}
