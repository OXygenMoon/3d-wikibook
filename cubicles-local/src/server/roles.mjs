import { getState } from './store.mjs';
import { fail } from './http.mjs';

export function managedClassIds(user) {
  const ids = getState().zones.map(zone => zone.id);
  if (user.role === 'admin') return ids;
  if (user.role === 'teacher') return (user.teachingClassIds || []).filter(id => ids.includes(id));
  return [];
}

export function requireClassManager(user, classId) {
  const zone = getState().zones.find(candidate => candidate.id === classId);
  if (!zone) fail(404, '班级不存在。');
  if (!managedClassIds(user).includes(classId)) fail(403, '只能管理自己负责的班级。');
  return zone;
}

export function visibleClassIds(user) {
  return [...new Set([user.classId, ...managedClassIds(user)])].filter(id => getState().zones.some(zone => zone.id === id));
}
