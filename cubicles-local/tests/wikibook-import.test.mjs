import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, chmod, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';

const directory = await mkdtemp(path.join(tmpdir(), 'cubicles-wiki-import-'));
Object.assign(process.env, { CUBICLES_DATA_DIR: directory, PGLITE_DIR: path.join(directory, 'pglite'), CUBICLES_BACKUP_DIR: path.join(directory, 'backups'), DATABASE_URL: process.env.WIKIBOOK_TEST_DATABASE_URL || '', AUTO_IMPORT: 'false', LOG_LEVEL: 'silent', NODE_ENV: 'test', CUBICLES_DB_RESET: '0' });
const { server } = await import('../server.mjs');
const { initApp, shutdownApp } = await import('../src/server/runtime.mjs');
const { getState, getRevision, commitImportedState, saveState } = await import('../src/server/store.mjs');
const { getDb } = await import('../src/server/db.mjs');
const { prepareWikibookImport } = await import('../src/server/wikibook-import.mjs');
const { planWikibookRoster } = await import('../src/server/wikibook-preflight.mjs');
const { verifyPassword, hashPassword, passwordHashSupported } = await import('../src/server/password.mjs');
const { databaseSnapshot, writeFullBackup, restoreFullBackup, verifyFullBackup } = await import('../src/server/backup.mjs');
const { publicUser } = await import('../src/server/auth.mjs');
const schema = await import('../src/server/db/schema.mjs');
const execute = promisify(execFile);
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = () => `http://127.0.0.1:${server.address().port}`;
after(async () => { if (server.listening) await new Promise(resolve => server.close(resolve)); await shutdownApp(); await rm(directory, { recursive: true, force: true }); });
const password = '迁移Password123!';
const scryptHash = 'scrypt:32768:8:1$FZuYitt1$52a01314827474b4318d8a39e18412d829539a5ae046d4acd48880ee963878626b2fbef668be0c88e60c3bbbecf2cb83b83917b06eddf681c7d05e3e8570d3d9';
const pbkdfHash = 'pbkdf2:sha256:1000$pmCTUE3s$71c1dabd31f60ee3a014f2f9ee16eb1b06ed4ebba1dbb7231acccedcdd25d861';
const roster = { format: 'wikibook-roster', version: 1, namespace: 'school-a', classes: [{ id: 11, name: '源一班' }, { id: 22, name: '源二班' }], groups: [{ id: 33, name: '研究小组' }], students: [{ id: 1, username: '学生甲', name: '学生甲', studentId: 'A01', classId: 11, groupIds: [33] }, { id: 2, username: 'CaseStudent', name: '学生乙', classId: 22, groupIds: [33] }], classMappings: [{ sourceClassId: 11, targetZoneId: 1 }, { sourceClassId: 22, targetZoneId: 2 }], bindings: [] };
const credentials = { format: 'wikibook-credentials', version: 1, namespace: 'school-a', credentials: [{ sourceUserId: 1, passwordHash: scryptHash }, { sourceUserId: 2, passwordHash: pbkdfHash }] };
let identities, initialSnapshot;

test('password verification matches Werkzeug fixtures, retains native hashes and bounds malformed parameters', async () => {
  const sha512 = 'pbkdf2:sha512:1000$xuETCFsa$e62c1ff487c1302411d25d487e69143d66cab9794b7a4bc8cb8f192531b8751b4fbfd2705f539cdf7e8d149957d94b1a43b3c52d5c560f9079c7d0be07d44f76';
  for (const hash of [scryptHash, pbkdfHash, sha512, await hashPassword(password)]) {
    assert.equal(passwordHashSupported(hash), true);
    assert.equal(await verifyPassword(password, hash), true);
    assert.equal(await verifyPassword('wrong', hash), false);
  }
  for (const hash of [null, '', 'plain-text', 'pbkdf2:sha256:9999999$salt$' + 'a'.repeat(64), 'pbkdf2:md5:1000$salt$' + 'a'.repeat(32), 'scrypt:999999:8:1$salt$' + 'a'.repeat(128), 'scrypt:32768:99:9$salt$' + 'a'.repeat(128), 'pbkdf2:sha256:1000$salt$00']) {
    assert.equal(passwordHashSupported(hash), false);
    assert.equal(await verifyPassword(password, hash), false);
  }
});

