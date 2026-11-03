// GET /api/cron: scheduled refresh (see vercel.json). Vercel sends `Authorization: Bearer $CRON_SECRET`.
// This keeps history and the event log recording even when nobody is visiting.

import { refreshSnapshot } from '../src/server/core.ts';
import { errorResponse, json } from '../src/server/web.ts';

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return json({ error: 'unauthorized' }, 401);
  try {
    const snap = await refreshSnapshot();
    return json(snap ? { refreshed: true, updated: snap.data.updated } : { refreshed: false, reason: 'another refresh is running' });
  } catch (e) {
    return errorResponse(e);
  }
}
