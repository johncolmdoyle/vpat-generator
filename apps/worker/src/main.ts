/** Worker entrypoint: long-poll the SQS scan queue and process jobs one at a time. */
import { waitForDb, sqsReceive, sqsDelete } from '@vpat/backend';
import type { ScanJobMessage } from '@vpat/shared';
import { runJob } from './run.js';

async function main() {
  await waitForDb();
  console.log('[worker] ready, polling for scan jobs…');

  for (;;) {
    let msg;
    try {
      msg = await sqsReceive<ScanJobMessage>(20);
    } catch (err) {
      console.error('[worker] receive error', err);
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    if (!msg) continue;

    const { scanId, domain } = msg.body;
    console.log(`[worker] picked up scan ${scanId} for ${domain}`);
    try {
      await runJob(msg.body);
      console.log(`[worker] scan ${scanId} done`);
    } catch (err) {
      console.error(`[worker] scan ${scanId} failed`, err);
    } finally {
      // Job is terminal either way (failure is recorded as a scan event); remove it.
      await sqsDelete(msg.receiptHandle).catch((e) => console.error('[worker] delete error', e));
    }
  }
}

main().catch((err) => {
  console.error('[worker] fatal', err);
  process.exit(1);
});
