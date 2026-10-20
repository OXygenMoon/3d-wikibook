import { generateOffices } from '../community.js';
import { fail } from './http.mjs';

function object(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) fail(400, `${label}格式无效或含不支持字段；不要提交密码、邮箱或完整数据库记录。`);
}

export function sourceId(value) {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) return null;
  return (typeof value === 'number' || typeof value === 'string') && /^[1-9]\d{0,18}$/.test(String(value)) ? String(value) : null;
}

export function planWikibookRoster(payload, state) {
  object(payload, ['format', 'version', 'namespace', 'classes', 'groups', 'students', 'classMappings', 'bindings'], '名单');
  if (payload.format !== 'wikibook-roster' || payload.version !== 1 || typeof payload.namespace !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(payload.namespace)) fail(400, '请使用版本 1 的 wikibook-roster 格式及稳定的来源命名空间。');
  for (const key of ['classes', 'groups', 'students', 'classMappings', 'bindings']) {
    if (!Array.isArray(payload[key]) || payload[key].length > 3000) fail(400, `${key} 必须是最多 3000 行的数组。`);
  }
  if (!payload.students.length) fail(400, '请提供至少一名学生。');
  const issues = [];
  const issue = (code, message, studentId) => issues.push({ code, message, ...(studentId ? { sourceUserId: studentId } : {}) });
  const catalog = (rows, label) => {
    const result = new Map();
    for (const row of rows) {
      object(row, ['id', 'name'], label);
      const id = sourceId(row.id);
      if (!id || typeof row.name !== 'string' || !row.name.trim()) { issue('invalid_catalog', `${label}编号或名称无效。`); continue; }
      if (result.has(id)) issue('duplicate_catalog', `${label}编号 ${id} 重复。`);
      result.set(id, row.name);
    }
    return result;
  };
  const classes = catalog(payload.classes, '源班级');
  const groups = catalog(payload.groups, '源分组');
  const scoped = rows => (rows || []).filter(row => row.provider === 'wikibook' && row.namespace === payload.namespace);
  const classMappings = new Map(scoped(state.sourceClasses).map(row => [row.subject, row.zoneId]));
  const explicitClasses = new Set();
  for (const mapping of payload.classMappings) {
    object(mapping, ['sourceClassId', 'targetZoneId'], '班级映射');
    const id = sourceId(mapping.sourceClassId);
    if (!id || !classes.has(id) || !Number.isSafeInteger(mapping.targetZoneId) || !state.zones.some(zone => zone.id === mapping.targetZoneId)) { issue('invalid_class_mapping', '班级映射必须引用存在的源班级和目标区域。'); continue; }
    if (explicitClasses.has(id)) issue('duplicate_class_mapping', '同一源班级不能重复配置映射。');
    explicitClasses.add(id);
    classMappings.set(id, mapping.targetZoneId);
  }
  if (new Set(classMappings.values()).size !== classMappings.size) issue('duplicate_class_mapping', '班级映射必须一对一，不能隐式合并班级。');
  const storedIdentities = scoped(state.sourceIdentities);
  const bindings = new Map(storedIdentities.map(row => [row.subject, row.userId]));
  const explicitBindings = new Set();
  const conflictingBindings = new Set();
  for (const binding of payload.bindings) {
    object(binding, ['sourceUserId', 'targetUserId'], '账号绑定');
    const id = sourceId(binding.sourceUserId);
    if (!id || typeof binding.targetUserId !== 'string') { issue('invalid_binding', '账号绑定编号无效。'); continue; }
    if (bindings.has(id) && bindings.get(id) !== binding.targetUserId) {
      issue('stored_binding_conflict', '来源身份已永久绑定其他账号，不能通过导入改绑。', id);
      conflictingBindings.add(id);
      continue;
    }
    if (explicitBindings.has(id) || [...bindings].some(([subject, target]) => target === binding.targetUserId && subject !== id)) {
      issue('duplicate_binding', '源账号与目标账号必须一对一。', id);
      conflictingBindings.add(id);
      for (const [existing, target] of bindings) if (target === binding.targetUserId) conflictingBindings.add(existing);
    }
    bindings.set(id, binding.targetUserId);
    explicitBindings.add(id);
  }
  const seen = new Set();
  const studentNumbers = new Set();
  const usernames = new Set();
  const candidates = [];
  const seats = generateOffices(state.zones, state.officePositions);
  for (const row of payload.students) {
    object(row, ['id', 'username', 'name', 'studentId', 'classId', 'groupIds'], '学生');
    const id = sourceId(row.id);
    if (!id) { issue('invalid_student_id', '学生来源编号无效。'); continue; }
    const before = issues.length;
    if (conflictingBindings.has(id)) issue('conflicting_binding', '该账号涉及重复绑定，不能规划工位。', id);
    if (seen.has(id)) issue('duplicate_student', '学生来源编号重复。', id);
    seen.add(id);
    if (typeof row.username !== 'string' || !row.username.length || row.username.length > 80 || row.username.trim() !== row.username || /\p{C}/u.test(row.username)) issue('username_incompatible', '账号需要 1–80 个字符且不能含首尾空白或控制字符，不会截断或改写。', id);
    if (usernames.has(row.username)) issue('duplicate_username', '源名单存在重复账号。', id);
    usernames.add(row.username);
    if (typeof row.name !== 'string' || !row.name.trim() || row.name.length > 80) issue('invalid_name', '学生姓名需要 1–80 个字符。', id);
    if (row.studentId !== undefined && (typeof row.studentId !== 'string' || row.studentId.length > 40)) issue('invalid_student_number', '学号格式无效。', id);
    const number = typeof row.studentId === 'string' ? row.studentId.trim() : '';
    if (number && studentNumbers.has(number)) issue('duplicate_student_number', '源名单存在重复学号。', id);
    if (number) studentNumbers.add(number);
    const classId = sourceId(row.classId);
    const targetZoneId = classMappings.get(classId);
    if (!classes.has(classId) || !targetZoneId) issue('unmapped_class', '学生未分班、源班级不存在或尚未映射目标区域。', id);
    if (!Array.isArray(row.groupIds) || row.groupIds.some(groupId => !groups.has(sourceId(groupId))) || new Set(row.groupIds.map(sourceId)).size !== row.groupIds.length) issue('invalid_group', '学生分组必须引用不同的已知源分组；分组不等于班级。', id);
    const target = bindings.has(id) ? state.users.find(user => user.id === bindings.get(id)) : null;
    if (bindings.has(id) && (!target || target.role !== 'user')) issue('invalid_target_account', '只能显式绑定存在的学生账号，不能覆盖管理员或教师。', id);
    if (state.users.some(user => user.username === row.username && user.id !== target?.id)) issue('username_collision', '目标已有同名账号，请核对身份后显式绑定；不会按姓名或账号自动合并。', id);
    if (target && !seats.some(seat => seat.id === target.officeId && seat.zoneId === target.classId)) issue('invalid_existing_office', '目标账号现有工位无效，需先修复。', id);
    if (issues.length !== before) continue;
    candidates.push({ sourceUserId: id, sourceKey: `wikibook:${payload.namespace}:${id}`, username: row.username, name: row.name, studentId: number || null, sourceClassId: classId, groupIds: row.groupIds.map(sourceId), targetZoneId, target });
  }
  for (const id of explicitBindings) if (!seen.has(id)) issue('orphan_binding', '账号绑定不在本次学生名单中。', id);
  for (const previous of scoped(state.sourceClasses)) {
    if (classMappings.get(previous.subject) !== previous.zoneId && storedIdentities.some(identity => identity.sourceClassId === previous.subject && !seen.has(identity.subject))) issue('incomplete_class_transfer', '变更班级区域映射时，必须包含该源班级全部已导入学生，不能只移动部分名单。');
  }
  const occupied = new Set(state.users.map(user => user.officeId));
  for (const candidate of candidates) if (candidate.target && candidate.target.classId !== candidate.targetZoneId) occupied.delete(candidate.target.officeId);
  const assignments = [];
  for (const candidate of candidates.sort((first, second) => first.sourceUserId.length - second.sourceUserId.length || first.sourceUserId.localeCompare(second.sourceUserId))) {
    const { target, ...details } = candidate;
    const office = target?.classId === candidate.targetZoneId ? seats.find(seat => seat.id === target.officeId) : seats.find(seat => seat.zoneId === candidate.targetZoneId && !occupied.has(seat.id));
    if (!office) { issue('insufficient_capacity', '目标班级没有空工位，需要规划区域或分世界，不会挤占已有工位。', candidate.sourceUserId); continue; }
    occupied.add(office.id);
    assignments.push({ ...details, targetUserId: target?.id || null, targetUsername: target?.username || candidate.username, officeId: office.id, previousOfficeId: target?.officeId || null, action: !target ? 'create' : target.classId === candidate.targetZoneId ? 'keep' : 'transfer' });
  }
  return {
    dryRun: true, importImplemented: true, apiImportEnabled: false, namespace: payload.namespace, canPlan: issues.length === 0,
    summary: { students: payload.students.length, planned: assignments.length, create: assignments.filter(row => row.action === 'create').length, keep: assignments.filter(row => row.action === 'keep').length, transfer: assignments.filter(row => row.action === 'transfer').length, issues: issues.length, totalOffices: seats.length },
    assignments, issues,
    nextGate: '此页面仅预检，不写入。实际导入仅限停服后的离线维护命令，需独立凭据文件、完整备份及计划指纹确认。',
  };
}
