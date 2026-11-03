// Article shapes at each stage of the pipeline: parsed feed item -> clustered story -> scored story.

import type { Kind, Method, SourceRef, Tier } from '../shared/types.ts';

/** One item as parsed from a feed. */
export interface RawArticle {
  title: string;
  link: string;
  source: string;
  ts: number;
  img: string;
  summary: string;
  feedTags: string[];
}

/** What the AI classifier decided about a headline (cached on disk). */
export interface LlmRating {
  t: number;
  relevant: boolean;
  flashpoints: string[];
  severity: number; // 0-10
  direction: 'escalating' | 'deescalating' | 'neutral';
  relief?: number; // 0-10; absent in entries cached before good-news scoring existed
  kind?: Kind;
}

/** A group of near-duplicate headlines, represented by its lead story. */
export interface ClusteredArticle extends RawArticle {
  sources: SourceRef[];
  count: number;
  tier: Tier;
  state: boolean;
  weight: number; // source reliability x corroboration
  llm?: LlmRating;
}

/** A clustered story after severity, relief and flashpoint tagging. */
export interface ScoredArticle extends ClusteredArticle {
  categories: Set<string>;
  method: Method;
  severity: number; // 0-1
  relief: number; // 0-1
  kind: Kind;
  good: boolean; // de-escalation / humanitarian story: lives on the good-news side
  flashpoints: string[]; // theatres this story heats
  theatres: string[]; // theatres this story cools (good stories only)
}
