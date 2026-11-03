// Types shared by the server and the browser. The /api/data payload is described once, here.

export type Tier = 'high' | 'normal' | 'low' | 'state';
export type Method = 'llm' | 'keyword';
export type Kind = 'ceasefire' | 'diplomacy' | 'aid' | 'release' | 'recovery' | 'none';
export type Level = 'ELEVATED' | 'HIGH' | 'SEVERE' | 'CRITICAL' | 'IMMINENT';

export interface SourceRef {
  name: string;
  link: string;
  tier: Tier;
}

// ---- scoring model ----
export interface ModelInput {
  baseline: number; // 0-100
  weight: number; // 0-1
  heat: number; // 0-1
}

export interface ModelResult {
  scores: number[];
  risk: number; // after the de-escalation credit
  rawRisk: number;
  credit: number;
  level: Level;
  secondsRemaining: number;
  secondsBase: number;
  delaySeconds: number;
  riskShare: number[];
}

// ---- API payload ----
export interface Driver {
  title: string;
  link: string;
  source: string;
  method: Method;
  count: number;
  tier: Tier;
  ageH: number;
  severity: number;
  points: number;
}

export interface TopHeadline {
  title: string;
  link: string;
  source: string;
}

export interface FlashpointApi {
  id: string;
  name: string;
  baseline: number;
  weight: number;
  geo: [number, number] | null;
  score: number;
  heat: number; // percent
  heatRaw: number; // 0-1
  riskShare: number;
  mentions: number;
  top: TopHeadline[];
  img: string;
  drivers: Driver[];
}

export interface FeedStory {
  title: string;
  link: string;
  source: string;
  ts: number;
  summary: string;
  img: string;
  method: Method;
  count: number;
  sources: SourceRef[];
  tier: Tier;
  state: boolean;
  severity: number;
  flashpoints: string[];
  categories: string[];
}

export interface GoodStory {
  title: string;
  link: string;
  source: string;
  ts: number;
  img: string;
  summary: string;
  method: Method;
  relief: number;
  kind: Kind;
  theatres: string[];
  count: number;
  sources: SourceRef[];
  tier: Tier;
}

export interface DetailStory {
  title: string;
  link: string;
  source: string;
  ts: number;
  img: string;
  summary: string;
  method: Method;
  severity: number;
  count: number;
  sources: SourceRef[];
  tier: Tier;
}

export interface HistoryPoint {
  t: number;
  r: number;
  s?: number[]; // score per flashpoint, in `ids` order
}

export interface History {
  ids: string[];
  points: HistoryPoint[];
}

export interface EventRec {
  t: number;
  title: string;
  link: string;
  source: string;
  count: number;
  severity: number;
  flashpoints: string[];
  method: Method;
}

export interface WinRec {
  t: number;
  title: string;
  link: string;
  source: string;
  count: number;
  relief: number;
  kind: Kind;
  theatres: string[];
}

export interface AlertRec {
  id: string;
  t: number;
  kind: 'level' | 'spike' | 'critical';
  dir: 'up' | 'down';
  title: string;
  body: string;
  fp?: string;
  link?: string;
}

export interface BriefingRec {
  t: number;
  text: string;
  method: Method | 'template';
  model?: string;
  note?: string;
}

export interface ClassifierStatus {
  enabled: boolean;
  model: string;
  classified: number;
  fromCache: number;
  errors: number;
  lastError: string;
  pending?: number;
}

export interface TheatreSummary {
  id: string;
  name: string;
  count: number;
  top: { title: string; link: string; source: string; kind: Kind } | null;
}

export interface GoodNews {
  kinds: { id: string; label: string; count: number }[];
  total: number;
  theatres: TheatreSummary[];
  wins: WinRec[];
  stories: GoodStory[];
}

export interface ApiData {
  updated: number;
  goodNews: GoodNews;
  classifier: ClassifierStatus;
  stats: { nonEnglishHidden: number; merged: number; stories: number; rawItems: number };
  // analysis
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
  history: History;
  events: EventRec[];
  alerts: AlertRec[];
  alertConfig: { webhook: boolean };
  reference: { doomsday: { seconds: number; announced: string; previous: number; url: string } };
  articles: FeedStory[];
  sources: { ok: string[]; failed: { name: string; error: string }[] };
  briefing: BriefingRec | null;
}

export interface FlashpointDetail {
  updated: number;
  risk: number;
  level: Level;
  flashpoint: FlashpointApi;
  scoreHistory: { t: number; s: number }[];
  events: EventRec[];
  alerts: AlertRec[];
  stories: DetailStory[];
  outlets: { name: string; tier: Tier; count: number }[];
}
