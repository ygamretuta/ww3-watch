// Helpers shared by the Vercel function entrypoints in api/.

import { waitUntil } from '@vercel/functions';
import type { Background } from './core.ts';

/** Keep the function alive until the work finishes, after the response has been sent. */
export const background: Background = (work) => waitUntil(work);

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export const errorResponse = (e: unknown): Response =>
  json({ error: e instanceof Error ? e.message : String(e) }, 500);
