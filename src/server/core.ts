// Transport-independent core: the refresh pipeline plus a persisted "snapshot" of its result.
//
// The same code serves the local Node server and the Vercel functions. State that has to survive
// between requests lives in the store (snapshot, lock, logs), never in module variables, because a
// serverless instance can vanish at any time. Reads are stale-while-revalidate: callers get the last
// snapshot immediately and a refresh is kicked off in the background when it is old.

import type { ApiData, BriefingRec, DetailStory, FeedStory, FlashpointDetail, GoodStory, Kind, SourceRef, TheatreSummary, Tier } from '../shared/types.ts';
import { dashboardLink, detect, loadAlerts, notifyAlerts, sendWebhook, webhookConfigured } from './alerts.ts';
import { analyze } from './analyze.ts';
import type { RawArticle, ScoredArticle } from './article.ts';
import { isStale as briefingStale, load as loadBriefing, makeBriefing } from './briefing.ts';
import { classify } from './classify.ts';
import { clusterArticles } from './cluster.ts';
import { FEEDS, FLASHPOINTS, KINDS, REFERENCE } from './feeds.ts';
import { loadEvents, recordEvents, recordHistory, recordWins } from './logs.ts';
import { enrichImages, fetchFeed } from './rss.ts';
import { store } from './storage.ts';

const MAX_AGE_H = 72;
const FRESH_MS = 10 * 60 * 1000; // a snapshot younger than this is served as is
const MIN_FORCE_MS = 2 * 60 * 1000; // "Refresh" is ignored if the data is younger than this
const LOCK_MS = 4 * 60 * 1000; // a refresh lock older than this is considered abandoned
const BRIEFING_REGEN_MS = 5 * 60 * 1000; // minimum gap between manual briefing regenerations
const SNAPSHOT_KEY = 'snapshot.json';
const LOCK_KEY = 'refresh-lock.json';

export interface FlashpointExtra {
  stories: DetailStory[];
  outlets: { name: string; tier: Tier; count: number }[];
}

export interface Snapshot {
  data: ApiData;
  detail: Record<string, FlashpointExtra>;
}

/** Runs a promise after the response is sent (Vercel's waitUntil) or just lets it run (local). */
export type Background = (work: Promise<unknown>) => void;

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

/** The full pipeline: fetch feeds, cluster, rate, score, log, alert, brief. */
async function buildSnapshot(): Promise<Snapshot> {
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
  const history = await recordHistory(analysis);
  const events = await recordEvents(scored);

  const feed = scored
    .filter((a) => !a.good && (a.method === 'llm' ? !!a.llm?.relevant : (a.flashpoints.length > 0 || a.categories.size > a.feedTags.length)))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 200)
    .map(feedStory);

  // alerts: compare with the previous refresh, log, and push to the webhook if configured
  await notifyAlerts(await detect(analysis, history)).catch(() => {});

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
      wins: await recordWins(goods),
      stories: goods.slice(0, 150).map(goodStory),
    },
    classifier,
    stats: { ...stats, rawItems: raw.length },
    ...analysis,
    history,
    events,
    alerts: (await loadAlerts()).slice(-30).reverse(),
    alertConfig: { webhook: webhookConfigured() },
    reference: REFERENCE,
    articles: feed,
    sources: {
      ok: results.filter((r) => !r.error).map((r) => r.feed.name),
      failed: results.flatMap((r) => (r.error ? [{ name: r.feed.name, error: r.error }] : [])),
    },
  };

  // daily briefing (LLM if a key is set, template otherwise), regenerated when stale
  let briefing = await loadBriefing();
  if (briefingStale(briefing)) {
    briefing = await makeBriefing(data);
    sendWebhook(`📰 WW3 Watch daily briefing\n${briefing.text}${dashboardLink()}`).catch(() => {});
  }

  return { data: { ...data, briefing }, detail: buildDetail(scored) };
}

// ---------- snapshot persistence ----------
let memo: { snap: Snapshot; at: number } | null = null; // per-instance read cache, a few seconds long
const MEMO_MS = 15 * 1000;

export async function loadSnapshot(): Promise<Snapshot | null> {
  if (memo && Date.now() - memo.at < MEMO_MS) return memo.snap;
  const snap = await store.read<Snapshot | null>(SNAPSHOT_KEY, null);
  if (snap) memo = { snap, at: Date.now() };
  return snap;
}

async function saveSnapshot(snap: Snapshot): Promise<void> {
  memo = { snap, at: Date.now() };
  await store.write(SNAPSHOT_KEY, snap);
}

/**
 * Rebuild the snapshot. Returns null if another instance is already refreshing (the lock keeps
 * concurrent visitors from each firing 50 feed requests and a pile of model calls).
 */
export async function refreshSnapshot(): Promise<Snapshot | null> {
  const lock = await store.read<{ t: number }>(LOCK_KEY, { t: 0 });
  if (Date.now() - lock.t < LOCK_MS) return null;
  await store.write(LOCK_KEY, { t: Date.now() });
  try {
    const snap = await buildSnapshot();
    await saveSnapshot(snap);
    return snap;
  } finally {
    await store.write(LOCK_KEY, { t: 0 });
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const logFailure = (e: unknown): void => console.error('refresh failed:', e);

export interface GetOptions {
  force?: boolean;
  background: Background;
}

/** Latest snapshot, refreshing as needed (stale-while-revalidate). */
export async function getSnapshot({ force = false, background }: GetOptions): Promise<Snapshot> {
  const snap = await loadSnapshot();
  const age = snap ? Date.now() - snap.data.updated : Infinity;

  if (snap && age < FRESH_MS && !(force && age > MIN_FORCE_MS)) return snap;

  if (snap && !force) {
    background(refreshSnapshot().catch(logFailure)); // serve what we have, refresh behind the response
    return snap;
  }

  // forced, or nothing stored yet: the caller needs fresh data, so wait for it
  const built = await refreshSnapshot().catch((e: unknown) => { logFailure(e); return null; });
  if (built) return built;
  if (snap) return snap;
  for (let i = 0; i < 25; i++) { // another instance is building the very first snapshot
    await sleep(2000);
    memo = null;
    const s = await loadSnapshot();
    if (s) return s;
  }
  throw new Error('data is still warming up, try again in a minute');
}

// ---------- endpoints' logic ----------
export async function regenerateBriefing(background: Background): Promise<BriefingRec | null> {
  const snap = await getSnapshot({ background });
  const current = snap.data.briefing;
  if (current && Date.now() - current.t < BRIEFING_REGEN_MS) return current; // each call can cost a model request
  const fresh = await makeBriefing(snap.data);
  await saveSnapshot({ ...snap, data: { ...snap.data, briefing: fresh } });
  return fresh;
}

export async function flashpointDetail(id: string, background: Background): Promise<FlashpointDetail | null> {
  const { data, detail } = await getSnapshot({ background });
  const flashpoint = data.flashpoints.find((f) => f.id === id);
  if (!flashpoint) return null;
  const k = data.history.ids.indexOf(id);
  const extra = detail[id] ?? { stories: [], outlets: [] };
  return {
    updated: data.updated, risk: data.risk, level: data.level,
    flashpoint,
    scoreHistory: data.history.points.flatMap((p) => {
      const s = p.s?.[k];
      return s === undefined ? [] : [{ t: p.t, s }];
    }),
    events: (await loadEvents()).filter((e) => e.flashpoints.includes(id)).slice(0, 100),
    alerts: (await loadAlerts()).filter((a) => a.fp === id).slice(-10).reverse(),
    ...extra,
  };
}
