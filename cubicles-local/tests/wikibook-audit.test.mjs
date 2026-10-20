import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('source audit guards prevent filesystem changes, network, database and child processes outside isolation', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'cubicles-audit-guards-'));
  const workspace = path.join(directory, 'isolated');
  const protectedFile = path.join(directory, 'original.txt');
  await mkdir(workspace);
  await writeFile(protectedFile, 'original');
  const script = path.resolve('scripts/wikibook-audit.py');
  try {
    const output = execFileSync('python3', ['-I', '-c', `
import importlib.util, json, os, socket, sqlite3, subprocess, sys
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('source_audit', sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.isolate(sys.argv[2])
blocked = []
operations = {
    'write': lambda: open(sys.argv[3], 'w'),
    'remove': lambda: os.unlink(sys.argv[3]),
    'network': lambda: socket.socket().connect(('127.0.0.1', 5432)),
    'database': lambda: sqlite3.connect(':memory:'),
    'process': lambda: subprocess.run(['true']),
}
for name, operation in operations.items():
    try: operation()
    except PermissionError: blocked.append(name)
with open(os.path.join(sys.argv[2], 'allowed.txt'), 'w') as output: output.write('isolated')
print(json.dumps(blocked))
`, script, workspace, protectedFile], { encoding: 'utf8', timeout: 15_000 });
    assert.deepEqual(JSON.parse(output), ['write', 'remove', 'network', 'database', 'process']);
    assert.equal(await readFile(protectedFile, 'utf8'), 'original');
    assert.equal(await readFile(path.join(workspace, 'allowed.txt'), 'utf8'), 'isolated');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