test('student import persists identity, class and groups once and logs in independently with original credentials', async () => {
  getState().zones.push({ id: 2, name: '二班', x: 40, z: -5, rows: 2, columns: 2, spacing: 7, color: '#abcdef' });
  await saveState();
  initialSnapshot = await databaseSnapshot();
  const before = structuredClone(getState());
  const prepared = prepareWikibookImport(roster, credentials, getState());
  assert.equal(prepared.report.canPlan, true);
  assert.equal(prepared.changed, true);
  assert.deepEqual(getState(), before);
  assert.equal(prepareWikibookImport(roster, credentials, getState()).fingerprint, prepared.fingerprint);
  await commitImportedState(prepared.next, getRevision());
  identities = structuredClone(getState().sourceIdentities);
  assert.equal(identities.length, 2);
  assert.equal((await getDb().select().from(schema.sourceMemberships)).length, 2);
  const repeated = prepareWikibookImport({ ...roster, classMappings: [], bindings: [] }, credentials, getState());
  assert.equal(repeated.report.canPlan, true);
  assert.equal(repeated.changed, false);
  const replacement = structuredClone(credentials);
  replacement.credentials[0].passwordHash = pbkdfHash;
  const unchangedPassword = prepareWikibookImport(roster, replacement, getState());
  assert.equal(unchangedPassword.changed, false);
  assert.equal(unchangedPassword.report.existingCredentialsIgnored, 2);
  assert.equal(unchangedPassword.next.users.find(user => user.username === '学生甲').passwordHash, scryptHash);
  assert.ok(repeated.report.assignments.every(row => row.action === 'keep'));
  for (const username of ['学生甲', 'CaseStudent']) {
    const response = await fetch(base() + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.user.username, username);
    assert.equal(result.user.role, 'user');
    assert.equal(result.user.passwordHash, undefined);
    assert.equal(result.user.credentialFormat, undefined);
    assert.ok(!JSON.stringify(result).includes('A01'));
  }
  const wrongCase = await fetch(base() + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'casestudent', password }) });
  assert.equal(wrongCase.status, 401);
  assert.equal(publicUser(getState().users.find(user => user.username === '学生甲')).credentialFormat, undefined);
});

test('saved bindings cannot be redirected and transfer keeps user IDs, passwords, inventories and furniture', async () => {
  const first = getState().users.find(user => user.id === identities[0].userId);
  const second = getState().users.find(user => user.id === identities[1].userId);
  first.inventory.cactus = 8;
  first.score = 17;
  getState().officeStyles[first.officeId] = { name: '保留的布置', furniture: [{ id: 'plant', itemId: 'cactus', x: 0, z: 0, rotation: 0 }] };
  await saveState();
  const rebind = { ...roster, bindings: [{ sourceUserId: 1, targetUserId: second.id }] };
  assert.ok(planWikibookRoster(rebind, getState()).issues.some(issue => issue.code === 'stored_binding_conflict'));
  const transfer = structuredClone(roster);
  transfer.students[0].classId = 22;
  transfer.students[0].groupIds = [];
  const prepared = prepareWikibookImport(transfer, credentials, getState());
  const oldOffice = first.officeId;
  await commitImportedState(prepared.next, getRevision());
  const moved = getState().users.find(user => user.id === first.id);
  assert.equal(moved.classId, 2);
  assert.equal(moved.inventory.cactus, 8);
  assert.equal(moved.passwordHash, first.passwordHash);
  assert.equal(moved.score, 17);
  assert.equal(getState().officeStyles[moved.officeId].name, '保留的布置');
  assert.equal(getState().officeStyles[oldOffice], undefined);
  assert.equal(getState().sourceMemberships.filter(row => row.userId === first.id).length, 0);
  assert.equal(getState().sourceMemberships.filter(row => row.userId === second.id).length, 1);
  identities = structuredClone(getState().sourceIdentities);
  const partial = { ...transfer, students: [transfer.students[0]], classMappings: [{ sourceClassId: 11, targetZoneId: 2 }, { sourceClassId: 22, targetZoneId: 1 }] };
  assert.ok(planWikibookRoster(partial, getState()).issues.some(issue => issue.code === 'incomplete_class_transfer'));
  await assert.rejects(commitImportedState(prepared.next, getRevision() - 1), error => error.status === 409);
});

