import { readdir, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const skip = new Set(['node_modules', 'dist', '.local-data', '.tmp', 'test-results', 'backups', 'drizzle']);
const files = [];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (skip.has(entry.name) || entry.name.startsWith('.')) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(full);
    else if (/\.(mjs|js)$/.test(entry.name)) files.push(full);
  }
}

await walk(root);

let failures = 0;
for (const file of files.sort()) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (error) {
    failures += 1;
    console.error(`syntax check failed: ${path.relative(root, file)}`);
    console.error(String(error.stderr || error.message));
  }
}

for (const jsonFile of ['package.json']) {
  try {
    JSON.parse(await readFile(path.join(root, jsonFile), 'utf8'));
  } catch (error) {
    failures += 1;
    console.error(`invalid JSON: ${jsonFile}: ${error.message}`);
  }
}

const tests = files.filter(file => file.includes(`${path.sep}tests${path.sep}`));
for (const file of tests) {
  const source = await readFile(file, 'utf8');
  if (/\b(?:test|describe)\.only\b/.test(source)) {
    failures += 1;
    console.error(`exclusive test found: ${path.relative(root, file)}`);
  }
}

if (failures) {
  console.error(`static checks failed: ${failures} problem(s)`);
  process.exit(1);
}
console.log(`static checks passed: ${files.length} source files, ${tests.length} test files`);
