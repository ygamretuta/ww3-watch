// Shared client state: the latest API payload, the model result with the user's overrides applied,
// and the overrides themselves (persisted in this browser only).

import { compute } from '../shared/model.ts';
import type { ApiData, FlashpointApi, ModelResult } from '../shared/types.ts';

const STORE = 'ww3-model';

export interface FlashpointOverride {
  baseline?: number;
  weight?: number;
}

export interface Overrides {
  fp: Record<string, FlashpointOverride>;
  credit?: number; // user's cap on the de-escalation credit, 0-1
}

function loadOverrides(): Overrides {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORE) ?? 'null');
    if (raw && typeof raw === 'object') {
      const o = raw as Record<string, unknown>;
      // current shape: { fp: {...}, credit? }
      if ('fp' in o) return { fp: (o.fp as Overrides['fp']) ?? {}, ...(typeof o.credit === 'number' ? { credit: o.credit } : {}) };
      // earlier shape: { [flashpointId]: {...}, __credit? }
      const { __credit, ...fp } = o;
      return { fp: fp as Overrides['fp'], ...(typeof __credit === 'number' ? { credit: __credit } : {}) };
    }
  } catch {
    // storage blocked or corrupt: start clean
  }
  return { fp: {} };
}

export const overrides: Overrides = loadOverrides();

export function saveOverrides(): void {
  try {
    if (isCustom()) localStorage.setItem(STORE, JSON.stringify(overrides));
    else localStorage.removeItem(STORE);
  } catch {
    // storage blocked: the overrides still apply for this page view
  }
}

export function clearOverrides(): void {
  overrides.fp = {};
  delete overrides.credit;
  saveOverrides();
}

export const isCustom = (): boolean => Object.keys(overrides.fp).length > 0 || overrides.credit !== undefined;

/** Baseline and weight with the user's overrides applied. */
export const eff = (f: FlashpointApi): { baseline: number; weight: number } => ({
  baseline: overrides.fp[f.id]?.baseline ?? f.baseline,
  weight: overrides.fp[f.id]?.weight ?? f.weight,
});

export const state: { data: ApiData | null; calc: ModelResult | null; target: number } = {
  data: null,
  calc: null,
  target: 0, // epoch ms when the clock hits zero
};

export function getData(): ApiData {
  if (!state.data) throw new Error('data not loaded yet');
  return state.data;
}

export function getCalc(): ModelResult {
  if (!state.calc) throw new Error('model not computed yet');
  return state.calc;
}

export function recompute(data: ApiData): void {
  state.data = data;
  state.calc = compute(
    data.flashpoints.map((f) => ({ ...eff(f), heat: f.heatRaw })),
    data.mitigation,
    overrides.credit ?? data.maxCredit,
  );
  state.target = data.updated + state.calc.secondsRemaining * 1000;
}

/** Set by main.ts: recompute and repaint everything that depends on the model. */
export const hooks: { refresh: () => void } = { refresh: () => {} };
