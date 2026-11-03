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
export const isStale = (b: BriefingRec | null): boolean => !b || Date.now() - b.t > MAX_AGE;

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
  flashpoints: { name: string; score: number; newsHeatPercent: number; topHeadlines: string[] }[];
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
      name: f.name, score: f.score, newsHeatPercent: f.heat,
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

function templateText(s: Snapshot): string {
  const d = s.changeVs24hPoints;
  const change = d == null ? '' : d === 0 ? ', unchanged over 24 hours' : `, ${d > 0 ? 'up' : 'down'} ${Math.abs(d)} points over 24 hours`;
  const lines = [`The risk index stands at ${s.riskPercent}% (${s.level})${change}.`, ''];
  lines.push('Where the pressure is:');
  s.flashpoints.slice(0, 3).forEach((f) => {
    lines.push(`- ${f.name} (${f.score}/100)${f.topHeadlines[0] ? ': ' + f.topHeadlines[0] : ''}`);
  });
  if (s.majorEventsLast24h.length) {
    lines.push('', 'Major stories in the last 24 hours:');
    s.majorEventsLast24h.slice(0, 3).forEach((t) => lines.push('- ' + t));
  }
  if (s.deEscalation.topStories.length) {
    lines.push('', `Signs of de-escalation (they add about ${s.deEscalation.daysAddedToCountdown} days to the countdown):`);
    s.deEscalation.topStories.slice(0, 2).forEach((t) => lines.push('- ' + t));
  }
  if (s.recentAlerts.length) lines.push('', 'Alerts raised: ' + s.recentAlerts.join('; ') + '.');
  lines.push('', 'This is an automated, heuristic read of public headlines, not a forecast.');
  return lines.join('\n');
}

const SYSTEM = `You write the daily briefing for a news-based geopolitical risk monitor.
Use ONLY the JSON snapshot you are given. Do not add events, numbers or context that are not in it.
Format, plain text, about 150-200 words:
1. One opening sentence: the risk level, the percentage, and the 24h change if provided.
2. A line "What moved:" then 2-3 hyphen bullets on the flashpoints and stories driving the score.
3. A line "What to watch:" then 1-2 hyphen bullets drawn from the highest-scoring flashpoints.
4. If deEscalation has stories, one sentence on the signs of de-escalation and how much time they add to the countdown.
5. A final sentence reminding the reader this is an automated heuristic, not a forecast.
Tone: calm, precise, neutral. No alarmism, no speculation about outcomes, no markdown symbols other than leading hyphens.`;

async function save(b: BriefingRec): Promise<BriefingRec> {
  await store.write(FILE, b);
  return b;
}

export async function makeBriefing(data: BriefingInput): Promise<BriefingRec> {
  const snap = snapshot(data);
  if (llmEnabled()) {
    try {
      const model = process.env.WW3_BRIEFING_MODEL || process.env.WW3_MODEL || 'claude-sonnet-5-5';
      const text = (await ask(SYSTEM, JSON.stringify(snap), { model, maxTokens: 700 })).trim();
      if (text) return await save({ t: Date.now(), text, method: 'llm', model });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return await save({ t: Date.now(), text: templateText(snap), method: 'template', note: 'AI briefing failed: ' + msg.slice(0, 120) });
    }
  }
  return await save({ t: Date.now(), text: templateText(snap), method: 'template' });
}
