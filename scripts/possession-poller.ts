/*
  Background worker: polls ESPN every ~1s and updates possession for all live/watched games.
  Run with: npm run poller
*/

import 'dotenv/config';
import { updateLivePossession } from '@/lib/live/possession';
import { jitterMs } from '@/lib/ratelimit';

let running = true;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('[poller] starting possession poller loop');
  while (running) {
    const started = Date.now();
    try {
      const { updated, checked } = await updateLivePossession();
      const took = Date.now() - started;
      console.log('[poller] tick', { updated, checked, ms: took });
    } catch (e) {
      console.error('[poller] error', (e as Error)?.message);
    }
    const wait = Math.max(1000 - (Date.now() - started), 0);
    await sleep(jitterMs(wait, 0.1));
  }
  console.log('[poller] exiting');
}

process.on('SIGINT', () => { running = false; });
process.on('SIGTERM', () => { running = false; });

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();