test('database failure rolls back accounts and source mappings together; current full backup includes all new domains', async () => {
  const additional = structuredClone(roster);
  additional.students = [{ id: 999, username: 'new_failure', name: '故障样本', classId: 11, groupIds: [33] }];
  const passwords = { ...credentials, credentials: [{ sourceUserId: 999, passwordHash: scryptHash }] };
  const prepared = prepareWikibookImport(additional, passwords, getState());
  const before = await databaseSnapshot();
  await getDb().execute(sql`CREATE FUNCTION reject_source_import() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.subject = '999' THEN RAISE EXCEPTION 'test import fault'; END IF; RETURN NEW; END $$`);
  await getDb().execute(sql`CREATE TRIGGER reject_source_import BEFORE INSERT ON source_identities FOR EACH ROW EXECUTE FUNCTION reject_source_import()`);
  try { await assert.rejects(commitImportedState(prepared.next, getRevision())); }
  finally {
    await getDb().execute(sql`DROP TRIGGER reject_source_import ON source_identities`);
    await getDb().execute(sql`DROP FUNCTION reject_source_import()`);
  }
  assert.deepEqual(await databaseSnapshot(), before);
  assert.equal(getState().users.some(user => user.username === 'new_failure'), false);
  const backup = await writeFullBackup('identity-roundtrip');
  const verified = await verifyFullBackup(backup);
  assert.equal(Object.keys(verified.tables).length, 17);
  assert.equal(verified.tables.sourceIdentities.length, 2);
  await restoreFullBackup(backup);
  await new Promise(resolve => server.close(resolve));
  await shutdownApp(); await initApp();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  assert.deepEqual(getState().sourceIdentities, identities);
  assert.equal(getState().users.length, 3);
});

