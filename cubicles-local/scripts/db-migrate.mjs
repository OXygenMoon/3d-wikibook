import { initApp, shutdownApp } from '../src/server/runtime.mjs';
import { getDriver } from '../src/server/db.mjs';

try {
  await initApp({ monitoring: false });
  console.log(`database migrations applied (${getDriver()})`);
} finally {
  await shutdownApp();
}
