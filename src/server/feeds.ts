// Feed sources and flashpoint definitions. Edit freely.

import type { Kind } from '../shared/types.ts';

export interface Feed {
  name: string;
  url: string;
  tags: string[];
}

export interface FlashpointDef {
  id: string;
  name: string;
  baseline: number; // structural risk 0-100
  weight: number; // how much this theatre can pull the world into a great-power war
  re: RegExp;
  geo?: [number, number];
}

const gnews = (q: string): string =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q + ' when:2d')}&hl=en-US&gl=US&ceid=US:en`;

// tags: hints used for category filtering in the UI
export const FEEDS: Feed[] = [
  // General world news
  { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', tags: ['war'] },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', tags: ['war'] },
  { name: 'The Guardian', url: 'https://www.theguardian.com/world/rss', tags: ['war'] },
  { name: 'NPR World', url: 'https://feeds.npr.org/1004/rss.xml', tags: ['war'] },
  { name: 'DW', url: 'https://rss.dw.com/rdf/rss-en-all', tags: ['war'] },
  { name: 'France 24', url: 'https://www.france24.com/en/rss', tags: ['war'] },
  // Defense / analysis / OSINT
  { name: 'Defense News', url: 'https://www.defensenews.com/arc/outboundfeeds/rss/?outputType=xml', tags: ['war'] },
  { name: 'The War Zone', url: 'https://www.twz.com/feed', tags: ['war', 'osint'] },
  { name: 'War on the Rocks', url: 'https://warontherocks.com/feed/', tags: ['osint'] },
  { name: 'Bellingcat', url: 'https://www.bellingcat.com/feed/', tags: ['osint'] },
  { name: 'The Diplomat', url: 'https://thediplomat.com/feed/', tags: ['war'] },
  { name: 'Foreign Policy', url: 'https://foreignpolicy.com/feed/', tags: ['osint'] },
  { name: 'Breaking Defense', url: 'https://breakingdefense.com/feed/', tags: ['war'] },
  { name: 'Defense One', url: 'https://www.defenseone.com/rss/all/', tags: ['war'] },
  { name: 'USNI News', url: 'https://news.usni.org/feed', tags: ['war'] },
  // More direct publisher feeds (they carry their own images, unlike Google News items)
  { name: 'New York Times', url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', tags: ['war'] },
  { name: 'Sky News', url: 'https://feeds.skynews.com/feeds/rss/world.xml', tags: ['war'] },
  { name: 'Kyiv Independent', url: 'https://www.kyivindependent.com/news-archive/rss', tags: ['war'] },
  { name: 'Middle East Eye', url: 'https://www.middleeasteye.net/rss', tags: ['war'] },
  { name: 'Al-Monitor', url: 'https://www.al-monitor.com/rss', tags: ['war', 'osint'] },
  { name: 'Times of Israel', url: 'https://www.timesofisrael.com/feed/', tags: ['war'] },
  { name: 'SCMP Asia', url: 'https://www.scmp.com/rss/91/feed', tags: ['war'] },
  { name: 'SCMP China', url: 'https://www.scmp.com/rss/4/feed', tags: ['war'] },
  { name: 'Japan Times', url: 'https://www.japantimes.co.jp/feed/', tags: ['war'] },
  { name: 'The Register Security', url: 'https://www.theregister.com/security/headlines.atom', tags: ['cyber'] },
  { name: 'The Hacker News', url: 'https://thehackernews.com/feeds/posts/default', tags: ['cyber'] },
  { name: 'Guardian AI', url: 'https://www.theguardian.com/technology/artificialintelligenceai/rss', tags: ['ai'] },
  // Tech / cyber / AI
  { name: 'The Record', url: 'https://therecord.media/feed', tags: ['cyber'] },
  { name: 'BleepingComputer', url: 'https://www.bleepingcomputer.com/feed/', tags: ['cyber'] },
  { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', tags: ['tech'] },
  { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', tags: ['tech'] },
  // Humanitarian, peace and de-escalation (feed the "good news" side)
  { name: 'UN News', url: 'https://news.un.org/feed/subscribe/en/news/all/rss.xml', tags: ['relief'] },
  { name: 'UN News: Peace & Security', url: 'https://news.un.org/feed/subscribe/en/news/topic/peace-and-security/feed/rss.xml', tags: ['relief'] },
  { name: 'ReliefWeb', url: 'https://reliefweb.int/updates/rss.xml', tags: ['relief'] },
  { name: 'UN OCHA', url: 'https://www.unocha.org/rss.xml', tags: ['relief'] },
  { name: 'WHO News', url: 'https://www.who.int/rss-feeds/news-english.xml', tags: ['relief'] },
  { name: 'Crisis Group', url: 'https://www.crisisgroup.org/rss', tags: ['relief'] },
  { name: 'GNews: Ceasefires & peace', url: gnews('ceasefire agreement signed OR peace talks breakthrough OR truce holds'), tags: ['relief'] },
  { name: 'GNews: Aid & relief', url: gnews('humanitarian aid convoy delivered OR aid corridor opens OR evacuated civilians'), tags: ['relief'] },
  { name: 'GNews: Releases', url: gnews('prisoner exchange OR hostages released OR detainees freed'), tags: ['relief'] },
  { name: 'GNews: Diplomacy', url: gnews('arms control treaty OR diplomatic breakthrough OR sanctions eased OR summit agreement'), tags: ['relief'] },
  // Targeted searches (Google News)
  { name: 'GNews: Ukraine/Russia', url: gnews('Russia Ukraine NATO war'), tags: ['war'] },
  { name: 'GNews: Taiwan/China', url: gnews('Taiwan Strait China military'), tags: ['war'] },
  { name: 'GNews: Middle East', url: gnews('Israel Iran Hezbollah Houthi strike'), tags: ['war'] },
  { name: 'GNews: Korea', url: gnews('North Korea missile'), tags: ['war'] },
  { name: 'GNews: India/Pakistan', url: gnews('India Pakistan Kashmir military'), tags: ['war'] },
  { name: 'GNews: Civil wars', url: gnews('civil war Sudan Myanmar Sahel Congo rebels'), tags: ['civil'] },
  { name: 'GNews: Chip war', url: gnews('chip export controls semiconductor China rare earth'), tags: ['tech'] },
  { name: 'GNews: AI & military', url: gnews('artificial intelligence military autonomous weapons'), tags: ['ai'] },
  { name: 'GNews: Cyber', url: gnews('state-sponsored cyberattack critical infrastructure'), tags: ['cyber'] },
  { name: 'GNews: Nuclear', url: gnews('nuclear weapons arms control warhead'), tags: ['nuclear'] },
  { name: 'GNews: Leaks & intel', url: gnews('leaked intelligence assessment classified officials say military'), tags: ['osint'] },
];

// baseline: structural risk 0-100 (judgement call, edit to taste)
// weight: how much this theatre can pull the world into a great-power war
export const FLASHPOINTS: FlashpointDef[] = [
  { id: 'russia', name: 'Russia–NATO / Ukraine', baseline: 78, weight: 0.30,
    re: /ukrain|russia|putin|kremlin|nato\b|kyiv|zelensk|donbas|baltic|belarus|moscow|suwalki/i },
  { id: 'taiwan', name: 'Taiwan Strait / South China Sea', baseline: 68, weight: 0.26,
    re: /taiwan|taipei|south china sea|scarborough|second thomas|pla navy|chinese military|people's liberation|paracel|spratly/i },
  { id: 'mideast', name: 'Middle East (Israel–Iran axis)', baseline: 74, weight: 0.26,
    re: /israel|gaza|hamas|hezbollah|iran\b|tehran|houthi|red sea|lebanon|syria|idf\b|west bank/i },
  { id: 'nuclear', name: 'Nuclear posture & arms control', baseline: 62, weight: 0.18,
    re: /nuclear|warhead|icbm|enrichment|iaea|new start|nonproliferation|hypersonic|nuclear test|doomsday/i },
  { id: 'korea', name: 'Korean Peninsula', baseline: 55, weight: 0.12,
    re: /north korea|pyongyang|kim jong|south korea|dmz|korean peninsula/i },
  { id: 'indpak', name: 'India–Pakistan', baseline: 50, weight: 0.10,
    re: /kashmir|pakistan|line of control|india-pakistan|indo-pak/i },
  { id: 'cyber', name: 'Cyber warfare', baseline: 58, weight: 0.08,
    re: /cyber|hack(er|ed|ing)|ransomware|malware|state-sponsored|apt\d+|volt typhoon|salt typhoon|critical infrastructure|spyware|zero-day/i },
  { id: 'ai', name: 'AI arms race & autonomous weapons', baseline: 50, weight: 0.07,
    re: /autonomous weapon|military ai|ai[^a-z]{1,3}(military|weapon|warfare|defen[cs]e|pentagon)|drone swarm|killer robot|ai arms race|pentagon.{0,25}\bai\b|deepfake.{0,25}(election|propaganda)|\bai\b.{0,25}(targeting|battlefield)/i },
  { id: 'chips', name: 'Tech & chip war', baseline: 48, weight: 0.06,
    re: /chip|semiconductor|export control|nvidia|tsmc|rare earth|huawei|tariff|decoupl|entity list|asml|critical minerals/i },
  { id: 'sudan', name: 'Sudan civil war', baseline: 42, weight: 0.03,
    re: /sudan|\brsf\b|rapid support forces|khartoum|darfur|el fasher/i },
  { id: 'africa', name: 'Sahel / Congo / Horn of Africa', baseline: 34, weight: 0.025,
    re: /sahel|\bmali\b|burkina|\bniger\b|congo|\bm23\b|ethiopia|tigray|somalia|al-shabaab|boko haram/i },
  { id: 'myanmar', name: 'Myanmar, Haiti & other insurgencies', baseline: 30, weight: 0.02,
    re: /myanmar|junta|rohingya|haiti|libya|\beln\b|farc/i },
  { id: 'arctic', name: 'Arctic & space militarization', baseline: 28, weight: 0.03,
    re: /arctic|greenland|anti-satellite|\basat\b|space force|weapons in space|orbital weapon/i },
];

// Map pins [lon, lat] for theatres that have a place. Nuclear, cyber, AI and chips are global.
const GEO: Record<string, [number, number]> = {
  russia: [32, 49], taiwan: [121, 24], mideast: [45, 32], korea: [127, 38.5], indpak: [74, 33.5],
  sudan: [30, 15], africa: [8, 13], myanmar: [96, 21], arctic: [-40, 72],
};
for (const f of FLASHPOINTS) {
  const pin = GEO[f.id];
  if (pin) f.geo = pin;
}

// Outside benchmark shown beside our index (update when the Bulletin resets the clock each January)
export const REFERENCE: { doomsday: { seconds: number; announced: string; previous: number; url: string } } = {
  doomsday: {
    seconds: 85, announced: '2026-01-27', previous: 89,
    url: 'https://thebulletin.org/doomsday-clock/',
  },
};

// Headline language that raises / lowers temperature
export const ESCALATE: [RegExp, number][] = [
  [/nuclear|icbm|warhead|mushroom/i, 3],
  [/invasion|invade|declare[sd]? war|mobili[sz]|conscription|martial law/i, 3],
  [/air ?strike|missile|shelling|drone strike|bomb(ing|ed)|massacre|killed|dead\b|attack/i, 2],
  [/troops|warship|blockade|carrier|deploy|military buildup|naval|fighter jets/i, 2],
  [/escalat|retaliat|threat|ultimatum|warn(s|ed|ing)?\b|provocat|sanction|crisis/i, 1.5],
  [/drills|exercise|tension|standoff|clash|offensive|incursion/i, 1.5],
];
export const DEESCALATE: [RegExp, number][] = [
  [/cease-?fire|truce|peace (talks|deal|plan)|negotiat|de-escalat|agreement|withdraw|summit|talks/i, -2],
];

// Category rules for the UI filter chips
export const CATEGORIES: Record<string, RegExp> = {
  war: /\bwar\b|military|troops|strike|invasion|missile|army|offensive|frontline|navy|airstrike/i,
  civil: /civil war|rebel|junta|militia|\brsf\b|insurgen|coup|separatist|paramilitary|guerrilla/i,
  tech: /chip|semiconductor|export control|nvidia|tsmc|rare earth|huawei|tariff|decoupl|entity list|asml|critical minerals|tech war/i,
  ai: /\bai\b|artificial intelligence|autonomous|drone|deepfake|openai|anthropic|deepmind|machine learning/i,
  cyber: /cyber|hack(er|ed|ing)|ransomware|malware|breach|spyware|zero-day|state-sponsored/i,
  nuclear: /nuclear|warhead|icbm|enrichment|iaea|hypersonic|nonproliferation/i,
  osint: /leak|intelligence|classified|sources say|satellite imagery|insider|whistleblower|officials say|assessment|osint|anonymous officials/i,
};

// ---- good news: de-escalation and humanitarian progress ----
// Stories scoring >= RELIEF_MIN move from the escalation side to the good-news side and add to
// the "mitigation" that pushes the countdown back. Keyword scoring is a fallback for when no AI key is set.
export const RELIEF_MIN = 0.5; // keyword mode needs a concrete outcome word (signed, delivered, released...) to clear this
export type ReliefKind = Exclude<Kind, 'none'>;
export const KINDS: Record<ReliefKind, { label: string; re: RegExp }> = {
  ceasefire: { label: 'Ceasefires & talks', re: /cease-?fire|truce|armistice|peace (deal|agreement|accord|talks|process|plan|summit)|negotiat|de-escalat|troops? withdraw|withdraw(s|n|al)? (of )?(troops|forces)|demilitari[sz]/i },
  diplomacy: { label: 'Diplomacy & arms control', re: /treaty|arms control|non-?proliferation|mediat|summit|diplomatic (breakthrough|deal|talks)|sanctions (lifted|eased|relief)|accord|security council (adopts|resolution)|dialogue/i },
  aid: { label: 'Humanitarian aid', re: /humanitarian|aid (convoy|delivery|deliveries|corridor|flights|arrives|reaches)|relief (effort|supplies|operation|flights)|food (aid|assistance)|medical (aid|supplies|evacuation)|refugees? (return|resettle|shelter)|\bwfp\b|red cross|red crescent|unicef|unhcr|evacuat(ed|ion)|rescued|donat(es|ed|ion)|pledge[sd]?/i },
  release: { label: 'Releases & exchanges', re: /prisoner (swap|exchange|release)|hostages? (freed|released|return)|released from (captivity|detention)|exchange of (prisoners|bodies|hostages)|detainees? (freed|released)/i },
  recovery: { label: 'Health & recovery', re: /reconstruction|rebuilding of|vaccin|polio|clinic|schools? reopen|famine (eases|over|lifted)|returns? home|recovery (plan|effort)|cholera|measles/i },
};
const RELIEF_BOOST = /\b(sign(s|ed)|agree(s|d)|agreement|reach(es|ed)|deliver(s|ed)|arriv(es|ed)|releas(es|ed)|free(s|d)|extend(s|ed)|resum(es|ed)|restor(es|ed)|approv(es|ed)|launch(es|ed)|welcome[sd]?|breakthrough|reopen(s|ed)?)\b/i;
const RELIEF_NEGATIVE = /collaps|violat|breach|fail(s|ed|ure)|reject|kill|strike|attack|bomb|shell(ing|ed)|massacre|blocked|halt(s|ed)|suspend|no intention|refus(es|ed|al)|rules? out|looms?|braced for|deadlock|stall(s|ed)|losses/i;

// Pass the HEADLINE only: summaries drag in unrelated words and cause false positives.
export function keywordRelief(text: string): { relief: number; kind: Kind } {
  const kinds = (Object.entries(KINDS) as [ReliefKind, { label: string; re: RegExp }][]).filter(([, k]) => k.re.test(text)).map(([id]) => id);
  const first = kinds[0];
  if (!first) return { relief: 0, kind: 'none' };
  let s = 0.3 + (kinds.length > 1 ? 0.1 : 0);
  if (RELIEF_BOOST.test(text) || /(cease-?fire|truce)s? (is |was )?(hold(s|ing)?|stays?)/i.test(text)) s += 0.3;
  if (RELIEF_NEGATIVE.test(text)) s -= 0.4;
  return { relief: Math.max(0, Math.min(1, s)), kind: first };
}
