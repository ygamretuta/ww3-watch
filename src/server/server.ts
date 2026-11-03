// Dependency-free server: fetches RSS feeds, scores flashpoints, serves the UI.
// Run: node src/server/server.ts   (Node strips the types; the browser code is built with `npm run build`)

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { ApiData, DetailStory, FeedStory, FlashpointDetail, GoodStory, Kind, SourceRef, Tier, TheatreSummary } from '../shared/types.ts';
import { dashboardLink, detect, loadAlerts, notifyAlerts, sendWebhook, webhookConfigured } from './alerts.ts';
import { analyze } from './analyze.ts';
import type { ScoredArticle } from './article.ts';
import { isStale as briefingStale, load as loadBriefing, makeBriefing } from './briefing.ts';
import { classify } from './classify.ts';
import { clusterArticles } from './cluster.ts';
import { FEEDS, FLASHPOINTS, KINDS, REFERENCE } from './feeds.ts';
import { PUBLIC_DIR } from './paths.ts';
import { enrichImages, fetchFeed } from './rss.ts';
import type { RawArticle } from './article.ts';
import { loadEvents, recordEvents, recordHistory, recordWins } from './store.ts';

const PORT = Number(process.env.PORT) || 3000;
const CACHE_MS = 10 * 60 * 1000;
const MAX_AGE_H = 72;

interface FlashpointExtra {
  stories: DetailStory[];
  outlets: { name: string; tier: Tier; count: number }[];
}

let cache: ApiData | null = null;
let inflight: Promise<ApiData> | null = null;
let fpDetail: Record<string, FlashpointExtra> = {};

const round2 = (n: number): number => +n.toFixed(2);

function feedStory(a: ScoredArticle): FeedStory {
  return {
    title: a.title, link: a.link, source: a.source, ts: a.ts, summary: a.summary, img: a.img, method: a.method,
    count: a.count, sources: a.sources, tier: a.tier, state: a.state,
    severity: round2(a.severity), flashpoints: a.flashpoints, categories: [...a.categories],
  };
}

function detailStory(a: ScoredArticle): DetailStory {
  return {
    title: a.title, link: a.link, source: a.source, ts: a.ts, img: a.img, summary: a.summary, method: a.method,
    severity: round2(a.severity), count: a.count, sources: a.sources, tier: a.tier,
  };
}

function goodStory(a: ScoredArticle): GoodStory {
  return {
    title: a.title, link: a.link, source: a.source, ts: a.ts, img: a.img, summary: a.summary, method: a.method,
    relief: round2(a.relief), kind: a.kind, theatres: a.theatres, count: a.count, sources: a.sources, tier: a.tier,
  };
}

/** Per-flashpoint detail pages: every current story plus an outlet tally. */
function buildDetail(articles: ScoredArticle[]): Record<string, FlashpointExtra> {
  const detail: Record<string, FlashpointExtra> = {};
  for (const f of FLASHPOINTS) {
    const stories = articles.filter((a) => a.flashpoints.includes(f.id)).sort((a, b) => b.ts - a.ts).slice(0, 120);
    const outlets = new Map<string, { name: string; tier: Tier; count: number }>();
    for (const a of stories) {
      const refs: Pick<SourceRef, 'name' | 'tier'>[] = a.sources.length ? a.sources : [{ name: a.source, tier: a.tier }];
      for (const s of refs) {
        const o = outlets.get(s.name) ?? { name: s.name, tier: s.tier, count: 0 };
        o.count++;
        outlets.set(s.name, o);
      }
    }
    detail[f.id] = {
      stories: stories.map(detailStory),
      outlets: [...outlets.values()].sort((x, y) => y.count - x.count).slice(0, 40),
    };
  }
  return detail;
}

