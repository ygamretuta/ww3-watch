// Project paths and tiny JSON file helpers. Data files live in data/ (gitignored).

import fs from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '../..');
export const DATA_DIR = path.join(ROOT, 'data');
export const PUBLIC_DIR = path.join(ROOT, 'public');

fs.mkdirSync(DATA_DIR, { recursive: true });

export const dataFile = (name: string): string => path.join(DATA_DIR, name);

/** Read a JSON array; anything missing or malformed yields []. */
export function readList<T>(file: string): T[] {
  try {
    const j: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(j) ? (j as T[]) : [];
  } catch {
    return [];
  }
}

/** Read a JSON value with a fallback. */
export function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(file: string, value: unknown): void {
  try {
    fs.writeFileSync(file, JSON.stringify(value));
  } catch {
    // best effort: a read-only disk shouldn't take the dashboard down
  }
}
