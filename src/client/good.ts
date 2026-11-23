// De-escalation side: time bought, theatres, good-news feed, wins timeline, credit dial.

import type { GoodStory } from '../shared/types.ts';
import { drawMap, shortName, type Pin } from './context.ts';
import { $, ago, el, pad, thumb } from './dom.ts';
import { getCalc, getData, hooks, overrides, saveOverrides } from './state.ts';

let filter = 'all';
const GREEN = '#16915f';
const dayLabel = (t: number): string => new Date(t).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

const durText = (sec: number): string => {
  const d = Math.floor(sec / 86400);
  return d >= 365 ? `${(d / 365).toFixed(1)} yrs` : `${d} days`;
};

export function renderGoodHero(): void {
  const data = getData();
  const calc = getCalc();
  let s = Math.max(0, Math.floor(calc.delaySeconds));
  const y = Math.floor(s / 31536000); s -= y * 31536000;
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  $('g-y').textContent = pad(y, 2);
  $('g-d').textContent = pad(d, 3);
  $('g-h').textContent = pad(h, 2);
  $('g-m').textContent = pad(m, 2);
  $('g-s').textContent = pad(s, 2);
  $('m-gtime').textContent = `+${y}y ${d}d ${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}`;
  $('m-gpct').textContent = `signal ${Math.round(data.mitigation * 100)}%`;
  $('g-pct').textContent = Math.round(data.mitigation * 100) + '%';
  $('g-fill').style.width = data.mitigation * 100 + '%';
  $('g-credit').textContent = `−${(calc.credit * 100).toFixed(1)}% of risk`;
  $('g-without').textContent = `Without it: ${durText(calc.secondsBase)} left · with it: ${durText(calc.secondsRemaining)}`;

  // pointer back to the escalation side so the link between the two is visible
  const note = $('g-note');
  note.hidden = calc.delaySeconds < 60;
  note.textContent = `Cuts the risk index from ${Math.round(calc.rawRisk * 100)}% to ${Math.round(calc.risk * 100)}% ←`;

  const k = data.goodNews.kinds.filter((x) => x.count).map((x) => `${x.label} ${x.count}`).join(' · ');
  $('g-vs-sum').textContent = `How time is bought: ${data.goodNews.total} signals in 72 hours · what counts?`;
  $('g-vs-body').replaceChildren(
    el('p', { textContent: 'Each story is rated for concrete de-escalation: talks announced count a little, aid delivered, prisoners released or a ceasefire holding count more, and signed agreements or lasting ceasefires count most. Threats, violated ceasefires and blocked aid count for nothing.' }),
    el('p', { textContent: 'Fresh stories count most (24-hour half-life), state-media and low-reliability outlets count half, and independent corroboration boosts a story. The total is capped (see Model settings), then taken off the risk index and converted to time on the clock.' }),
    el('p', { className: 'dim small', textContent: k ? `Right now: ${k}.` : 'No signals right now.' }),
  );
}

interface Bucket { id: string; name: string; stories: GoodStory[]; geo: [number, number] | null }

/** One bucket per theatre with signals, plus one for stories that name no theatre. */
function buckets(): Bucket[] {
  const data = getData();
  const out: Bucket[] = data.goodNews.theatres.map((t) => ({
    id: t.id, name: t.name, geo: data.flashpoints.find((f) => f.id === t.id)?.geo ?? null,
    stories: data.goodNews.stories.filter((a) => a.theatres.includes(t.id)).sort((x, y) => y.relief - x.relief),
  }));
  const loose = data.goodNews.stories.filter((a) => !a.theatres.length).sort((x, y) => y.relief - x.relief);
  if (loose.length) out.push({ id: '_global', name: 'Humanitarian & global', geo: null, stories: loose });
  return out.filter((b) => b.stories.length).sort((a, b) => b.stories.length - a.stories.length);
}

function openGoodCard(id: string): void {
  const card = document.getElementById('gc-' + id);
  if (!card) return;
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card.classList.add('flash');
  setTimeout(() => card.classList.remove('flash'), 1600);
}

