// De-escalation side: time bought, theatres, good-news feed, wins timeline, credit dial.

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
  let s = Math.max(0, calc.delaySeconds);
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60);
  $('g-d').textContent = pad(d, 3);
  $('g-h').textContent = pad(h, 2);
  $('g-m').textContent = pad(m, 2);
  $('g-pct').textContent = Math.round(data.mitigation * 100) + '%';
  $('g-fill').style.width = data.mitigation * 100 + '%';
  $('g-credit').textContent = `−${(calc.credit * 100).toFixed(1)}% of risk`;
  $('g-without').textContent = `Without it: ${durText(calc.secondsBase)} left · with it: ${durText(calc.secondsRemaining)}`;

  // pointer on the dark side so the link between the two is visible
  const note = $('delay-note');
  note.hidden = calc.delaySeconds < 60;
  note.textContent = `Includes +${durText(calc.delaySeconds)} from de-escalation →`;
}

function renderTheatres(): void {
  const rows = getData().goodNews.theatres;
  const max = Math.max(1, ...rows.map((t) => t.count));
  $('g-theatres').replaceChildren(...(rows.length
    ? rows.map((t) => {
      const fill = el('div');
      fill.style.width = (t.count / max) * 100 + '%';
      return el('div', { className: 'theatre' },
        el('div', { className: 'top2' }, el('span', { textContent: t.name }), el('em', { textContent: `${t.count} signal${t.count > 1 ? 's' : ''}` })),
        el('div', { className: 'bar' }, fill),
        t.top ? el('a', { href: t.top.link, target: '_blank', rel: 'noopener', textContent: `${t.top.title} — ${t.top.source}` }) : '',
      );
    })
    : [el('p', { className: 'dim small', textContent: 'No clear de-escalation signals in the last 72 hours.' })]));
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

/** The briefing's de-escalation sentence, under the light pane's clock. */
export function renderGoodBrief(): void {
  const text = getData().briefing?.deescalation ?? '';
  const p = $('g-brief');
  p.textContent = text;
  p.hidden = !text;
}

export function renderGood(): void {
  renderGoodBrief(); renderGoodHero(); renderTheatres(); renderGoodChips(); renderGoodNews(); renderWins(); renderCreditDial();
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
