// Language filter + near-duplicate clustering of headlines.
// Ten outlets covering one strike become ONE story ("reported by 10 sources"), so volume of
// copy-paste coverage no longer inflates heat, while independent corroboration still counts.

import type { ClusteredArticle, RawArticle } from './article.ts';
import { sourceInfo, type SourceInfo } from './sources.ts';

const EN = new Set('the of and to in for on with as at by from is are was were after over new says say will has have its his her their us uk amid into than out up more not that this but who how why what'.split(' '));
// stopwords from other Latin-script languages (es/fr/de/nl/it/pt/id/ro/pl/tr)
const FOREIGN = new Set('de la el los las del que por para con una des les du et est dans sur pour qui der die das und nicht mit von ein eine het een van op voor di che per della sono nel yang dan dari untuk pada ini adalah dengan în și pentru este nie jest się na za od ve bir için da em não uma ao'.split(' '));

export function isEnglish(text: string): boolean {
  const letters = text.match(/\p{L}/gu) || [];
  if (!letters.length) return true;
  const latin = letters.filter((c) => /\p{Script=Latin}/u.test(c)).length;
  if (latin / letters.length < 0.75) return false; // Arabic, Cyrillic, Hangul, CJK...
  const words = text.toLowerCase().split(/[^\p{L}']+/u).filter(Boolean);
  let en = 0, foreign = 0;
  for (const w of words) { if (EN.has(w)) en++; if (FOREIGN.has(w)) foreign++; }
  return !(foreign >= 2 || (foreign >= 1 && en === 0));
}

const STOP = new Set([...EN, ...'a an be been could would should may might can may amid about against between during before while their them they he she it we you i our your also just now today live update updates report reports reportedly latest watch video photos analysis'.split(' ')]);

export const stems = (t: string): Set<string> => new Set(
  t.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.slice(0, 5)), // crude stem: russia/russian -> russi
);

export function similar(a: Set<string>, b: Set<string>): boolean {
  let inter = 0;
  for (const s of a) if (b.has(s)) inter++;
  if (inter < 2) return false;
  const jac = inter / (a.size + b.size - inter);
  const overlap = inter / Math.min(a.size, b.size);
  return (inter >= 3 && overlap >= 0.6 && jac >= 0.3) || jac >= 0.5;
}

interface Member {
  article: RawArticle;
  stems: Set<string>;
}

interface Cluster {
  ts: number;
  members: Member[];
}

export interface ClusterStats {
  nonEnglishHidden: number;
  merged: number;
  stories: number;
}

// articles: newest first.
export function clusterArticles(articles: RawArticle[]): { leads: ClusteredArticle[]; stats: ClusterStats } {
  const english = articles.filter((a) => isEnglish(a.title));
  const hidden = articles.length - english.length;

  const clusters: Cluster[] = [];
  for (const a of english) {
    const member: Member = { article: a, stems: stems(a.title) };
    const hit = clusters.find((c) =>
      Math.abs(c.ts - a.ts) < 48 * 3.6e6 && c.members.some((m) => similar(member.stems, m.stems)));
    if (hit) hit.members.push(member); else clusters.push({ ts: a.ts, members: [member] });
  }

  const leads = clusters.map((c): ClusteredArticle => {
    const infos = c.members.map((m) => ({ m: m.article, ...sourceInfo(m.article.source) }));
    // lead = most reliable, then has an image, then newest
    const sorted = infos.slice().sort((x, y) => y.weight - x.weight || Number(!!y.m.img) - Number(!!x.m.img) || y.m.ts - x.m.ts);
    const lead = sorted[0]!.m; // a cluster always has at least one member

    const byName = new Map<string, (typeof infos)[number]>();
    for (const x of infos) if (!byName.has(x.m.source)) byName.set(x.m.source, x);
    const uniq = [...byName.values()];
    const independent = uniq.filter((x) => !x.state).length;
    const li: SourceInfo = sourceInfo(lead.source);

    // heat multiplier: average source reliability x corroboration by independent outlets (capped)
    const rel = uniq.reduce((s, x) => s + x.weight, 0) / uniq.length;
    return {
      ...lead,
      sources: uniq.slice(0, 12).map((x) => ({ name: x.m.source, link: x.m.link, tier: x.tier })),
      count: uniq.length,
      ts: Math.max(...c.members.map((m) => m.article.ts)),
      img: lead.img || c.members.find((m) => m.article.img)?.article.img || '',
      tier: li.tier,
      state: li.state,
      weight: +(rel * Math.min(1 + 0.3 * Math.log2(Math.max(1, independent)), 1.9)).toFixed(2),
    };
  });

  return { leads, stats: { nonEnglishHidden: hidden, merged: english.length - leads.length, stories: leads.length } };
}
