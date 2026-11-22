// Daily briefing: a short plain-English summary of where things stand.
// With ANTHROPIC_API_KEY an LLM writes it from a compact snapshot of the app's own data;
// without one, a deterministic template does. Cached on disk, regenerated about daily.

import type { ApiData, BriefingRec, History, Level } from '../shared/types.ts';
import { ask, llmEnabled } from './classify.ts';
import { store } from './storage.ts';

const FILE = 'briefing.json';
const MAX_AGE = 20 * 3.6e6;

export type BriefingInput = Omit<ApiData, 'briefing'>;

export const load = (): Promise<BriefingRec | null> => store.read<BriefingRec | null>(FILE, null);
// a record from before the structured format (no headline) is regenerated
export const isStale = (b: BriefingRec | null): boolean => !b || !b.headline || Date.now() - b.t > MAX_AGE;

function deltaVs24h(history: History, risk: number): number | null {
  const now = Date.now();
  const ref = history.points
    .filter((p) => now - p.t >= 20 * 3.6e6)
    .sort((a, b) => Math.abs(now - 864e5 - a.t) - Math.abs(now - 864e5 - b.t))[0];
  return ref ? Math.round((risk - ref.r) * 100) : null;
}

interface Snapshot {
  date: string;
  riskPercent: number;
  level: Level;
  changeVs24hPoints: number | null;
  flashpoints: { id: string; name: string; score: number; newsHeatPercent: number; topHeadlines: string[] }[];
  deEscalation: { signalStrengthPercent: number; daysAddedToCountdown: number; topStories: string[] };
  majorEventsLast24h: string[];
  recentAlerts: string[];
}

// compact view of the data; this is all the model sees
function snapshot(data: BriefingInput): Snapshot {
  const day = Date.now() - 864e5;
  return {
    date: new Date().toISOString().slice(0, 10),
    riskPercent: Math.round(data.risk * 100),
    level: data.level,
    changeVs24hPoints: deltaVs24h(data.history, data.risk),
    flashpoints: data.flashpoints.slice(0, 8).map((f) => ({
      id: f.id, name: f.name, score: f.score, newsHeatPercent: f.heat,
      topHeadlines: f.drivers.slice(0, 3).map((d) => `${d.title} (${d.source}${d.count > 1 ? `, +${d.count - 1} more outlets` : ''})`),
    })),
    deEscalation: {
      signalStrengthPercent: Math.round((data.mitigation || 0) * 100),
      daysAddedToCountdown: Math.round((data.delaySeconds || 0) / 86400),
      topStories: data.goodNews.stories.slice(0, 4).map((s) => `${s.title} (${s.source})`),
    },
    majorEventsLast24h: data.events.filter((e) => e.t >= day).slice(0, 6).map((e) => e.title),
    recentAlerts: data.alerts.filter((a) => a.t >= day).slice(0, 5).map((a) => a.title),
  };
}

type Parts = Pick<BriefingRec, 'headline' | 'watch' | 'deescalation' | 'lines'>;

function templateParts(s: Snapshot): Parts {
  const d = s.changeVs24hPoints;
  const change = d == null ? '' : d === 0 ? ', unchanged over 24 hours' : `, ${d > 0 ? 'up' : 'down'} ${Math.abs(d)} points over 24 hours`;
  const top = s.flashpoints.slice(0, 3).map((f) => `${f.name} (${f.score}/100)`);
  const days = s.deEscalation.daysAddedToCountdown;
  const story = s.deEscalation.topStories[0];
  return {
    headline: `The risk index stands at ${s.riskPercent}% (${s.level})${change}.`,
    watch: top.length ? `Highest pressure: ${top.join(', ')}.` : '',
    deescalation: story ? `Signs of de-escalation add about ${days} days to the countdown, led by: ${story}.` : '',
    lines: {},
  };
}

/** Plain-text rendering of the structured briefing (webhooks, fallbacks). */
function plainText(p: Parts, names: Map<string, string>): string {
  const lines = [p.headline];
  const moved = Object.entries(p.lines).filter(([, v]) => v);
  if (moved.length) lines.push('', ...moved.map(([id, v]) => `- ${names.get(id) ?? id}: ${v}`));
  if (p.watch) lines.push('', p.watch);
  if (p.deescalation) lines.push('', p.deescalation);
  lines.push('', 'This is an automated, heuristic read of public headlines, not a forecast.');
  return lines.join('\n');
}

const SYSTEM = `You write the daily briefing for a news-based geopolitical risk monitor.
Use ONLY the JSON snapshot you are given. Do not add events, numbers or context that are not in it.
Reply with ONLY a JSON object, no prose and no code fences, with these string fields:
- "headline": one sentence: the risk level, the percentage, and the 24h change if provided.
- "watch": one or two sentences on what to watch, drawn from the highest-scoring flashpoints.
- "deescalation": one sentence on the signs of de-escalation and how much time they add to the countdown; "" if there are no stories.
- "flashpoints": an object mapping a flashpoint id from the snapshot to ONE short sentence (under 25 words) on why it is where it is, based on its headlines. Include only the ids that matter, at most 6.
Tone: calm, precise, neutral. No alarmism, no speculation about outcomes, no markdown.`;

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

function parseParts(text: string, valid: Set<string>): Parts {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('no JSON object in reply');
  const j = JSON.parse(m[0]) as Record<string, unknown>;
  const headline = str(j.headline);
  if (!headline) throw new Error('reply has no headline');
  const lines: Record<string, string> = {};
  const raw = j.flashpoints && typeof j.flashpoints === 'object' ? (j.flashpoints as Record<string, unknown>) : {};
  for (const [id, v] of Object.entries(raw)) if (valid.has(id) && str(v)) lines[id] = str(v);
  return { headline, watch: str(j.watch), deescalation: str(j.deescalation), lines };
}

async function save(b: BriefingRec): Promise<BriefingRec> {
  await store.write(FILE, b);
  return b;
}

export async function makeBriefing(data: BriefingInput): Promise<BriefingRec> {
  const snap = snapshot(data);
  const names = new Map(data.flashpoints.map((f) => [f.id, f.name]));
  const fallback = (note?: string): Promise<BriefingRec> => {
    const p = templateParts(snap);
    return save({ t: Date.now(), ...p, text: plainText(p, names), method: 'template', ...(note ? { note } : {}) });
  };
  if (llmEnabled()) {
    try {
      const model = process.env.WW3_BRIEFING_MODEL || process.env.WW3_MODEL || 'claude-sonnet-5-5';
      const reply = await ask(SYSTEM, JSON.stringify(snap), { model, maxTokens: 900 });
      const p = parseParts(reply, new Set(snap.flashpoints.map((f) => f.id)));
      return await save({ t: Date.now(), ...p, text: plainText(p, names), method: 'llm', model });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return await fallback('AI briefing failed: ' + msg.slice(0, 120));
    }
  }
  return await fallback();
}