function renderGoodMap(list: Bucket[]): void {
  const max = Math.max(1, ...list.map((b) => b.stories.length));
  drawMap($<HTMLElement>('g-map') as unknown as SVGSVGElement, list.flatMap((b): Pin[] => b.geo ? [{
    geo: b.geo, r: 1.2 + (b.stories.length / max) * 2.8, color: GREEN, ring: b.stories.length === max,
    label: `${shortName(b.id, b.name)} ${b.stories.length}`, title: `${b.name}: ${b.stories.length} signals`,
    onActivate: () => openGoodCard(b.id),
  }] : []));
  $('g-globals').replaceChildren(
    el('span', { className: 'dim small', textContent: 'No fixed location:' }),
    ...list.filter((b) => !b.geo).map((b) => {
      const c = el('button', { className: 'chip', textContent: `${b.name} ${b.stories.length}` });
      c.style.borderColor = GREEN;
      c.onclick = () => openGoodCard(b.id);
      return c;
    }),
  );
}

function renderSignals(): void {
  const data = getData();
  const list = buckets();
  renderGoodMap(list);

  const outlets = new Set(data.goodNews.stories.flatMap((s) => s.sources.map((x) => x.name)));
  const calc = getCalc();
  $('g-strip-head').textContent = data.goodNews.total
    ? `${data.goodNews.total} de-escalation signals from ${outlets.size} outlets in the last 72 hours, buying about ${durText(calc.delaySeconds)}.`
    : 'No clear de-escalation signals in the last 72 hours.';
  const brief = data.briefing?.deescalation ?? '';
  $('g-brief').textContent = brief;
  $('g-brief').hidden = !brief;

  const max = Math.max(1, ...list.map((b) => b.stories.length));
  const label = new Map(data.goodNews.kinds.map((k) => [k.id, k.label]));
  const open = new Set([...document.querySelectorAll<HTMLElement>('#g-cards details[open]')].map((d) => d.dataset.id));
  $('g-cards').replaceChildren(...list.map((b) => {
    const card = el('div', { className: 'card', id: 'gc-' + b.id });
    card.style.setProperty('--c', GREEN);
    const fill = el('div');
    fill.style.width = (b.stories.length / max) * 100 + '%';
    const top = b.stories.find((a) => a.img) ?? b.stories[0];
    const names = new Set(b.stories.flatMap((a) => a.sources.map((x) => x.name)));
    const ul = el('ul');
    for (const a of b.stories.slice(0, 3)) ul.append(el('li', {}, el('a', { href: a.link, target: '_blank', rel: 'noopener', textContent: a.title })));
    const why = el('ul', { className: 'drivers' });
    for (const a of b.stories.slice(0, 10)) {
      why.append(el('li', {},
        el('b', { textContent: String(Math.round(a.relief * 10)) }),
        el('a', { href: a.link, target: '_blank', rel: 'noopener', textContent: a.title }),
        el('span', { className: 'dim', textContent: `${a.source}${a.count > 1 ? ` +${a.count - 1} more` : ''} · ${label.get(a.kind) ?? a.kind} · ${ago(a.ts)} · ${a.method === 'llm' ? 'AI-rated' : 'keyword-rated'}` }),
      ));
    }
    const details = el('details', { open: open.has(b.id) }, el('summary', { textContent: 'Why these count?' }),
      el('div', { className: 'why' }, el('div', { className: 'dim small', textContent: 'Strongest signals first (relief rating out of 100):' }), why));
    details.dataset.id = b.id;
    card.append(
      thumb(top?.img, b.name, GREEN, 'banner', top?.link),
      el('h3', {}, el('span', { textContent: b.name }), el('em', { textContent: String(b.stories.length) })),
      el('div', { className: 'bar' }, fill),
      el('div', { className: 'meta', textContent: `${b.stories.length} signal${b.stories.length > 1 ? 's' : ''} · ${names.size} outlet${names.size > 1 ? 's' : ''} / 72h` }),
      ul,
      details,
    );
    return card;
  }));
}

function renderGoodChips(): void {
  const { goodNews } = getData();
  const kinds = [{ id: 'all', label: 'All', count: goodNews.total }, ...goodNews.kinds];
  $('g-chips').replaceChildren(...kinds.map((k) => {
    const b = el('button', { className: 'chip' + (k.id === filter ? ' on' : ''), textContent: `${k.label} ${k.count}` });
    b.onclick = () => { filter = k.id; renderGoodChips(); renderGoodNews(); };
    return b;
  }));
}