test('offline CLI requires private inputs, writer lock and exact fingerprint, creates a backup and is idempotent', async () => {
  const input = structuredClone(roster);
  input.namespace = 'cli-school';
  input.students = [{ id: 501, username: 'cli_student', name: '命令行测试', classId: 11, groupIds: [] }];
  const secret = { format: 'wikibook-credentials', version: 1, namespace: input.namespace, credentials: [{ sourceUserId: 501, passwordHash: scryptHash }] };
  const rosterFile = path.join(directory, 'roster.json');
  const credentialsFile = path.join(directory, 'credentials.json');
  await writeFile(rosterFile, JSON.stringify(input), { mode: 0o600 });
  await writeFile(credentialsFile, JSON.stringify(secret), { mode: 0o600 });
  const args = ['scripts/wikibook-import.mjs', '--roster', rosterFile, '--credentials', credentialsFile];
  const run = extra => execute(process.execPath, [...args, ...extra], { cwd: process.cwd(), env: process.env, timeout: 30_000 });
  if (process.env.WIKIBOOK_TEST_DATABASE_URL) {
    const onlinePreview = JSON.parse((await run([])).stdout);
    assert.equal(onlinePreview.dryRun, true);
    await assert.rejects(run(['--commit', '--confirm', onlinePreview.fingerprint]), error => !error.stderr.includes(scryptHash));
  } else await assert.rejects(run([]), error => !error.stderr.includes(scryptHash));
  await new Promise(resolve => server.close(resolve)); await shutdownApp();
  try {
    const preview = JSON.parse((await run([])).stdout);
    assert.equal(preview.dryRun, true);
    assert.equal(preview.changed, true);
    await assert.rejects(run(['--commit', '--confirm', 'wrong']), error => error.stderr.includes('计划指纹不匹配') && !error.stderr.includes(scryptHash));
    await chmod(credentialsFile, 0o644);
    await assert.rejects(run([]), error => error.stderr.includes('权限 600'));
    await chmod(credentialsFile, 0o600);
    const applied = JSON.parse((await run(['--commit', '--confirm', preview.fingerprint])).stdout);
    assert.equal(applied.applied, true);
    assert.ok((await readdir(applied.backup)).includes('snapshot.json'));
    assert.equal(JSON.parse(await readFile(path.join(applied.backup, 'snapshot.json'), 'utf8')).tables.sourceIdentities.length, 2);
    const again = JSON.parse((await run([])).stdout);
    assert.equal(again.changed, false);
    const repeated = JSON.parse((await run(['--commit', '--confirm', again.fingerprint])).stdout);
    assert.equal(repeated.applied, false);
    assert.equal(repeated.reason, 'already-imported');
    assert.ok(!JSON.stringify(applied).includes(scryptHash));
  } finally {
    await initApp();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  }
  assert.equal(getState().sourceIdentities.length, 3);
  assert.equal(getState().users.filter(user => user.username === 'cli_student').length, 1);
});

test('database identity uniqueness rejects alternate IDs and restores committed memory', async () => {
  const before = await databaseSnapshot();
  getState().sourceIdentities.push({ ...getState().sourceIdentities[0], id: 'alternate-primary-id' });
  await assert.rejects(saveState());
  assert.deepEqual(await databaseSnapshot(), before);
  assert.equal(getState().sourceIdentities.some(row => row.id === 'alternate-primary-id'), false);
});

test('thirteen-table backups restore after the identity upgrade while new backups reject missing identity tables', async () => {
  const current = await writeFullBackup('identity-version-check');
  const snapshotFile = path.join(current, 'snapshot.json');
  const manifestFile = path.join(current, 'manifest.json');
  const parsed = JSON.parse(await readFile(snapshotFile, 'utf8'));
  delete parsed.tables.sourceIdentities;
  const bytes = Buffer.from(JSON.stringify(parsed));
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  manifest.files.find(file => file.path === 'snapshot.json').bytes = bytes.length;
  manifest.files.find(file => file.path === 'snapshot.json').sha256 = createHash('sha256').update(bytes).digest('hex');
  await writeFile(snapshotFile, bytes);
  await writeFile(manifestFile, JSON.stringify(manifest));
  await assert.rejects(verifyFullBackup(current), /sourceIdentities/);
  const legacy = structuredClone(initialSnapshot);
  for (const name of ['sourceClasses', 'sourceIdentities', 'sourceGroups', 'sourceMemberships']) delete legacy[name];
  delete legacy.communityState[0].data.domainStorageVersion;
  const legacyBytes = Buffer.from(JSON.stringify({ format: 'cubicles-full-backup', version: 1, tables: legacy }));
  const original = await writeFullBackup('legacy-identity-source');
  await writeFile(path.join(original, 'snapshot.json'), legacyBytes);
  await writeFile(path.join(original, 'manifest.json'), JSON.stringify({ format: 'cubicles-full-backup', version: 1, files: [{ path: 'snapshot.json', bytes: legacyBytes.length, sha256: createHash('sha256').update(legacyBytes).digest('hex') }] }));
  await restoreFullBackup(original);
  await new Promise(resolve => server.close(resolve)); await shutdownApp(); await initApp();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  assert.equal(getState().users.length, 1);
  assert.deepEqual(getState().sourceIdentities, []);
  assert.equal((await getDb().select().from(schema.sourceClasses)).length, 0);
});
