// Draggable vertical divider between the dark (escalation) and light (de-escalation) panes.
// Drag, use arrow keys (Shift = bigger steps), Enter or double-click to reset. Stacks on narrow screens.

import { $ } from './dom.ts';

const KEY = 'ww3-split';
const MIN = 25, MAX = 75;
const clamp = (v: number): number => Math.max(MIN, Math.min(MAX, v));

export function initSplit(): void {
  const split = $('split');
  const div = $('divider');
  let pct = 50;
  try { pct = clamp(Number(localStorage.getItem(KEY)) || 50); } catch { /* storage blocked */ }

  const apply = (): void => {
    split.style.setProperty('--left', pct + '%');
    div.setAttribute('aria-valuenow', String(Math.round(pct)));
  };
  const save = (): void => { try { localStorage.setItem(KEY, String(pct)); } catch { /* storage blocked */ } };

  div.addEventListener('pointerdown', (e) => {
    if (!matchMedia('(min-width: 901px)').matches) return;
    div.setPointerCapture(e.pointerId);
    div.classList.add('drag');
    document.body.classList.add('dragging');
  });
  div.addEventListener('pointermove', (e) => {
    if (!div.hasPointerCapture(e.pointerId)) return;
    const r = split.getBoundingClientRect();
    pct = clamp(((e.clientX - r.left) / r.width) * 100);
    apply();
  });
  const stop = (e: PointerEvent): void => {
    if (div.hasPointerCapture(e.pointerId)) div.releasePointerCapture(e.pointerId);
    div.classList.remove('drag');
    document.body.classList.remove('dragging');
    save();
  };
  div.addEventListener('pointerup', stop);
  div.addEventListener('pointercancel', stop);

  div.addEventListener('dblclick', () => { pct = 50; apply(); save(); });
  div.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 10 : 2;
    if (e.key === 'ArrowLeft') pct = clamp(pct - step);
    else if (e.key === 'ArrowRight') pct = clamp(pct + step);
    else if (e.key === 'Home') pct = MIN;
    else if (e.key === 'End') pct = MAX;
    else if (e.key === 'Enter') pct = 50;
    else return;
    e.preventDefault();
    apply(); save();
  });

  apply();
}
