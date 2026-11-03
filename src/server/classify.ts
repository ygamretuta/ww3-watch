// LLM headline classifier. Replaces keyword guesses with a model's judgement of
// (a) is this actually about armed conflict / great-power tension, (b) which flashpoints,
// (c) how escalatory is the event itself, (d) is it concrete de-escalation or humanitarian progress.
// Falls back to keywords when no key is set.
//
// Config (env or .env file): ANTHROPIC_API_KEY, WW3_MODEL (default claude-haiku-5-5),
// ANTHROPIC_BASE_URL (default https://api.anthropic.com)

import fs from 'node:fs';
import path from 'node:path';
import type { ClassifierStatus, Kind } from '../shared/types.ts';
import type { ClusteredArticle, LlmRating } from './article.ts';
import type { FlashpointDef } from './feeds.ts';
import { ROOT, dataFile, readJson, writeJson } from './paths.ts';

// tiny .env loader (no dependency)
try {
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    const key = m?.[1];
    if (m && key && !process.env[key]) process.env[key] = (m[2] ?? '').replace(/^["']|["']$/g, '');
  }
} catch {
  // no .env file: fine
}

const CACHE_FILE = dataFile('llm-cache.json');
const TTL = 7 * 24 * 3.6e6;
const BATCH = 25;
const MAX_NEW_PER_REFRESH = 150;
const KINDS: Kind[] = ['ceasefire', 'diplomacy', 'aid', 'release', 'recovery'];

const cache: Record<string, LlmRating> = readJson<Record<string, LlmRating>>(CACHE_FILE, {});

const keyOf = (a: { title: string }): string => a.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 90);
const status: ClassifierStatus = { enabled: false, model: '', classified: 0, fromCache: 0, errors: 0, lastError: '' };

type FlashpointRef = Pick<FlashpointDef, 'id' | 'name'>;

function systemPrompt(flashpoints: FlashpointRef[]): string {
  return `You triage news headlines for a geopolitical risk monitor that tracks the chance of a great-power war.

Flashpoint ids:
${flashpoints.map((f) => `- ${f.id}: ${f.name}`).join('\n')}

For every headline decide:
- relevant: true only if it concerns armed conflict, military posture, nuclear/arms control, state-level cyber operations, military AI, or tech/economic confrontation between states. Celebrity, sport, consumer-tech, domestic politics and opinion fluff are false.
- flashpoints: ids from the list above that the story materially bears on (0-3). Empty if none fit.
- severity: integer 0-10 for how escalatory the EVENT is, judged on what happened, not on tone. 0-2 talks/diplomacy/routine, 3-4 rhetoric or sanctions, 5-6 deployments/exercises/limited strikes, 7-8 major strikes/mobilization, 9-10 nuclear use or direct great-power combat. Ceasefires and de-escalation score low.
- direction: "escalating", "deescalating" or "neutral".
- relief: integer 0-10 for CONCRETE de-escalation or humanitarian progress that happened, regardless of relevance to the flashpoints: 0 for conflict events, threats, rhetoric and opinion; 1-3 talks announced or planned; 4-6 aid delivered, prisoners or hostages released, ceasefire holding, evacuations completed; 7-10 signed agreements, treaties, lasting ceasefires, large verified relief or recovery. A ceasefire that was violated, or aid that was blocked, is 0.
- kind: what the relief is: "ceasefire", "diplomacy", "aid", "release", "recovery", or "none".

Reply with ONLY a JSON array, one object per headline: {"id":<number>,"relevant":bool,"flashpoints":[...],"severity":n,"direction":"...","relief":n,"kind":"..."}. No prose, no code fences.`;
}

export const llmEnabled = (): boolean => !!process.env.ANTHROPIC_API_KEY;

export interface AskOptions {
  model?: string;
  maxTokens?: number;
}

interface MessagesResponse {
  content?: { text?: string }[];
}

/** Single-turn call to the Messages API; returns the concatenated text blocks. */
export async function ask(system: string, user: string, opts: AskOptions = {}): Promise<string> {
  const base = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
  const model = opts.model || process.env.WW3_MODEL || 'claude-haiku-5-5';
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 40000);
  try {
    const res = await fetch(base + '/v1/messages', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model, max_tokens: opts.maxTokens || 4096, system, messages: [{ role: 'user', content: user }] }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);
    const j = (await res.json()) as MessagesResponse;
    return (j.content || []).map((c) => c.text || '').join('');
  } finally {
    clearTimeout(t);
  }
}

interface ModelRow {
  id: number;
  relevant?: unknown;
  flashpoints?: unknown;
  severity?: unknown;
  direction?: unknown;
  relief?: unknown;
  kind?: unknown;
}

function parseArray(text: string): ModelRow[] {
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) throw new Error('no JSON array in reply');
  return JSON.parse(m[0]) as ModelRow[];
}

const clamp10 = (v: unknown): number => Math.max(0, Math.min(10, Number(v) || 0));

async function classifyBatch(batch: ClusteredArticle[], flashpoints: FlashpointRef[]): Promise<void> {
  const user = batch.map((a, i) => `${i}| ${a.source} | ${a.title}${a.summary ? ' — ' + a.summary.slice(0, 140) : ''}`).join('\n');
  const rows = parseArray(await ask(systemPrompt(flashpoints), user));
  const valid = new Set(flashpoints.map((f) => f.id));
  for (const r of rows) {
    const a = batch[r.id];
    if (!a) continue;
    cache[keyOf(a)] = {
      t: Date.now(),
      relevant: !!r.relevant,
      flashpoints: (Array.isArray(r.flashpoints) ? (r.flashpoints as unknown[]) : []).filter((id): id is string => typeof id === 'string' && valid.has(id)),
      severity: clamp10(r.severity),
      direction: r.direction === 'escalating' || r.direction === 'deescalating' ? r.direction : 'neutral',
      relief: clamp10(r.relief),
      kind: KINDS.find((k) => k === r.kind) ?? 'none',
    };
    status.classified++;
  }
}

/** Attaches `llm` to each article it can; returns status for the UI. */
export async function classify(articles: ClusteredArticle[], flashpoints: FlashpointRef[]): Promise<ClassifierStatus> {
  status.enabled = llmEnabled();
  status.model = process.env.WW3_MODEL || 'claude-haiku-5-5';
  status.classified = 0; status.fromCache = 0; status.errors = 0; status.lastError = '';
  if (!status.enabled) return { ...status };

  const now = Date.now();
  for (const [k, v] of Object.entries(cache)) if (now - v.t > TTL) delete cache[k];

  const todo: ClusteredArticle[] = [];
  for (const a of articles) {
    const hit = cache[keyOf(a)];
    if (hit) { a.llm = hit; status.fromCache++; } else todo.push(a);
  }

  const fresh = todo.slice(0, MAX_NEW_PER_REFRESH); // articles arrive newest-first
  const batches: ClusteredArticle[][] = [];
  for (let i = 0; i < fresh.length; i += BATCH) batches.push(fresh.slice(i, i + BATCH));
  await Promise.all(batches.map((b) =>
    classifyBatch(b, flashpoints).catch((e: unknown) => {
      status.errors++;
      status.lastError = e instanceof Error ? e.message : String(e);
    }),
  ));

  for (const a of fresh) {
    const rated = cache[keyOf(a)];
    if (rated) a.llm = rated;
  }
  writeJson(CACHE_FILE, cache);
  return { ...status, pending: todo.length - fresh.length };
}
