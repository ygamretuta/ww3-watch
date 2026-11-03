// GET /api/flashpoint?id=russia: detail for one flashpoint.

import { flashpointDetail } from '../src/server/core.ts';
import { background, errorResponse, json } from '../src/server/web.ts';

export async function GET(request: Request): Promise<Response> {
  try {
    const detail = await flashpointDetail(new URL(request.url).searchParams.get('id') ?? '', background);
    return detail ? json(detail) : json({ error: 'unknown flashpoint' }, 404);
  } catch (e) {
    return errorResponse(e);
  }
}
