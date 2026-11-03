// GET /api/briefing[?regen=1]: the daily briefing; regen rewrites it (rate-limited, may call the model).

import { getSnapshot, regenerateBriefing } from '../src/server/core.ts';
import { background, errorResponse, json } from '../src/server/web.ts';

export async function GET(request: Request): Promise<Response> {
  try {
    if (new URL(request.url).searchParams.has('regen')) return json(await regenerateBriefing(background));
    return json((await getSnapshot({ background })).data.briefing);
  } catch (e) {
    return errorResponse(e);
  }
}