async function refresh(): Promise<ApiData> {
  const results = await Promise.all(FEEDS.map(fetchFeed));
  const cutoff = Date.now() - MAX_AGE_H * 3.6e6;
  const seen = new Set<string>();
  const raw: RawArticle[] = [];
  for (const r of results) {
    for (const a of r.items ?? []) {
      const key = a.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 70);
      if (a.ts < cutoff || a.ts > Date.now() + 3.6e6 || seen.has(key)) continue;
      seen.add(key);
      raw.push(a);
    }
  }
  raw.sort((a, b) => b.ts - a.ts);

  // drop non-English, merge near-duplicates into one story with a source list
  const { leads, stats } = clusterArticles(raw);
  const [classifier] = await Promise.all([
    classify(leads, FLASHPOINTS), // newest first
    enrichImages(leads),
  ]);
  const { analysis, scored } = analyze(leads);
  const history = recordHistory(analysis);
  const events = recordEvents(scored);

  const feed = scored
    .filter((a) => !a.good && (a.method === 'llm' ? !!a.llm?.relevant : (a.flashpoints.length > 0 || a.categories.size > a.feedTags.length)))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 200)
    .map(feedStory);

  // alerts: compare with the previous refresh, log, and push to the webhook if configured
  notifyAlerts(detect(analysis, history)).catch(() => {});

  fpDetail = buildDetail(scored);

  // good news: de-escalation and humanitarian stories, by kind and by theatre
  const goods = scored.filter((a) => a.good).sort((a, b) => b.ts - a.ts);
  const kindCounts = new Map<Kind, number>();
  for (const a of goods) kindCounts.set(a.kind, (kindCounts.get(a.kind) ?? 0) + 1);
  const theatres = FLASHPOINTS.map((f): TheatreSummary => {
    const list = goods.filter((a) => a.theatres.includes(f.id));
    const best = list.slice().sort((x, y) => y.relief * y.weight - x.relief * x.weight)[0];
    return {
      id: f.id, name: f.name, count: list.length,
      top: best ? { title: best.title, link: best.link, source: best.source, kind: best.kind } : null,
    };
  }).filter((t) => t.count).sort((a, b) => b.count - a.count);

  const data: Omit<ApiData, 'briefing'> = {
    updated: Date.now(),
    goodNews: {
      kinds: Object.entries(KINDS).map(([id, k]) => ({ id, label: k.label, count: kindCounts.get(id as Kind) ?? 0 })),
      total: goods.length,
      theatres,
      wins: recordWins(goods),
      stories: goods.slice(0, 150).map(goodStory),
    },
    classifier,
    stats: { ...stats, rawItems: raw.length },
    ...analysis,
    history,
    events,
    alerts: loadAlerts().slice(-30).reverse(),
    alertConfig: { webhook: webhookConfigured() },
    reference: REFERENCE,
    articles: feed,
    sources: {
      ok: results.filter((r) => !r.error).map((r) => r.feed.name),
      failed: results.flatMap((r) => (r.error ? [{ name: r.feed.name, error: r.error }] : [])),
    },
  };

  // daily briefing (LLM if a key is set, template otherwise), regenerated when stale
  let briefing = loadBriefing();
  if (briefingStale(briefing)) {
    briefing = await makeBriefing(data);
    sendWebhook(`📰 WW3 Watch daily briefing\n${briefing.text}${dashboardLink()}`).catch(() => {});
  }

  cache = { ...data, briefing };
  return cache;
}

async function getData(force: boolean): Promise<ApiData> {
  if (!force && cache && Date.now() - cache.updated < CACHE_MS) return cache;
  inflight ??= refresh().finally(() => { inflight = null; });
  return inflight;
}

// ---------- http ----------
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

  if (url.pathname === '/api/briefing') {
    try {
      const data = await getData(false);
      if (url.searchParams.has('regen')) data.briefing = await makeBriefing(data);
      return json(200, data.briefing);
    } catch (e) { return json(500, { error: message(e) }); }
  }

  if (url.pathname === '/api/flashpoint') {
    try {
      const data = await getData(false);
      const id = url.searchParams.get('id') ?? '';
      const flashpoint = data.flashpoints.find((f) => f.id === id);
      if (!flashpoint) return json(404, { error: 'unknown flashpoint' });
      const k = data.history.ids.indexOf(id);
      const extra = fpDetail[id] ?? { stories: [], outlets: [] };
      const body: FlashpointDetail = {
        updated: data.updated, risk: data.risk, level: data.level,
        flashpoint,
        scoreHistory: data.history.points.flatMap((p) => {
          const s = p.s?.[k];
          return s === undefined ? [] : [{ t: p.t, s }];
        }),
        events: loadEvents().filter((e) => e.flashpoints.includes(id)).slice(0, 100),
        alerts: loadAlerts().filter((a) => a.fp === id).slice(-10).reverse(),
        ...extra,
      };
      return json(200, body);
    } catch (e) { return json(500, { error: message(e) }); }
  }

  if (url.pathname === '/api/data') {
    try {
      return json(200, await getData(url.searchParams.has('force')));
    } catch (e) { return json(500, { error: message(e) }); }
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
  getData(false).catch(() => {});
  // keep recording history/events even when nobody has the page open
  setInterval(() => getData(true).catch(() => {}), 15 * 60 * 1000);
});
