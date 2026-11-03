// GET /api/data[?force=1]: the dashboard payload (latest snapshot, refreshed behind the response when stale).

import { getSnapshot } from '../src/server/core.ts';
import { background, errorResponse, json } from '../src/server/web.ts';

export async function GET(request: Request): Promise<Response> {
  try {
    const force = new URL(request.url).searchParams.has('force');
    return json((await getSnapshot({ force, background })).data);
  } catch (e) {
    return errorResponse(e);
  }
}
