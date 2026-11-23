// History & context: 24h callout, hot-spot map, event timeline, Doomsday Clock panel.

import { WORLD_GRID } from './worldgrid.ts';
import { $, el, heatColor, svgEl } from './dom.ts';
import { getCalc, getData, isCustom } from './state.ts';

const SHORT: Record<string, string> = {
  russia: 'Ukraine', taiwan: 'Taiwan', mideast: 'Middle East', korea: 'Korea', indpak: 'Kashmir',
  sudan: 'Sudan', africa: 'Sahel / Congo', myanmar: 'Myanmar', arctic: 'Arctic',
};
const fmtDate = (t: number): string => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const fmtDateTime = (t: number): string => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const signed = (n: number, d = 1): string => (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n).toFixed(d);

// ---------- 24h callout ----------
function renderDelta(): void {
  const data = getData();
  const pts = data.history.points;
  const box = $('delta');
  const now = Date.now();
  // closest point to 24h ago, but only if it really is about a day old
  const ref = pts
    .filter((p) => now - p.t >= 20 * 36e5)
    .sort((a, b) => Math.abs(now - 864e5 - a.t) - Math.abs(now - 864e5 - b.t))[0];
  if (!ref) {
    box.textContent = `Tracking began ${fmtDateTime(pts[0]?.t ?? now)} · day-over-day change appears after 24 hours of history`;
    box.className = 'delta';
    return;
  }
  const d = (data.risk - ref.r) * 100; // default model, same basis as history
  let text = Math.abs(d) < 0.5 ? 'Flat vs 24h ago' : `${d > 0 ? '▲' : '▼'} ${signed(d)} pts vs 24h ago`;
  const refScores = ref.s;
  if (refScores) {
    const ids = data.history.ids;
    const moves = data.flashpoints
      .map((f) => ({ f, m: f.score - (refScores[ids.indexOf(f.id)] ?? NaN) }))
      .filter((x) => Number.isFinite(x.m))
      .sort((a, b) => Math.abs(b.m) - Math.abs(a.m));
    const top = moves[0];
    if (top && Math.abs(top.m) >= 2) text += ` · biggest mover: ${top.f.name} ${signed(top.m, 0)}`;
  }
  box.textContent = text + (isCustom() ? ' (default model)' : '');
  box.className = 'delta ' + (d > 0.5 ? 'up' : d < -0.5 ? 'down' : '');
}

// ---------- map ----------
export function openCard(id: string): void {
  const card = document.getElementById('fp-' + id);
  if (!card) return;
  const details = card.querySelector('details');
  if (details) details.open = true;
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card.classList.add('flash');
  setTimeout(() => card.classList.remove('flash'), 1600);
}

export interface Pin {
  geo: [number, number];
  r: number;
  color: string;
  label: string;
  title: string;
  ring?: boolean;
  onActivate: () => void;
}

/** Draw the dotted world map with pins into an <svg viewBox="0 0 180 72">. */
export function drawMap(svg: SVGSVGElement, pins: Pin[]): void {
  const g = WORLD_GRID;
  const land: string[] = [];
  g.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === '1') land.push(`M${x} ${y}h.78v.78h-.78z`);
  });
  svg.replaceChildren(svgEl('path', { d: land.join(''), class: 'land' }));
  for (const p of pins) {
    const x = (p.geo[0] + 180) / g.cell, y = (g.lat0 - p.geo[1]) / g.cell;
    const pin = svgEl('g', { class: 'pin', tabindex: 0 });
    if (p.ring) pin.append(svgEl('circle', { cx: x, cy: y, r: p.r, fill: p.color, class: 'ring' }));
    const label = svgEl('text', { x: x + p.r + 0.8, y: y + 0.9, class: 'plabel' });
    label.textContent = p.label;
    const title = svgEl('title');
    title.textContent = p.title;
    pin.append(
      svgEl('circle', { cx: x, cy: y, r: p.r, fill: p.color, 'fill-opacity': 0.85, stroke: '#000', 'stroke-width': 0.25 }),
      label,
      title,
    );
    pin.addEventListener('click', p.onActivate);
    pin.addEventListener('keydown', (e) => { if (e.key === 'Enter') p.onActivate(); });
    svg.append(pin);
  }
}

