// Small typed DOM and formatting helpers shared by the browser modules.

export type Child = Node | string;

/** getElementById that fails loudly: a missing id means the HTML and the code have drifted. */
export function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} not found`);
  return e as T;
}

/** Create an element, assign properties, append children (strings become text nodes). */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...kids: Child[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  Object.assign(e, props);
  for (const k of kids) e.append(k);
  return e;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

export const heatColor = (s: number): string => (s >= 75 ? '#ff3b30' : s >= 60 ? '#ff7a1a' : s >= 45 ? '#ffb020' : '#5aa9ff');
export const pad = (n: number, w: number): string => String(n).padStart(w, '0');

export function ago(ts: number): string {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 60) return Math.max(m, 1) + 'm ago';
  const h = Math.round(m / 60);
  return h < 48 ? h + 'h ago' : Math.round(h / 24) + 'd ago';
}

export const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Image tile with a graceful fallback (initial on a tinted gradient) if the image is missing or blocked. */
export function thumb(url: string | undefined, label: string, color: string, cls: string, href?: string): HTMLElement {
  const text = (label || '?').trim().charAt(0).toUpperCase() || '?';
  const box: HTMLElement = href
    ? el('a', { className: 'thumb ' + cls, textContent: text, href, target: '_blank', rel: 'noopener noreferrer' })
    : el('div', { className: 'thumb ' + cls, textContent: text });
  box.style.setProperty('--c', color);
  if (url) {
    const img = el('img', { src: url, loading: 'lazy', alt: '', referrerPolicy: 'no-referrer' });
    img.onload = () => box.classList.add('has-img');
    img.onerror = () => img.remove();
    box.append(img);
  }
  return box;
}
