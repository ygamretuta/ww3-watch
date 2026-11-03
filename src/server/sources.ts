// Source reliability and state-media flags. Matching is by regex on the outlet name.
// This is a judgement call (broad strokes, not a ratings agency): edit freely.
//
// Weight multiplies how much a story can heat a flashpoint:
//   high 1.15 · normal 1.0 · low 0.5 · state 0.5 (government-controlled or -funded outlets;
//   they still count, because what a government says is itself a signal, but they can't
//   move the needle alone)

import type { Tier } from '../shared/types.ts';

const STATE = /\brt\b|russia today|\btass\b|sputnik|ria novosti|xinhua|cgtn|global times|china daily|people'?s daily|press ?tv|tasnim|\birna\b|fars news|mehr news|tehran times|\bkcna\b|al-?manar|al ?mayadeen|\bsana\b|belta|\btrt\b|anadolu|\bdd news\b|\bdd india\b|news on air|united24|vov world|\bwafa\b|cctv/i;

const LOW = /breitbart|daily express|world socialist|simply wall st|world beyond war|startup fortune|thetravel|business upturn|gk today|csr journal|debuglies|inkorr|impariamo|technology org|daily mail|zerohedge|infowars|the sun\b|news ?break|big news network/i;

const HIGH = /\bbbc\b|reuters|associated press|\bap news\b|guardian|\bnpr\b|\bdw\b|dw\.com|france ?24|al jazeera|financial times|new york times|nytimes|washington post|wall street journal|economist|bloomberg|\bcnn\b|sky news|nikkei|japan times|south china morning|scmp|bellingcat|war on the rocks|war zone|defense news|breaking defense|defense one|usni|foreign policy|the record|bleepingcomputer|ars technica|stars and stripes|times of israel|haaretz|kyiv independent|al-monitor|middle east eye|radio free europe|rferl|the diplomat|institute for the study of war|critical threats|chatham house|\biiss\b|\bcsis\b|\bcfr\b|nature|science|\bnbc\b|\bcbs\b|\babc news\b|pbs|axios|politico|the hill/i;

export interface SourceInfo {
  tier: Tier;
  weight: number;
  state: boolean;
}

export function sourceInfo(name: string | undefined): SourceInfo {
  const n = name || '';
  if (STATE.test(n)) return { tier: 'state', weight: 0.5, state: true };
  if (LOW.test(n)) return { tier: 'low', weight: 0.5, state: false };
  if (HIGH.test(n)) return { tier: 'high', weight: 1.15, state: false };
  return { tier: 'normal', weight: 1.0, state: false };
}
