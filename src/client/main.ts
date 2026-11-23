// Entry point for the dashboard page: loads data, wires the modules together, keeps the clock ticking.

import type { ApiData } from '../shared/types.ts';
import { initAlerts, renderAlertsAndBriefing } from './alerts.ts';
import { renderContext, renderMap } from './context.ts';
import { renderChips, renderClock, renderFlashpoints, renderModelPanel, renderNews, renderStatus, tick } from './dashboard.ts';
import { $, errorMessage } from './dom.ts';
import { initGood, renderCreditDial, renderGood, renderGoodHero } from './good.ts';
import { initMiniBars, initSplit } from './split.ts';
import { clearOverrides, hooks, recompute, state } from './state.ts';

/** Repaint everything that depends on the model (after a slider moves). */
function refresh(): void {
  if (!state.data) return;
  recompute(state.data);
  renderClock();
  renderFlashpoints();
  renderMap();
  renderGoodHero();
}
hooks.refresh = refresh;

async function load(force: boolean): Promise<void> {
  const btn = $<HTMLButtonElement>('refresh');
  btn.disabled = true;
  try {
    const r = await fetch('/api/data' + (force ? '?force=1' : ''));
    if (!r.ok) throw new Error('HTTP ' + r.status);
    recompute((await r.json()) as ApiData);
    renderClock(); renderFlashpoints(); renderModelPanel(); renderChips(); renderNews();
    renderStatus(); renderContext(); renderAlertsAndBriefing(); renderGood();
  } catch (e) {
    $('status').textContent = 'Failed to load: ' + errorMessage(e);
  } finally {
    btn.disabled = false;
  }
}

$('refresh').onclick = () => void load(true);
$('reset').onclick = () => {
  clearOverrides();
  renderModelPanel();
  renderCreditDial();
  refresh();
};

initSplit();
initMiniBars();
initAlerts();
initGood();
setInterval(tick, 1000);
setInterval(() => void load(false), 5 * 60 * 1000);
void load(false);
