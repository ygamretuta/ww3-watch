// Scoring: turns clustered stories into per-flashpoint heat, de-escalation mitigation and the global index.

import type { Driver, FlashpointApi, Kind, Level } from '../shared/types.ts';
import { DEFAULT_MAX_CREDIT, compute } from '../shared/model.ts';
import type { ClusteredArticle, ScoredArticle } from './article.ts';
import { CATEGORIES, DEESCALATE, ESCALATE, FLASHPOINTS, RELIEF_MIN, keywordRelief } from './feeds.ts';

const RELIEF_K = 10; // weighted good-news "mass" at which de-escalation signal reaches ~63% strength

const clamp = (x: number, a: number, b: number): number => Math.max(a, Math.min(b, x));

function severity(text: string): number {
  let s = 0;
  for (const [re, w] of ESCALATE) if (re.test(text)) s += w;
  for (const [re, w] of DEESCALATE) if (re.test(text)) s += w;
  return clamp(s, 0, 8) / 8; // 0..1
}

export interface Analysis {
  risk: number;
  level: Level;
  secondsRemaining: number;
  flashpoints: FlashpointApi[];
  rawRisk: number;
  credit: number;
  secondsBase: number;
  delaySeconds: number;
  mitigation: number;
  maxCredit: number;
}

interface FlashpointAcc {
  sum: number;
  items: { a: ScoredArticle; c: number }[];
}

/** Scores every story, then rolls them up into flashpoints and the global index. */
export function analyze(articles: ClusteredArticle[]): { analysis: Analysis; scored: ScoredArticle[] } {
  const now = Date.now();
  const acc = new Map<string, FlashpointAcc>(FLASHPOINTS.map((f) => [f.id, { sum: 0, items: [] }]));
  let reliefSum = 0;

  const scored = articles.map((a): ScoredArticle => {
    const text = a.title + ' ' + a.summary;
    const categories = new Set(a.feedTags);
    for (const [cat, re] of Object.entries(CATEGORIES)) if (re.test(text)) categories.add(cat);

    let method: ScoredArticle['method'];
    let sev: number;
    let tags: string[];
    let relief: number;
    let kind: Kind;
    let flashpointsAllowed = true;
    if (a.llm) {
      // model judgement: drops off-topic stories, scores the event itself
      method = 'llm';
      sev = a.llm.relevant ? clamp(a.llm.severity / 10, 0, 1) : 0;
      tags = a.llm.flashpoints;
      flashpointsAllowed = a.llm.relevant;
      const r = a.llm.relief != null ? { relief: a.llm.relief / 10, kind: a.llm.kind ?? 'none' } : keywordRelief(a.title);
      relief = r.relief;
      kind = r.kind;
    } else {
      method = 'keyword';
      sev = severity(text);
      tags = FLASHPOINTS.filter((f) => f.re.test(text)).map((f) => f.id);
      ({ relief, kind } = keywordRelief(a.title));
    }

    // De-escalation / humanitarian stories live on the good-news side: they cool things down
    // instead of adding heat, and they feed the mitigation credit.
    const good = relief >= RELIEF_MIN && kind !== 'none';
    const flashpoints = good || !flashpointsAllowed ? [] : tags;
    const story: ScoredArticle = {
      ...a, categories, method, severity: sev, relief, kind, good,
      flashpoints, theatres: good ? tags : [],
    };

    const decay = Math.pow(0.5, (now - a.ts) / 3.6e6 / 24); // 24h half-life
    if (good) reliefSum += decay * relief * (a.weight || 1);
    for (const id of flashpoints) {
      const slot = acc.get(id);
      if (!slot) continue; // the classifier returned an id we don't track
      const c = decay * (0.3 + sev) * (a.weight || 1); // source reliability x corroboration
      slot.sum += c;
      slot.items.push({ a: story, c });
    }
    return story;
  });

  const heats = FLASHPOINTS.map((f) => 1 - Math.exp(-(acc.get(f.id)?.sum ?? 0) / 10)); // saturating 0..1
  const mitigation = 1 - Math.exp(-reliefSum / RELIEF_K); // saturating 0..1
  const m = compute(
    FLASHPOINTS.map((f, i) => ({ baseline: f.baseline, weight: f.weight, heat: heats[i] ?? 0 })),
    mitigation,
  );

  const flashpoints = FLASHPOINTS.map((f, i): FlashpointApi => {
    const { sum, items } = acc.get(f.id) ?? { sum: 0, items: [] };
    const heat = heats[i] ?? 0;
    const sorted = items.slice().sort((x, y) => y.a.severity - x.a.severity || y.a.ts - x.a.ts).map((x) => x.a);
    const drivers = items.slice().sort((x, y) => y.c - x.c).slice(0, 5).map(({ a, c }): Driver => ({
      title: a.title, link: a.link, source: a.source, method: a.method, count: a.count, tier: a.tier,
      ageH: +((now - a.ts) / 3.6e6).toFixed(1),
      severity: +a.severity.toFixed(2),
      points: sum ? +((c / sum) * heat * 35).toFixed(1) : 0, // share of the +35 news component
    }));
    return {
      id: f.id, name: f.name, baseline: f.baseline, weight: f.weight, geo: f.geo ?? null,
      score: m.scores[i] ?? 0, heat: Math.round(heat * 100), heatRaw: +heat.toFixed(4),
      riskShare: +(m.riskShare[i] ?? 0).toFixed(3), mentions: items.length,
      top: sorted.slice(0, 3).map((a) => ({ title: a.title, link: a.link, source: a.source })),
      img: sorted.find((a) => a.img)?.img ?? '',
      drivers,
    };
  }).sort((a, b) => b.score - a.score);

  return {
    scored,
    analysis: {
      risk: m.risk, level: m.level, secondsRemaining: m.secondsRemaining, flashpoints,
      rawRisk: m.rawRisk, credit: m.credit, secondsBase: m.secondsBase, delaySeconds: m.delaySeconds,
      mitigation: +mitigation.toFixed(3), maxCredit: DEFAULT_MAX_CREDIT,
    },
  };
}
