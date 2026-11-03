// On-disk logs: score history, major events and good-news wins. All plain JSON files in data/.

import type { EventRec, History, HistoryPoint, WinRec } from '../shared/types.ts';
import type { ScoredArticle } from './article.ts';
import { similar, stems } from './cluster.ts';
import { FLASHPOINTS } from './feeds.ts';
import type { Analysis } from './analyze.ts';
import { dataFile, readList, writeJson } from './paths.ts';

const HOUR = 3.6e6;
const DAY = 24 * HOUR;
export const FP_IDS = FLASHPOINTS.map((f) => f.id);

// ---------- history ----------
// Points are {t, r: risk 0-1 (default model), s: [score per flashpoint, FLASHPOINTS order]}.
// Full resolution for 7 days, then thinned (one per 6h to 60d, one per day to 1 year).
const HISTORY_FILE = dataFile('history.json');

function compactHistory(h: HistoryPoint[]): HistoryPoint[] {
  const now = Date.now();
  const out: HistoryPoint[] = [];
  let lastBucket = '';
  for (const p of h) {
    const age = now - p.t;
    if (age > 365 * DAY) continue;
    const step = age < 7 * DAY ? 0 : age < 60 * DAY ? 6 * HOUR : DAY;
    if (!step) { out.push(p); lastBucket = ''; continue; }
    const bucket = step + ':' + Math.floor(p.t / step);
    if (bucket !== lastBucket) { out.push(p); lastBucket = bucket; }
  }
  return out;
}

export function recordHistory(analysis: Pick<Analysis, 'risk' | 'flashpoints'>): History {
  let h = readList<HistoryPoint>(HISTORY_FILE);
  const last = h[h.length - 1];
  if (!last || Date.now() - last.t > 25 * 60 * 1000) {
    const byId = new Map(analysis.flashpoints.map((f) => [f.id, f.score]));
    h.push({ t: Date.now(), r: analysis.risk, s: FP_IDS.map((id) => byId.get(id) ?? 0) });
    h = compactHistory(h);
    writeJson(HISTORY_FILE, h);
  }
  // old points (from before scores were stored) have no `s`; consumers tolerate that
  return { ids: FP_IDS, points: h };
}

// ---------- event log: big stories are remembered so the timeline outlives the feeds ----------
const EVENTS_FILE = dataFile('events.json');
export const loadEvents = (): EventRec[] => readList<EventRec>(EVENTS_FILE);

export function recordEvents(articles: ScoredArticle[]): EventRec[] {
  let ev = loadEvents();
  let dirty = false;
  for (const a of articles) {
    // major = high severity (corroborated or AI-rated), or moderately severe but widely reported
    const major = (a.severity >= 0.6 && (a.count > 1 || a.method === 'llm')) || (a.severity >= 0.3 && a.count >= 4);
    if (!major || !a.flashpoints.length) continue;
    const st = stems(a.title);
    const hit = ev.find((e) => Math.abs(e.t - a.ts) < 48 * HOUR && similar(st, stems(e.title)));
    if (hit) {
      if (a.count > hit.count || a.severity > hit.severity) {
        hit.count = Math.max(hit.count, a.count);
        hit.severity = Math.max(hit.severity, +a.severity.toFixed(2));
        dirty = true;
      }
    } else {
      ev.push({
        t: a.ts, title: a.title, link: a.link, source: a.source, count: a.count,
        severity: +a.severity.toFixed(2), flashpoints: a.flashpoints, method: a.method,
      });
      dirty = true;
    }
  }
  if (dirty) {
    ev = ev.filter((e) => Date.now() - e.t < 365 * DAY).sort((x, y) => y.t - x.t).slice(0, 800);
    writeJson(EVENTS_FILE, ev);
  }
  return ev.slice(0, 80);
}

// ---------- wins log: notable de-escalation / humanitarian stories, kept for a year ----------
const WINS_FILE = dataFile('wins.json');

export function recordWins(goods: ScoredArticle[]): WinRec[] {
  let ev = readList<WinRec>(WINS_FILE);
  let dirty = false;
  for (const a of goods) {
    const notable = (a.relief >= 0.6 && (a.count > 1 || a.method === 'llm')) || (a.relief >= 0.5 && a.count >= 3);
    if (!notable) continue;
    const st = stems(a.title);
    const hit = ev.find((e) => Math.abs(e.t - a.ts) < 48 * HOUR && similar(st, stems(e.title)));
    if (hit) {
      if (a.count > hit.count) { hit.count = a.count; dirty = true; }
    } else {
      ev.push({ t: a.ts, title: a.title, link: a.link, source: a.source, count: a.count, relief: +a.relief.toFixed(2), kind: a.kind, theatres: a.theatres });
      dirty = true;
    }
  }
  if (dirty) {
    ev = ev.filter((e) => Date.now() - e.t < 365 * DAY).sort((x, y) => y.t - x.t).slice(0, 800);
    writeJson(WINS_FILE, ev);
  }
  return ev.slice(0, 60);
}
