import { waitForDb, migrate } from '@vpat/backend';
import { assertAuthConfigured } from './auth.js';
import { buildServer, env } from './server.js';

async function main() {
  assertAuthConfigured();
  await waitForDb();
  await migrate();
  const app = buildServer();
  await app.listen({ host: '0.0.0.0', port: env.apiPort });
  app.log.info(`API listening on :${env.apiPort}`);
}

main().catch((err) => {
  console.error('API failed to start', err);
  process.exit(1);
});
