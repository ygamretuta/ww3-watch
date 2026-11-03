// Local server: serves the UI and the API from the same core the Vercel functions use.
// Run: node src/server/server.ts   (Node strips the types; the browser code is built with `npm run build`)

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { flashpointDetail, getSnapshot, refreshSnapshot, regenerateBriefing, type Background } from './core.ts';
import { PUBLIC_DIR } from './paths.ts';

const PORT = Number(process.env.PORT) || 3000;

// locally there is no response lifecycle to extend: just let the work run
const background: Background = (work) => { void work; };

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
};

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  const json = (code: number, body: unknown): void => {
    res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  };

  try {
    if (url.pathname === '/api/data') {
      return json(200, (await getSnapshot({ force: url.searchParams.has('force'), background })).data);
    }
    if (url.pathname === '/api/briefing') {
      if (url.searchParams.has('regen')) return json(200, await regenerateBriefing(background));
      return json(200, (await getSnapshot({ background })).data.briefing);
    }
    if (url.pathname === '/api/flashpoint') {
      const detail = await flashpointDetail(url.searchParams.get('id') ?? '', background);
      return detail ? json(200, detail) : json(404, { error: 'unknown flashpoint' });
    }
  } catch (e) {
    return json(500, { error: message(e) });
  }

  const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const file = path.join(PUBLIC_DIR, path.normalize(rel));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    res.end(buf);
  });
}).listen(PORT, () => {
  console.log(`WW3 Watch running at http://localhost:${PORT}`);
  void getSnapshot({ background }).catch(() => {});
  // keep recording history/events even when nobody has the page open
  setInterval(() => void refreshSnapshot().catch(() => {}), 15 * 60 * 1000);
});
