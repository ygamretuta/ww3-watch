// Scoring model shared by the server and the browser.
// Input: per-flashpoint baseline, weight and live heat, plus optional de-escalation mitigation 0-1.
// Output: scores, global risk, symbolic clock, and how much time good news has bought.

import type { Level, ModelInput, ModelResult } from './types.ts';

const clamp = (x: number, a: number, b: number): number => Math.max(a, Math.min(b, x));
const HOT = 65; // a flashpoint at/above this score counts as "running hot"
export const DEFAULT_MAX_CREDIT = 0.15; // at full de-escalation signal, take 15% off the risk index

export const scoreOf = (baseline: number, heat: number): number => Math.round(clamp(baseline * 0.65 + heat * 35, 0, 100));

function risk(scores: number[], weights: number[]): number {
  let calm = 1;
  scores.forEach((s, i) => { calm *= 1 - (weights[i] ?? 0) * (s / 100); });
  // Contagion: several theatres running hot at once is worse than the sum of parts
  const hot = scores.filter((s) => s >= HOT).length;
  return clamp(1 - calm + Math.max(0, hot - 2) * 0.03, 0, 0.98);
}

export function levelOf(r: number): Level {
  return r < 0.3 ? 'ELEVATED' : r < 0.45 ? 'HIGH' : r < 0.6 ? 'SEVERE' : r < 0.75 ? 'CRITICAL' : 'IMMINENT';
}

// Symbolic clock: 20 years at zero risk, collapsing cubically to ~90 seconds at 1.0
const secondsFor = (r: number): number => Math.round(90 + 20 * 365 * 86400 * Math.pow(1 - r, 3));

// mitigation: 0-1 strength of current de-escalation / humanitarian signal
export function compute(fps: ModelInput[], mitigation = 0, maxCredit = DEFAULT_MAX_CREDIT): ModelResult {
  const scores = fps.map((f) => scoreOf(f.baseline, f.heat));
  const weights = fps.map((f) => f.weight);
  const raw = risk(scores, weights);
  const credit = clamp(mitigation, 0, 1) * clamp(maxCredit, 0, 0.6); // share of risk removed
  const r = raw * (1 - credit);
  // Share of the global index each flashpoint is responsible for (risk with it zero-weighted)
  const riskShare = weights.map((_, i) => (raw - risk(scores, weights.map((w, j) => (j === i ? 0 : w)))) * (1 - credit));
  const secondsRemaining = secondsFor(r);
  const secondsBase = secondsFor(raw);
  return {
    scores, risk: +r.toFixed(3), rawRisk: +raw.toFixed(3), credit: +credit.toFixed(3),
    level: levelOf(r), secondsRemaining, secondsBase, delaySeconds: secondsRemaining - secondsBase, riskShare,
  };
}