export const shortName = (id: string, name: string): string => SHORT[id] ?? name;

export function renderMap(): void {
  const data = getData();
  const calc = getCalc();
  const scoreOf = new Map(data.flashpoints.map((f, i) => [f.id, calc.scores[i] ?? 0]));
  drawMap($<HTMLElement>('map') as unknown as SVGSVGElement, data.flashpoints.flatMap((f): Pin[] => {
    if (!f.geo) return [];
    const score = scoreOf.get(f.id) ?? 0;
    return [{
      geo: f.geo, r: 1.2 + (score / 100) * 3.2, color: heatColor(score), ring: score >= 65,
      label: `${shortName(f.id, f.name)} ${score}`, title: `${f.name}: ${score}/100`, onActivate: () => openCard(f.id),
    }];
  }));

  $('globals').replaceChildren(
    el('span', { className: 'dim small', textContent: 'No fixed location:' }),
    ...data.flashpoints.filter((f) => !f.geo).map((f) => {
      const s = scoreOf.get(f.id) ?? 0;
      const b = el('button', { className: 'chip', textContent: `${f.name} ${s}` });
      b.style.borderColor = heatColor(s);
      b.onclick = () => openCard(f.id);
      return b;
    }),
  );
}

// ---------- timeline ----------
function renderTimeline(): void {
  const data = getData();
  const names = new Map(data.flashpoints.map((f) => [f.id, f.name]));
  const first = data.history.points[0];
  $('tl-note').textContent = `severe or widely reported stories, kept for a year · recording since ${first ? fmtDate(first.t) : 'now'}`;
  if (!data.events.length) {
    $('timeline').replaceChildren(el('li', { className: 'dim', textContent: 'No major events recorded yet. Severe or widely reported stories are added here automatically.' }));
    return;
  }
  const rows: HTMLElement[] = [];
  let day = '';
  for (const e of data.events) {
    const label = new Date(e.t).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    if (label !== day) { day = label; rows.push(el('li', { className: 'day', textContent: label })); }
    const li = el('li', { className: 'ev' });
    li.style.setProperty('--c', heatColor(e.severity * 100 + 20));
    li.append(
      el('span', { className: 'when', textContent: new Date(e.t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) }),
      el('div', { className: 'what' },
        el('a', { href: e.link, target: '_blank', rel: 'noopener', textContent: e.title }),
        el('div', { className: 'sub' },
          el('span', { className: 'sev', textContent: `severity ${Math.round(e.severity * 10)}/10` }),
          el('span', { textContent: e.count > 1 ? `${e.count} sources` : e.source }),
          ...e.flashpoints.slice(0, 2).map((id) => el('span', { className: 'tag', textContent: names.get(id) ?? id })),
        ),
      ),
    );
    rows.push(li);
  }
  $('timeline').replaceChildren(...rows);
}

// ---------- Doomsday Clock reference ----------
function renderDoomsday(): void {
  const d = getData().reference.doomsday;
  const when = new Date(d.announced + 'T12:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  $('vs-sum').textContent = `Doomsday Clock: ${d.seconds} seconds to midnight (${new Date(d.announced).getUTCFullYear()}) · how is this different?`;
  $('vs-body').replaceChildren(
    el('p', {}, 'The Bulletin of the Atomic Scientists set its clock to ', el('b', { textContent: `${d.seconds} seconds` }),
      ` on ${when} (${d.previous} the year before), the closest to midnight it has been. `,
      el('a', { href: d.url, target: '_blank', rel: 'noopener', textContent: 'Official page' }), '.'),
    el('ul', {},
      el('li', { textContent: 'It is set once a year by a board of experts, and it covers nuclear risk, climate, biosecurity and disruptive tech such as AI. This index is updated continuously from headlines and covers armed conflict and great-power tension only.' }),
      el('li', { textContent: 'It is a considered judgement about civilisation-scale risk. This is an automated heuristic, noisy by design, that reacts to the news cycle.' }),
      el('li', { textContent: 'The two are not on the same scale, so the countdowns above cannot be converted into each other. Treat the Doomsday Clock as the expert backdrop and this page as the live signal.' }),
    ),
  );
}

export function renderContext(): void {
  renderDoomsday(); renderDelta(); renderMap(); renderTimeline();
}
