import { waitForDb } from '@vpat/backend';
import { buildServer, env } from './server.js';

async function main() {
  await waitForDb();
  const app = buildServer();
  await app.listen({ host: '0.0.0.0', port: env.apiPort });
  app.log.info(`API listening on :${env.apiPort}`);
}

main().catch((err) => {
  console.error('API failed to start', err);
  process.exit(1);
});
