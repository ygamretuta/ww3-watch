// Alert engine: notices meaningful moves between refreshes, logs them, and optionally pushes
// them to a webhook (Slack, Discord, ntfy-style endpoints that accept JSON).
//
// Rules (all on the default model, so they don't depend on anyone's slider settings):
//   level    the risk level changed (e.g. SEVERE -> CRITICAL), up or down
//   spike    a flashpoint's score rose >= 8 points over ~6 hours
//   critical a flashpoint crossed up into 75+
// Each flashpoint alert has a 6h cooldown so one long story doesn't ping repeatedly.
//
// Config (env or .env): ALERT_WEBHOOK_URL, PUBLIC_URL (link included in webhook messages)

import type { AlertRec, FlashpointApi, History, Level } from '../shared/types.ts';
import { dataFile, readJson, readList, writeJson } from './paths.ts';

const STATE_FILE = dataFile('alert-state.json');
const LOG_FILE = dataFile('alerts.json');
const HOUR = 3.6e6;
const COOLDOWN = 6 * HOUR;
const SPIKE = 8;
const CRITICAL = 75;
const LEVELS: Level[] = ['ELEVATED', 'HIGH', 'SEVERE', 'CRITICAL', 'IMMINENT'];
const FLOORS = [0, 0.3, 0.45, 0.6, 0.75];
const HYST = 0.02;

interface AlertState {
  level?: Level;
  risk?: number;
  fp: Record<string, number>; // last alert time per flashpoint (cooldown)
  scores: Record<string, number>; // scores at the previous refresh
}

export interface AnalysisForAlerts {
  risk: number;
  level: Level;
  flashpoints: FlashpointApi[];
}

type NewAlert = Omit<AlertRec, 'id' | 't'>;

export const loadAlerts = (): AlertRec[] => readList<AlertRec>(LOG_FILE);

export function detect(analysis: AnalysisForAlerts, history: History): AlertRec[] {
  const now = Date.now();
  const st = readJson<Partial<AlertState>>(STATE_FILE, {});
  const fpCooldown = st.fp ?? {};
  const lastScores = st.scores ?? {};
  const out: NewAlert[] = [];
  const pct = (r: number): string => Math.round(r * 100) + '%';

  // Hysteresis: the index must clear a level boundary by 2 points before it counts, so a value
  // hovering at 60% doesn't flip CRITICAL/SEVERE and fire an alert every refresh.
  let level = analysis.level;
  if (st.level && st.level !== level) {
    const from = LEVELS.indexOf(st.level), to = LEVELS.indexOf(level);
    const cleared = to > from ? analysis.risk >= (FLOORS[to] ?? 0) + HYST : analysis.risk < (FLOORS[from] ?? 0) - HYST;
    if (!cleared) level = st.level; // stay put
  }

  if (st.level && st.level !== level) {
    const up = LEVELS.indexOf(level) > LEVELS.indexOf(st.level);
    out.push({
      kind: 'level', dir: up ? 'up' : 'down',
      title: `Risk level ${up ? 'raised' : 'lowered'} to ${level}`,
      body: `Index ${pct(analysis.risk)}, was ${pct(st.risk ?? 0)} (${st.level}).`,
    });
  }

  // reference point ~6h back, only if it's at least 4h old and has per-flashpoint scores
  const ref = history.points
    .filter((p) => p.s && now - p.t >= 4 * HOUR)
    .sort((a, b) => Math.abs(now - 6 * HOUR - a.t) - Math.abs(now - 6 * HOUR - b.t))[0];

  for (const f of analysis.flashpoints) {
    const cooled = now - (fpCooldown[f.id] || 0) > COOLDOWN;
    const prev = ref?.s ? ref.s[history.ids.indexOf(f.id)] : undefined;
    const was = lastScores[f.id];
    const driver = f.drivers[0];
    const why = driver ? ` Top driver: "${driver.title}" (${driver.source}).` : '';
    let alert: Pick<NewAlert, 'kind' | 'title' | 'body'> | null = null;
    if (prev != null && f.score - prev >= SPIKE) {
      alert = { kind: 'spike', title: `${f.name} is heating up`, body: `Score ${prev} → ${f.score} over about 6 hours.${why}` };
    } else if (was != null && was < CRITICAL && f.score >= CRITICAL) {
      alert = { kind: 'critical', title: `${f.name} reached ${f.score}`, body: `Crossed into the critical range (${CRITICAL}+).${why}` };
    }
    if (alert && cooled) {
      fpCooldown[f.id] = now;
      const next: NewAlert = { ...alert, dir: 'up', fp: f.id };
      if (driver) next.link = driver.link;
      out.push(next);
    }
    lastScores[f.id] = f.score;
  }

  const state: AlertState = { level, risk: analysis.risk, fp: fpCooldown, scores: lastScores };
  writeJson(STATE_FILE, state);

  const stamped: AlertRec[] = out.map((a, i) => ({ id: `${now}-${i}`, t: now, ...a }));
  if (stamped.length) writeJson(LOG_FILE, loadAlerts().concat(stamped).slice(-100));
  return stamped;
}

export async function sendWebhook(text: string): Promise<boolean> {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return false;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    // `text` is Slack's field, `content` is Discord's; each ignores the other
    const res = await fetch(url, {
      method: 'POST', signal: ctrl.signal, headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, content: text }),
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

export const webhookConfigured = (): boolean => !!process.env.ALERT_WEBHOOK_URL;
export const dashboardLink = (): string => (process.env.PUBLIC_URL ? `\n${process.env.PUBLIC_URL}` : '');

export async function notifyAlerts(alerts: AlertRec[]): Promise<void> {
  for (const a of alerts) {
    await sendWebhook(`${a.dir === 'down' ? '🟢' : '⚠️'} WW3 Watch: ${a.title}\n${a.body}${dashboardLink()}`);
  }
}
