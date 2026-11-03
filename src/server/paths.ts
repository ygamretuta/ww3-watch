// Project paths. (File access lives in storage.ts; nothing here touches the disk at import time,
// so this is safe to load inside a serverless function.)

import path from 'node:path';

// import.meta.dirname exists on Node 20.11+; fall back to the working directory if a bundler drops it
const here = typeof import.meta.dirname === 'string' ? import.meta.dirname : undefined;

export const ROOT = here ? path.resolve(here, '../..') : process.cwd();
export const PUBLIC_DIR = path.join(ROOT, 'public');
