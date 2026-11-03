// The escalation side: countdown clock, flashpoint cards, model settings, intel feed, status line.

import type { FlashpointApi } from '../shared/types.ts';
import { $, ago, el, heatColor, pad, thumb } from './dom.ts';
import { eff, getCalc, getData, hooks, isCustom, overrides, saveOverrides, state } from './state.ts';

const CATS: [string, string][] = [
  ['all', 'All'], ['war', 'Wars'], ['civil', 'Civil wars'], ['tech', 'Tech wars'],
  ['ai', 'AI'], ['cyber', 'Cyber'], ['nuclear', 'Nuclear'], ['osint', 'Insider / OSINT'],
];
let filter = 'all';

export function tick(): void {
  if (!state.target) return;
  let s = Math.max(0, Math.floor((state.target - Date.now()) / 1000));
  const y = Math.floor(s / 31536000); s -= y * 31536000;
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  $('d-y').textContent = pad(y, 2);
  $('d-d').textContent = pad(d, 3);
  $('d-h').textContent = pad(h, 2);
  $('d-m').textContent = pad(m, 2);
  $('d-s').textContent = pad(s, 2);
}

export function renderClock(): void {
  const calc = getCalc();
  $('risk-pct').textContent = Math.round(calc.risk * 100) + '%';
  $('risk-pct').title = calc.credit > 0 ? `${Math.round(calc.rawRisk * 100)}% before the de-escalation credit` : '';
  $('level').textContent = calc.level;
  $('custom').hidden = !isCustom();
  $('meter-fill').style.width = calc.risk * 100 + '%';
  const hot = heatColor(calc.risk * 100 + 15);
  document.documentElement.style.setProperty('--accent', hot);
  document.documentElement.style.setProperty('--glow', hot + '59');
  tick();
}

function whyPanel(f: FlashpointApi, i: number): HTMLElement {
  const calc = getCalc();
  const { baseline } = eff(f);
  const score = calc.scores[i] ?? 0;
  const baseAdd = Math.round(baseline * 0.65);
  const newsAdd = Math.round(f.heatRaw * 35);
  const wrap = el('div', { className: 'why' });
  wrap.append(
    el('div', { className: 'formula', textContent: `${baseAdd} baseline + ${newsAdd} live news = ${score}` }),
    el('div', { className: 'formula dim', textContent: `Accounts for ${((calc.riskShare[i] ?? 0) * 100).toFixed(1)} pts of the global ${Math.round(calc.risk * 100)}% risk` }),
  );
  if (!f.drivers.length) {
    wrap.append(el('p', { className: 'dim', textContent: 'No live headlines are moving this score right now.' }));
    return wrap;
  }
  const list = el('ul', { className: 'drivers' });
  for (const d of f.drivers) {
    list.append(el('li', {},
      el('b', { textContent: '+' + d.points }),
      el('a', { href: d.link, target: '_blank', rel: 'noopener', textContent: d.title }),
      el('span', { className: 'dim', textContent: `${d.source}${d.count > 1 ? ` +${d.count - 1} more` : ''}${d.tier === 'state' ? ' (state media, ½ weight)' : ''} · ${d.ageH}h old · severity ${Math.round(d.severity * 10)}/10 · ${d.method === 'llm' ? 'AI-rated' : 'keyword-rated'}` }),
    ));
  }
  wrap.append(el('div', { className: 'dim small', textContent: 'Headlines adding the most heat (points of the +35 news component):' }), list);
  return wrap;
}

export function renderFlashpoints(): void {
  const data = getData();
  const calc = getCalc();
  const order = data.flashpoints.map((f, i) => ({ f, i })).sort((a, b) => (calc.scores[b.i] ?? 0) - (calc.scores[a.i] ?? 0));
  const open = new Set([...document.querySelectorAll<HTMLElement>('.card details[open]')].map((d) => d.dataset.id));
  $('flashpoints').replaceChildren(...order.map(({ f, i }) => {
    const score = calc.scores[i] ?? 0;
    const c = heatColor(score);
    const card = el('div', { className: 'card', id: 'fp-' + f.id });
    card.style.setProperty('--c', c);
    const fill = el('div');
    fill.style.width = score + '%';
    const list = el('ul');
    for (const a of f.top) list.append(el('li', {}, el('a', { href: a.link, target: '_blank', rel: 'noopener', textContent: a.title })));
    const why = el('details', { open: open.has(f.id) }, el('summary', { textContent: 'Why this score?' }), whyPanel(f, i));
    why.dataset.id = f.id;
    card.append(
      thumb(f.img, f.name, c, 'banner', f.top[0]?.link),
      el('h3', {}, el('span', { textContent: f.name }), el('em', { textContent: String(score) })),
      el('div', { className: 'bar' }, fill),
      el('div', { className: 'meta', textContent: `news heat ${f.heat}% · ${f.mentions} headlines / 72h` }),
      list,
      why,
      el('a', { className: 'detail-link', href: `flashpoint.html?id=${encodeURIComponent(f.id)}`, target: '_blank', rel: 'noopener', textContent: 'Full timeline & sources →' }),
    );
    return card;
  }));
}

