import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const dist = new URL('../dist/', import.meta.url);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await Promise.all([
  cp(new URL('../index.html', import.meta.url), new URL('index.html', dist)),
  cp(new URL('../src/', import.meta.url), new URL('src/', dist), { recursive: true }),
  cp(new URL('../public/', import.meta.url), dist, { recursive: true }),
  cp(new URL('../node_modules/three/', import.meta.url), new URL('vendor/three/', dist), {
    recursive: true,
    filter: path => !path.includes('/examples/fonts') && !path.includes('/examples/screenshots'),
  }),
]);
console.log(`Built offline browser assets: ${root}/dist`);
