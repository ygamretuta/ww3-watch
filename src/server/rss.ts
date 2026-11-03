// Feed fetching and parsing (regex-based, no XML dependency) plus og:image enrichment.

import type { RawArticle } from './article.ts';
import type { Feed } from './feeds.ts';

const UA = 'Mozilla/5.0 (compatible; WW3Watch/1.0)';

export const decode = (s: string): string =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');

const strip = (s: string): string => decode(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const pick = (block: string, tag: string): string => {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m?.[1] ?? '';
};

function findImage(b: string): string {
  const attr = (re: RegExp): string => {
    const m = b.match(re);
    return m?.[1] ? decode(m[1]) : '';
  };
  let u =
    attr(/<media:thumbnail[^>]*\surl="([^"]+)"/i) ||
    attr(/<media:content[^>]*\surl="([^"]+)"[^>]*(?:medium="image"|type="image)/i) ||
    attr(/<media:content[^>]*(?:medium="image"|type="image\/[^"]*")[^>]*\surl="([^"]+)"/i) ||
    attr(/<enclosure[^>]*\surl="([^"]+)"[^>]*type="image/i) ||
    attr(/<enclosure[^>]*type="image[^"]*"[^>]*\surl="([^"]+)"/i);
  if (!u) {
    const m = decode(b).match(/<img[^>]+src=["']([^"']+)["']/i);
    u = m?.[1] ?? '';
  }
  return /^https?:\/\//i.test(u) ? u.replace(/^http:/i, 'https:') : '';
}

export function parseFeed(xml: string, feed: Feed): RawArticle[] {
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) || [];
  return blocks.slice(0, 40).map((b): RawArticle => {
    let link = strip(pick(b, 'link'));
    if (!link) link = b.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? '';
    const date = new Date(strip(pick(b, 'pubDate') || pick(b, 'published') || pick(b, 'updated') || pick(b, 'dc:date')));
    let title = strip(pick(b, 'title'));
    let source = feed.name;
    if (feed.name.startsWith('GNews')) {
      const s = strip(pick(b, 'source'));
      if (s) { source = s; title = title.replace(new RegExp(`\\s+-\\s+${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), ''); }
    }
    return {
      title, link, source, ts: date.getTime(), img: findImage(b),
      summary: strip(pick(b, 'description') || pick(b, 'summary')).slice(0, 280),
      feedTags: feed.tags,
    };
  }).filter((a) => a.title && a.link && Number.isFinite(a.ts));
}

export type FeedResult =
  | { feed: Feed; items: RawArticle[]; error?: undefined }
  | { feed: Feed; error: string; items?: undefined };

export async function fetchFeed(feed: Feed): Promise<FeedResult> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(feed.url, {
      signal: ctrl.signal,
      headers: { 'user-agent': UA, accept: 'application/rss+xml, application/xml, text/xml, */*' },
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return { feed, items: parseFeed(await res.text(), feed) };
  } catch (e) {
    const error = e instanceof Error ? (e.name === 'AbortError' ? 'timeout' : e.message) : String(e);
    return { feed, error };
  } finally {
    clearTimeout(t);
  }
}

// ---------- og:image enrichment for items whose RSS carried no image ----------
const ogCache = new Map<string, string>(); // url -> image url ('' = none)

async function fetchOg(url: string): Promise<string> {
  const cached = ogCache.get(url);
  if (cached !== undefined) return cached;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  let img = '';
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: { 'user-agent': UA } });
    if (res.ok && !/google\.com/.test(res.url)) {
      const head = (await res.text()).slice(0, 60000);
      const m = head.match(/<meta[^>]+(?:property|name)=["'](?:og|twitter):image(?::src)?["'][^>]*content=["']([^"']+)["']/i)
        || head.match(/<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og|twitter):image["']/i);
      const found = m?.[1] ? decode(m[1]) : '';
      if (/^https?:\/\//i.test(found)) img = found.replace(/^http:/i, 'https:');
    }
  } catch {
    // unreachable page: leave the story without an image
  } finally {
    clearTimeout(t);
  }
  ogCache.set(url, img);
  return img;
}

/** Fills in `img` for stories that lack one (non-Google links only; at most `limit`). */
export async function enrichImages(articles: { img: string; link: string }[], limit = 60): Promise<void> {
  const todo = articles.filter((a) => !a.img && !a.link.includes('news.google.com')).slice(0, limit);
  let i = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (i < todo.length) {
      const a = todo[i++];
      if (a) a.img = await fetchOg(a.link);
    }
  }));
}
