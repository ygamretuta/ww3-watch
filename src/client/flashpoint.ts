// Per-flashpoint detail page: score breakdown, history, timeline, coverage and outlet tally.

import type { FlashpointDetail } from '../shared/types.ts';
import { $, ago, el, errorMessage, heatColor } from './dom.ts';

const fmt = (t: number): string => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const shortDate = (t: number): string => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const link = (href: string, text: string): HTMLAnchorElement => el('a', { href, target: '_blank', rel: 'noopener', textContent: text });

function history(points: { t: number; s: number }[]): void {
  const svg = $<HTMLElement>('hist');
  const note = $('hist-note');
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last || points.length < 2) {
    note.textContent = '';
    svg.innerHTML = '<text x="400" y="85" text-anchor="middle" fill="currentColor" opacity=".5" font-size="14">Collecting data… a point is saved every 30 minutes while the server runs.</text>';
    return;
  }
  const W = 800, H = 160, L = 34, R = 8, T = 10, B = 20;
  const t0 = first.t, t1 = last.t;
  let lo = Math.min(...points.map((p) => p.s)) - 4, hi = Math.max(...points.map((p) => p.s)) + 4;
  if (hi - lo < 10) { const m = (hi + lo) / 2; lo = m - 5; hi = m + 5; }
  lo = Math.max(0, lo); hi = Math.min(100, hi);
  const X = (t: number): number => L + ((t - t0) / (t1 - t0 || 1)) * (W - L - R);
  const Y = (v: number): number => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)} ${Y(p.s).toFixed(1)}`).join('');
  const lab = (v: number): string => `<text x="${L - 5}" y="${Y(v) + 4}" text-anchor="end" font-size="11" fill="currentColor" opacity=".55">${Math.round(v)}</text><line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="currentColor" opacity=".12"/>`;
  svg.innerHTML = `${lab(lo)}${lab(hi)}<path d="${d}" fill="none" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke"/>
    <text x="${L}" y="${H - 4}" font-size="11" fill="currentColor" opacity=".55">${shortDate(t0)}</text>
    <text x="${W - R}" y="${H - 4}" text-anchor="end" font-size="11" fill="currentColor" opacity=".55">${shortDate(t1)}</text>`;
  note.textContent = `since ${fmt(t0)}`;
}

interface TimelineItem {
  t: number;
  title: string;
  link: string | undefined;
  meta: string;
  c: string;
}

function render(d: FlashpointDetail): void {
  const f = d.flashpoint;
  const c = heatColor(f.score);
  document.title = `${f.name} · WW3 Watch`;
  document.documentElement.style.setProperty('--accent', c);
  document.documentElement.style.setProperty('--glow', c + '59');
  $('status').textContent = `Updated ${new Date(d.updated).toLocaleTimeString()} · global index ${Math.round(d.risk * 100)}% (${d.level})`;
  $('fp-name').textContent = f.name;
  $('fp-score').textContent = String(f.score);
  $('fp-bar').style.width = f.score + '%';
  $('fp-formula').textContent =
    `${Math.round(f.baseline * 0.65)} baseline + ${Math.round(f.heatRaw * 35)} live news = ${f.score} · accounts for ${(f.riskShare * 100).toFixed(1)} pts of the global risk · ${f.mentions} headlines in 72h`;

  history(d.scoreHistory);

  $('drivers').replaceChildren(...(f.drivers.length
    ? f.drivers.map((x) => el('li', {},
      el('b', { textContent: '+' + x.points }),
      link(x.link, x.title),
      el('span', { className: 'dim', textContent: `${x.source}${x.count > 1 ? ` +${x.count - 1} more` : ''}${x.tier === 'state' ? ' (state media, ½ weight)' : ''} · ${x.ageH}h old · severity ${Math.round(x.severity * 10)}/10 · ${x.method === 'llm' ? 'AI-rated' : 'keyword-rated'}` }),
    ))
    : [el('li', { className: 'dim', textContent: 'No live headlines are moving this score right now.' })]));

  // timeline: alerts + recorded events for this flashpoint, newest first
  const items: TimelineItem[] = [
    ...d.events.map((e): TimelineItem => ({ t: e.t, title: e.title, link: e.link, meta: `severity ${Math.round(e.severity * 10)}/10 · ${e.count > 1 ? e.count + ' sources' : e.source}`, c: heatColor(e.severity * 100 + 20) })),
    ...d.alerts.map((a): TimelineItem => ({ t: a.t, title: 'Alert: ' + a.title, link: a.link, meta: a.body, c: '#ff3b30' })),
  ].sort((a, b) => b.t - a.t);
  $('tl-note').textContent = 'severe or widely reported stories and alerts, kept for a year';
  $('timeline').replaceChildren(...(items.length
    ? items.map((i) => {
      const li = el('li', { className: 'ev' },
        el('span', { className: 'when', textContent: fmt(i.t) }),
        el('div', { className: 'what' }, i.link ? link(i.link, i.title) : el('b', { textContent: i.title }), el('div', { className: 'sub', textContent: i.meta })));
      li.style.setProperty('--c', i.c);
      return li;
    })
    : [el('li', { className: 'dim small', textContent: 'No major events recorded for this flashpoint yet.' })]));

  $('cov-note').textContent = `${d.stories.length} current stories · newest first`;
  $('news').replaceChildren(...d.stories.map((a) => {
    const li = el('li');
    const more = a.sources.length > 1 ? a.sources.map((s) => s.name).join(', ') : '';
    li.append(el('div', { className: 'body' },
      link(a.link, a.title),
      el('div', { className: 'sub' },
        el('span', { textContent: a.source }),
        ...(a.tier === 'state' ? [el('span', { className: 'badge state', textContent: 'State media' })] : []),
        el('span', { textContent: ago(a.ts) }),
        el('span', { className: 'sev', textContent: '▲ ' + Math.round(a.severity * 100) }),
      ),
      ...(more ? [el('div', { className: 'dim small', textContent: 'Also reported by: ' + more })] : []),
    ));
    return li;
  }));

  const stateCount = d.outlets.filter((o) => o.tier === 'state').reduce((n, o) => n + o.count, 0);
  const total = d.outlets.reduce((n, o) => n + o.count, 0) || 1;
  $('src-note').textContent = `${d.outlets.length} outlets · ${Math.round((stateCount / total) * 100)}% of reports from state media`;
  $('outlets').replaceChildren(...d.outlets.map((o) => el('span', {
    className: 'src ' + o.tier,
    textContent: `${o.name} · ${o.count}${o.tier === 'state' ? ' · state media' : ''}`,
  })));
}

async function load(): Promise<void> {
  const id = new URLSearchParams(location.search).get('id');
  try {
    const r = await fetch('/api/flashpoint?id=' + encodeURIComponent(id ?? ''));
    if (!r.ok) throw new Error(r.status === 404 ? 'Unknown flashpoint.' : 'HTTP ' + r.status);
    render((await r.json()) as FlashpointDetail);
  } catch (e) {
    $('fp-name').textContent = 'Could not load this flashpoint';
    $('fp-formula').textContent = errorMessage(e);
  }
}

void load();
setInterval(() => void load(), 5 * 60 * 1000);
