import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { ITEMS } from '../community.js';
import { fail } from './http.mjs';
import { planWikibookRoster, sourceId } from './wikibook-preflight.mjs';
import { passwordHashSupported } from './password.mjs';

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

export function prepareWikibookImport(roster, credentials, original) {
  const state = structuredClone(original);
  for (const name of ['sourceClasses', 'sourceIdentities', 'sourceGroups', 'sourceMemberships']) state[name] ||= [];
  const report = planWikibookRoster(roster, state);
  if (!report.canPlan) return { report, next: null, fingerprint: null, changed: false };
  if (!credentials || credentials.format !== 'wikibook-credentials' || credentials.version !== 1 || credentials.namespace !== roster.namespace || !Array.isArray(credentials.credentials) || Object.keys(credentials).some(key => !['format', 'version', 'namespace', 'credentials'].includes(key))) fail(400, '凭据文件格式或来源命名空间不匹配。');
  const hashes = new Map();
  const ids = new Set(report.assignments.map(row => row.sourceUserId));
  for (const row of credentials.credentials) {
    if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).some(key => !['sourceUserId', 'passwordHash'].includes(key))) fail(400, '凭据记录格式无效。');
    const id = sourceId(row.sourceUserId);
    if (!id || !ids.has(id) || hashes.has(id) || !passwordHashSupported(row.passwordHash) || !row.passwordHash.includes('$')) fail(400, '凭据存在重复、未知身份或不支持的密码格式，不执行导入。');
    hashes.set(id, row.passwordHash);
  }
  for (const row of report.assignments) if (row.action === 'create' && !hashes.has(row.sourceUserId)) fail(400, `学生 ${row.sourceUserId} 缺少兼容的密码哈希。`);
  report.existingCredentialsIgnored = report.assignments.filter(row => row.action !== 'create' && hashes.has(row.sourceUserId)).length;
  const fingerprint = createHash('sha256').update(JSON.stringify(canonical({ roster, credentials, target: state }))).digest('hex');
  const next = structuredClone(state);
  const prefix = `wikibook:${roster.namespace}`;
  const scope = rows => rows.filter(row => row.provider === 'wikibook' && row.namespace === roster.namespace);
  const zoneByClass = new Map(scope(state.sourceClasses).map(row => [row.subject, row.zoneId]));
  for (const mapping of roster.classMappings) zoneByClass.set(sourceId(mapping.sourceClassId), mapping.targetZoneId);
  const put = (rows, value) => {
    const previous = rows.find(row => row.id === value.id);
    if (previous) Object.assign(previous, value);
    else rows.push(value);
  };
  for (const row of roster.classes) {
    const subject = sourceId(row.id);
    if (zoneByClass.has(subject)) put(next.sourceClasses, { id: `${prefix}:class:${subject}`, provider: 'wikibook', namespace: roster.namespace, subject, name: row.name, zoneId: zoneByClass.get(subject) });
  }
  for (const row of roster.groups) {
    const subject = sourceId(row.id);
    put(next.sourceGroups, { id: `${prefix}:group:${subject}`, provider: 'wikibook', namespace: roster.namespace, subject, name: row.name });
  }
  const moving = report.assignments.filter(row => row.action === 'transfer');
  const styles = new Map(moving.map(row => [row.targetUserId, state.officeStyles[row.previousOfficeId]]));
  for (const row of moving) delete next.officeStyles[row.previousOfficeId];
  const members = new Set();
  const additions = [];
  for (const row of report.assignments) {
    let user = next.users.find(candidate => candidate.id === row.targetUserId);
    if (!user) {
      user = { id: randomUUID(), username: row.username, name: row.name, passwordHash: hashes.get(row.sourceUserId), credentialFormat: 'werkzeug', role: 'user', teachingClassIds: [], unlockedModelIds: [], classId: row.targetZoneId, officeId: row.officeId, avatar: 'classic', color: '#a6b79a', inventory: Object.fromEntries(ITEMS.map(item => [item.id, item.limit])), score: 0, catches: [], completedTasks: [], createdAt: Date.now() };
      next.users.push(user);
    }
    if (row.action === 'transfer') {
      user.classId = row.targetZoneId;
      user.officeId = row.officeId;
      if (styles.get(user.id)) next.officeStyles[row.officeId] = structuredClone(styles.get(user.id));
      else delete next.officeStyles[row.officeId];
    }
    const previous = next.sourceIdentities.find(candidate => candidate.id === row.sourceKey);
    put(next.sourceIdentities, { ...previous, id: row.sourceKey, provider: 'wikibook', namespace: roster.namespace, subject: row.sourceUserId, userId: user.id, sourceUsername: row.username, sourceClassId: row.sourceClassId, studentId: row.studentId, createdAt: previous?.createdAt || Date.now() });
    members.add(user.id);
    for (const group of row.groupIds) additions.push({ id: `${prefix}:membership:${group}:${user.id}`, groupId: `${prefix}:group:${group}`, userId: user.id });
  }
  const scopedGroups = new Set(scope(next.sourceGroups).map(row => row.id));
  const retained = next.sourceMemberships.filter(row => !(members.has(row.userId) && scopedGroups.has(row.groupId)));
  next.sourceMemberships = [...retained, ...additions].sort((first, second) => first.id.localeCompare(second.id));
  const changed = !isDeepStrictEqual(next, state);
  return { report, next, fingerprint, changed };
}
