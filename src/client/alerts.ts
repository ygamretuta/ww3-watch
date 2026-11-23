// Daily briefing, alert list and browser notifications.

import type { AlertRec, BriefingRec } from '../shared/types.ts';
import { $, ago, el, errorMessage } from './dom.ts';
import { renderFlashpoints } from './dashboard.ts';
import { renderGood } from './good.ts';
import { getData, state } from './state.ts';

const NOTIFY_KEY = 'ww3-notify';
const SEEN_KEY = 'ww3-alert-seen';
const store = {
  get: (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string): void => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } },
};

// ---------- briefing ----------
// The briefing is a headline strip above the flashpoint cards; its per-flashpoint lines are drawn
// on the cards (dashboard.ts) and its de-escalation sentence in the light pane (good.ts).
function renderBriefing(b: BriefingRec | null): void {
  const watch = $('brief-watch');
  if (!b) { $('brief-headline').textContent = 'No briefing yet.'; watch.hidden = true; $('brief-meta').textContent = ''; return; }
  $('brief-headline').textContent = b.headline || b.text.split('\n')[0] || '';
  watch.textContent = b.watch ?? '';
  watch.hidden = !b.watch;
  const how = b.method === 'llm' ? `written by ${b.model}` : 'template summary · set ANTHROPIC_API_KEY for an AI-written one';
  const when = new Date(b.t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  $('brief-meta').textContent = `Briefing ${when} · ${how}${b.note ? ' · ' + b.note : ''}`;
}

// ---------- notifications ----------
const notifySupported = (): boolean => 'Notification' in window;
const notifyOn = (): boolean => notifySupported() && Notification.permission === 'granted' && store.get(NOTIFY_KEY) === '1';

function renderNotifyState(): void {
  const btn = $<HTMLButtonElement>('notify-btn');
  const label = $('notify-state');
  $('notify-test').hidden = !notifyOn();
  if (!notifySupported()) { btn.hidden = true; label.textContent = 'This browser does not support notifications.'; return; }
  if (Notification.permission === 'denied') { btn.hidden = true; label.textContent = 'Notifications are blocked for this site in your browser settings.'; return; }
  btn.hidden = false;
  btn.textContent = notifyOn() ? 'Turn off notifications' : 'Enable browser notifications';
  label.textContent = notifyOn() ? 'On: you will be notified while this page is open (it checks every 5 minutes).' : 'Off';
}

function pushNew(alerts: AlertRec[]): void {
  const seen = Number(store.get(SEEN_KEY) || 0);
  const fresh = alerts.filter((a) => a.t > seen).sort((a, b) => a.t - b.t);
  if (fresh.length) store.set(SEEN_KEY, String(Math.max(...fresh.map((a) => a.t))));
  if (!notifyOn() || !seen) return; // first ever load: don't replay history
  for (const a of fresh.slice(-3)) {
    try { new Notification(a.title, { body: a.body, tag: a.id }); } catch { /* blocked mid-session */ }
  }
}

function renderAlerts(): void {
  const data = getData();
  const list = data.alerts;
  const recent = list.filter((a) => Date.now() - a.t < 864e5);
  const latest = list[0];
  $('alert-sum').textContent = `Alerts · ${recent.length ? `${recent.length} in the last 24h` : 'none in the last 24h'}`
    + (latest ? ` — latest: ${latest.title} (${ago(latest.t)})` : '');
  $('alerts').replaceChildren(...(list.length
    ? list.slice(0, 8).map((a) => {
      const li = el('li', { className: 'alert ' + (a.dir || 'up') });
      li.append(
        el('span', { className: 'when', textContent: ago(a.t) }),
        el('div', {},
          a.fp
            ? el('a', { href: `flashpoint.html?id=${encodeURIComponent(a.fp)}`, target: '_blank', rel: 'noopener', textContent: a.title })
            : el('b', { textContent: a.title }),
          el('div', { className: 'dim small', textContent: a.body }),
        ),
      );
      return li;
    })
    : [el('li', { className: 'dim small', textContent: 'No alerts yet. They appear when the risk level changes, a flashpoint jumps 8+ points in about 6 hours, or one crosses 75.' })]));
  $('webhook-note').textContent = data.alertConfig.webhook
    ? 'Webhook configured: alerts and the daily briefing are also pushed to it, even when no one has this page open.'
    : 'To get alerts when this page is closed, set ALERT_WEBHOOK_URL on the server (Slack, Discord or ntfy-style JSON webhook).';
}

export function renderAlertsAndBriefing(): void {
  const data = getData();
  renderBriefing(data.briefing);
  renderAlerts();
  renderNotifyState();
  pushNew(data.alerts);
}

/** Wire up the buttons. Call once at startup. */
export function initAlerts(): void {
  const regen = $<HTMLButtonElement>('brief-regen');
  regen.onclick = async () => {
    regen.disabled = true;
    regen.textContent = 'Writing…';
    try {
      const r = await fetch('/api/briefing?regen=1');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const fresh = (await r.json()) as BriefingRec;
      if (state.data) state.data.briefing = fresh;
      renderBriefing(fresh);
      renderFlashpoints();
      renderGood();
    } catch (e) {
      $('brief-meta').textContent = 'Could not regenerate: ' + errorMessage(e);
    } finally {
      regen.disabled = false;
      regen.textContent = 'Regenerate';
    }
  };

  $('notify-btn').onclick = async () => {
    if (notifyOn()) { store.set(NOTIFY_KEY, '0'); renderNotifyState(); return; }
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      store.set(NOTIFY_KEY, '1');
      // only alert about things that happen from now on
      const latest = Math.max(0, ...(state.data?.alerts.map((a) => a.t) ?? []));
      store.set(SEEN_KEY, String(latest));
    }
    renderNotifyState();
  };

  $('notify-test').onclick = () => {
    new Notification('WW3 Watch', { body: 'Notifications are working.' });
  };
}