// ---- model settings: editable baselines & weights, saved in this browser only ----
export function renderModelPanel(): void {
  const rows = getData().flashpoints.slice().sort((a, b) => b.baseline - a.baseline).map((f) => {
    const slider = (key: 'baseline' | 'weight', min: number, max: number, step: number, fmt: (v: number) => string): HTMLElement => {
      const input = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(eff(f)[key]) });
      const out = el('output', { textContent: fmt(eff(f)[key]) });
      input.oninput = () => {
        const v = Number(input.value);
        out.textContent = fmt(v);
        const o = (overrides.fp[f.id] ??= {});
        if (v === f[key]) delete o[key]; else o[key] = v;
        if (!Object.keys(o).length) delete overrides.fp[f.id];
        saveOverrides();
        hooks.refresh();
      };
      return el('label', {}, el('span', { textContent: key === 'baseline' ? 'Baseline' : 'Weight' }), input, out);
    };
    return el('div', { className: 'mrow' },
      el('div', { className: 'mname', textContent: f.name }),
      slider('baseline', 0, 100, 1, (v) => String(v)),
      slider('weight', 0, 0.5, 0.005, (v) => (v * 100).toFixed(1) + '%'),
    );
  });
  $('model-rows').replaceChildren(...rows);
}

export function renderChips(): void {
  $('chips').replaceChildren(...CATS.map(([k, label]) => {
    const b = el('button', { className: 'chip' + (k === filter ? ' on' : ''), textContent: label });
    b.onclick = () => { filter = k; renderChips(); renderNews(); };
    return b;
  }));
}

export function renderNews(): void {
  const data = getData();
  const names = new Map(data.flashpoints.map((f) => [f.id, f.name]));
  const items = data.articles.filter((a) => filter === 'all' || a.categories.includes(filter)).slice(0, 80);
  $('count').textContent = `${items.length} stories · newest first`;
  $('news').replaceChildren(...items.map((a) => {
    const li = el('li');
    li.style.setProperty('--c', heatColor(a.severity * 100 + 20));
    const srcList = el('div', { className: 'srcs', hidden: true });
    for (const s of a.sources) {
      srcList.append(el('a', {
        className: 'src ' + s.tier, href: s.link, target: '_blank', rel: 'noopener',
        textContent: s.name + (s.tier === 'state' ? ' · state media' : ''),
      }));
    }
    const more: HTMLElement[] = [];
    if (a.count > 1) {
      const b = el('button', { className: 'more', textContent: `+${a.count - 1} more source${a.count > 2 ? 's' : ''} ▾`, title: 'Show every outlet reporting this story' });
      b.onclick = () => { srcList.hidden = !srcList.hidden; };
      more.push(b);
    }
    const sub = el('div', { className: 'sub' },
      el('span', { textContent: a.source }),
      ...(a.tier === 'state' ? [el('span', { className: 'badge state', textContent: 'State media', title: 'Government-controlled or -funded outlet; weighted at half' })] : []),
      ...(a.tier === 'low' ? [el('span', { className: 'badge low', textContent: 'Low reliability', title: 'Partisan, promotional or aggregator source; weighted at half' })] : []),
      ...more,
      el('span', { textContent: ago(a.ts) }),
      el('span', { className: 'sev', textContent: '▲ ' + Math.round(a.severity * 100) }),
      ...a.flashpoints.slice(0, 2).map((id) => el('span', { className: 'tag', textContent: names.get(id) ?? id })),
    );
    const body = el('div', { className: 'body' }, el('a', { href: a.link, target: '_blank', rel: 'noopener', textContent: a.title }), sub, srcList);
    if (a.summary && a.summary.length > 40 && !a.summary.startsWith(a.title.slice(0, 30))) body.append(el('p', { textContent: a.summary }));
    li.append(thumb(a.img, a.source, heatColor(a.severity * 100 + 20), 'side', a.link), body);
    return li;
  }));
}

export function renderStatus(): void {
  const data = getData();
  const c = data.classifier;
  const total = data.sources.ok.length + data.sources.failed.length;
  $('status').textContent = `Updated ${new Date(data.updated).toLocaleTimeString()} · ${data.sources.ok.length}/${total} sources`;
  $('classifier').textContent = c.enabled
    ? `Headlines rated by ${c.model} (${c.classified + c.fromCache} rated${c.pending ? `, ${c.pending} queued` : ''}${c.errors ? `, ${c.errors} batch error${c.errors > 1 ? 's' : ''}: ${c.lastError}` : ''}). Unrated ones use keyword matching.`
    : 'Headlines are rated by keyword matching. Set ANTHROPIC_API_KEY on the server to have an AI model judge relevance and severity instead.';
  const s = data.stats;
  $('foot').textContent = `${s.rawItems} headlines in → ${s.merged} duplicates merged, ${s.nonEnglishHidden} non-English hidden → ${s.stories} stories. `
    + (data.sources.failed.length
      ? 'Unreachable right now: ' + data.sources.failed.map((f) => `${f.name} (${f.error})`).join(', ')
      : 'All sources reachable.');
}