function renderGoodNews(): void {
  const data = getData();
  const names = new Map(data.flashpoints.map((f) => [f.id, f.name]));
  const label = new Map(data.goodNews.kinds.map((k) => [k.id, k.label]));
  const items = data.goodNews.stories.filter((a) => filter === 'all' || a.kind === filter).slice(0, 60);
  $('g-count').textContent = `${items.length} stories · newest first`;
  $('g-news').replaceChildren(...(items.length ? items.map((a) => {
    const li = el('li');
    const srcList = el('div', { className: 'srcs', hidden: true });
    for (const s of a.sources) srcList.append(el('a', { className: 'src ' + s.tier, href: s.link, target: '_blank', rel: 'noopener', textContent: s.name }));
    const more: HTMLElement[] = [];
    if (a.count > 1) {
      const b = el('button', { className: 'more', textContent: `+${a.count - 1} more source${a.count > 2 ? 's' : ''} ▾` });
      b.onclick = () => { srcList.hidden = !srcList.hidden; };
      more.push(b);
    }
    const sub = el('div', { className: 'sub' },
      el('span', { textContent: a.source }),
      el('span', { className: 'badge kind', textContent: label.get(a.kind) ?? a.kind }),
      ...(a.tier === 'state' ? [el('span', { className: 'badge state', textContent: 'State media', title: 'Government-controlled or -funded outlet; weighted at half' })] : []),
      ...more,
      el('span', { textContent: ago(a.ts) }),
      ...a.theatres.slice(0, 2).map((id) => el('span', { className: 'tag', textContent: names.get(id) ?? id })),
    );
    const body = el('div', { className: 'body' }, el('a', { href: a.link, target: '_blank', rel: 'noopener', textContent: a.title }), sub, srcList);
    if (a.summary && a.summary.length > 40 && !a.summary.startsWith(a.title.slice(0, 30))) body.append(el('p', { textContent: a.summary }));
    li.append(thumb(a.img, a.source, GREEN, 'side', a.link), body);
    return li;
  }) : [el('li', { className: 'dim small', textContent: 'Nothing in this category right now.' })]));
}

function renderWins(): void {
  const data = getData();
  const ev = data.goodNews.wins;
  const names = new Map(data.flashpoints.map((f) => [f.id, f.name]));
  const label = new Map(data.goodNews.kinds.map((k) => [k.id, k.label]));
  $('g-tl-note').textContent = 'notable agreements, releases and relief, kept for a year';
  if (!ev.length) {
    $('g-timeline').replaceChildren(el('li', { className: 'dim small', textContent: 'No notable wins recorded yet. Corroborated or AI-rated de-escalation stories are added automatically.' }));
    return;
  }
  const rows: HTMLElement[] = [];
  let day = '';
  for (const e of ev) {
    const d = dayLabel(e.t);
    if (d !== day) { day = d; rows.push(el('li', { className: 'day', textContent: d })); }
    const li = el('li', { className: 'ev' });
    li.style.setProperty('--c', GREEN);
    li.append(
      el('span', { className: 'when', textContent: new Date(e.t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) }),
      el('div', { className: 'what' },
        el('a', { href: e.link, target: '_blank', rel: 'noopener', textContent: e.title }),
        el('div', { className: 'sub' },
          el('span', { className: 'sev', textContent: label.get(e.kind) ?? e.kind }),
          el('span', { textContent: e.count > 1 ? `${e.count} sources` : e.source }),
          ...e.theatres.slice(0, 2).map((id) => el('span', { className: 'tag', textContent: names.get(id) ?? id })),
        ),
      ),
    );
    rows.push(li);
  }
  $('g-timeline').replaceChildren(...rows);
}

// ---- credit dial ----
export function renderCreditDial(): void {
  const data = getData();
  const value = Math.round((overrides.credit ?? data.maxCredit) * 100);
  $<HTMLInputElement>('g-cap').value = String(value);
  $('g-cap-out').textContent = value + '%';
  const outlets = new Set(data.goodNews.stories.flatMap((s) => s.sources.map((x) => x.name)));
  $('g-sources').textContent = `Counting ${data.goodNews.total} stories from ${outlets.size} outlets in the last 72 hours. State-media and low-reliability outlets count half; stories fade with a 24-hour half-life.`;
}

export function renderGood(): void {
  renderGoodHero(); renderSignals(); renderGoodChips(); renderGoodNews(); renderWins(); renderCreditDial();
}

/** Wire up the credit dial. Call once at startup. */
export function initGood(): void {
  const cap = $<HTMLInputElement>('g-cap');
  cap.oninput = () => {
    const v = Number(cap.value) / 100;
    if (v === getData().maxCredit) delete overrides.credit; else overrides.credit = v;
    $('g-cap-out').textContent = Math.round(v * 100) + '%';
    saveOverrides();
    hooks.refresh();
  };
  $('g-cap-reset').onclick = () => {
    delete overrides.credit;
    saveOverrides();
    renderCreditDial();
    hooks.refresh();
  };
}
