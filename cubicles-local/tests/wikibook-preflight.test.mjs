import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planWikibookRoster } from '../src/server/wikibook-preflight.mjs';

function fixtures() {
  const state = { zones: [{ id: 1, name: '一班', rows: 1, columns: 4, spacing: 7, x: 0, z: 0 }, { id: 2, name: '二班', rows: 1, columns: 2, spacing: 7, x: 40, z: 0 }], users: [{ id: 'admin', role: 'admin', username: 'lzy', classId: 1, officeId: 1001 }, { id: 'existing', role: 'user', username: 'existing', name: '同名学生', classId: 1, officeId: 1002, inventory: { cactus: 3 } }], officePositions: {}, officeStyles: { 1002: { furniture: [{ itemId: 'cactus' }] } } };
  const payload = { format: 'wikibook-roster', version: 1, namespace: 'school-a', classes: [{ id: 10, name: '源一班' }, { id: 20, name: '源二班' }], groups: [{ id: 70, name: '学习小组' }], students: [{ id: 1, username: 'source01', name: '同名学生', studentId: 'S01', classId: 10, groupIds: [70] }, { id: 2, username: 'source02', name: '同学二', studentId: 'S02', classId: 10, groupIds: [] }], classMappings: [{ sourceClassId: 10, targetZoneId: 1 }, { sourceClassId: 20, targetZoneId: 2 }], bindings: [] };
  return { state, payload };
}

test('roster preview is deterministic, keeps group identity and changes no state or input', () => {
  const { state, payload } = fixtures();
  const before = structuredClone({ state, payload });
  const report = planWikibookRoster(payload, state);
  assert.equal(report.canPlan, true);
  assert.equal(report.dryRun, true);
  assert.equal(report.importImplemented, true);
  assert.equal(report.apiImportEnabled, false);
  assert.deepEqual(report.assignments.map(row => row.officeId), [1003, 1004]);
  assert.deepEqual(report.assignments[0].groupIds, ['70']);
  assert.equal(report.assignments[0].sourceKey, 'wikibook:school-a:1');
  assert.deepEqual({ state, payload }, before);
  assert.deepEqual(planWikibookRoster({ ...payload, students: payload.students.toReversed() }, state), report);
});

test('explicit binding preserves a student seat and repeat previews never allocate a second office', () => {
  const { state, payload } = fixtures();
  payload.students[0].username = 'existing';
  payload.bindings = [{ sourceUserId: 1, targetUserId: 'existing' }];
  const report = planWikibookRoster(payload, state);
  assert.equal(report.canPlan, true);
  assert.equal(report.assignments[0].action, 'keep');
  assert.equal(report.assignments[0].officeId, 1002);
  assert.equal(report.summary.create, 1);
  assert.deepEqual(planWikibookRoster(payload, state), report);
});

test('username collisions, duplicate students and duplicate student numbers require explicit resolution', () => {
  const { state, payload } = fixtures();
  payload.students[0].username = 'existing';
  payload.students[1].id = 1;
  payload.students[1].studentId = 'S01';
  const report = planWikibookRoster(payload, state);
  assert.equal(report.canPlan, false);
  for (const code of ['username_collision', 'duplicate_student', 'duplicate_student_number']) assert.ok(report.issues.some(issue => issue.code === code));
  assert.equal(report.assignments.length, 0);
});

test('unassigned classes, invalid group references and incompatible usernames are not silently rewritten', () => {
  const { state, payload } = fixtures();
  Object.assign(payload.students[0], { classId: null, groupIds: [999], username: 'x'.repeat(81) });
  const report = planWikibookRoster(payload, state);
  for (const code of ['unmapped_class', 'invalid_group', 'username_incompatible']) assert.ok(report.issues.some(issue => issue.code === code));
  assert.equal(report.canPlan, false);
  assert.equal(report.summary.planned, 1);
});

test('capacity overflow is reported per student and does not replace existing owners', () => {
  const { state, payload } = fixtures();
  state.zones[0].columns = 2;
  const report = planWikibookRoster(payload, state);
  assert.equal(report.canPlan, false);
  assert.equal(report.summary.planned, 0);
  assert.equal(report.issues.filter(issue => issue.code === 'insufficient_capacity').length, 2);
  assert.equal(state.users[0].officeId, 1001);
});

test('planned cross-class swaps reserve unique seats and retain original assets unchanged', () => {
  const { state, payload } = fixtures();
  state.zones.forEach(zone => zone.columns = 1);
  state.users = [{ id: 'first', role: 'user', username: 'source01', classId: 1, officeId: 1001 }, { id: 'second', role: 'user', username: 'source02', classId: 2, officeId: 2001 }];
  payload.students[0].classId = 20;
  payload.bindings = [{ sourceUserId: 1, targetUserId: 'first' }, { sourceUserId: 2, targetUserId: 'second' }];
  const before = structuredClone(state);
  const report = planWikibookRoster(payload, state);
  assert.equal(report.canPlan, true);
  assert.equal(report.summary.transfer, 2);
  assert.deepEqual(report.assignments.map(row => row.officeId), [2001, 1001]);
  assert.deepEqual(state, before);
});

test('invalid, duplicate, privileged and orphan bindings cannot be used as automatic identity proof', () => {
  const { state, payload } = fixtures();
  for (const targetUserId of ['admin', 'missing']) {
    payload.bindings = [{ sourceUserId: 1, targetUserId }];
    assert.ok(planWikibookRoster(payload, state).issues.some(issue => issue.code === 'invalid_target_account'));
  }
  payload.bindings = [{ sourceUserId: 1, targetUserId: 'existing' }, { sourceUserId: 2, targetUserId: 'existing' }, { sourceUserId: 999, targetUserId: 'missing' }];
  const report = planWikibookRoster(payload, state);
  assert.equal(report.canPlan, false);
  assert.ok(report.issues.some(issue => issue.code === 'duplicate_binding'));
  assert.ok(report.issues.some(issue => issue.code === 'orphan_binding'));
  assert.equal(report.assignments.length, 0);
  payload.classMappings[1].targetZoneId = 1;
  assert.ok(planWikibookRoster(payload, state).issues.some(issue => issue.code === 'duplicate_class_mapping'));
});

test('preflight rejects raw secrets, invalid schemas and unsafe numeric identifiers', () => {
  const { state, payload } = fixtures();
  for (const invalid of [null, [], { ...payload, version: 2 }, { ...payload, namespace: '../source' }, { ...payload, students: [] }, { ...payload, students: [null] }, { ...payload, password: 'do-not-export' }, { ...payload, students: [{ ...payload.students[0], password_hash: 'do-not-export' }] }]) assert.throws(() => planWikibookRoster(invalid, state), error => error.status === 400 && !error.message.includes('do-not-export'));
  payload.students[0].id = Number.MAX_SAFE_INTEGER + 1;
  assert.ok(planWikibookRoster(payload, state).issues.some(issue => issue.code === 'invalid_student_id'));
});
