import { asc, getTableColumns, inArray, sql } from 'drizzle-orm';
import { isDeepStrictEqual } from 'node:util';
import * as schema from './schema.mjs';

export const domains = [
  { name: 'zones', table: schema.zones, fields: ['name'] },
  { name: 'users', table: schema.users, fields: ['username', 'role', 'classId', 'officeId'] },
  { name: 'modelAssets', table: schema.modelAssets, fields: ['ownerId', 'visibility'] },
  { name: 'buildings', table: schema.worldBuildings, fields: ['assetId'] },
  { name: 'officeLayouts', table: schema.officeLayouts, fields: ['zoneId'] },
  { name: 'classTasks', table: schema.classTasks, fields: ['classId', 'authorId'] },
  { name: 'classSubmissions', table: schema.classSubmissions, fields: ['taskId', 'userId', 'classId'] },
  { name: 'classAnnouncements', table: schema.classAnnouncements, fields: ['classId', 'authorId'] },
  { name: 'rewardGrants', table: schema.rewardGrants, fields: ['taskId', 'userId', 'submissionId'] },
  { name: 'sourceClasses', table: schema.sourceClasses, fields: ['provider', 'namespace', 'subject', 'zoneId'] },
  { name: 'sourceIdentities', table: schema.sourceIdentities, fields: ['provider', 'namespace', 'subject', 'userId'] },
  { name: 'sourceGroups', table: schema.sourceGroups, fields: ['provider', 'namespace', 'subject'] },
  { name: 'sourceMemberships', table: schema.sourceMemberships, fields: ['groupId', 'userId'] },
];

export const identityDomainNames = ['sourceClasses', 'sourceIdentities', 'sourceGroups', 'sourceMemberships'];

export async function readDomainRows(database) {
  const rows = {};
  for (const domain of domains) rows[domain.name] = await database.select().from(domain.table).orderBy(asc(domain.table.id));
  return rows;
}

export function inflateState(metadata, rows) {
  if (metadata.domainStorage !== 1) return structuredClone(metadata);
  const state = structuredClone(metadata);
  delete state.domainStorage;
  delete state.domainStorageVersion;
  for (const domain of domains) {
    const values = (rows[domain.name] || []).slice().sort((first, second) => first.position - second.position);
    if (domain.name === 'officeLayouts') {
      state.officeStyles = {};
      state.officePositions = {};
      for (const row of values) {
        if (row.data.style !== null) state.officeStyles[row.id] = structuredClone(row.data.style);
        if (row.data.position !== null) state.officePositions[row.id] = structuredClone(row.data.position);
      }
    } else state[domain.name] = values.map(row => structuredClone(row.data));
  }
  return state;
}

export function splitState(state) {
  const metadata = { ...state, domainStorage: 1, domainStorageVersion: 2 };
  const rows = {};
  const officeIds = [...new Set([...Object.keys(state.officeStyles || {}), ...Object.keys(state.officePositions || {})])].sort((first, second) => Number(first) - Number(second));
  for (const domain of domains) {
    const values = domain.name === 'officeLayouts'
      ? officeIds.map(id => ({ id: Number(id), zoneId: Math.floor(Number(id) / 1000), style: state.officeStyles[id] || null, position: state.officePositions[id] || null }))
      : state[domain.name] || [];
    rows[domain.name] = values.map((value, position) => ({
      id: value.id, position,
      ...Object.fromEntries(domain.fields.map(field => [field, value[field] ?? null])),
      data: domain.name === 'officeLayouts' ? { style: value.style, position: value.position } : value,
    }));
    delete metadata[domain.name];
  }
  delete metadata.officeStyles;
  delete metadata.officePositions;
  return { metadata, rows };
}

export async function writeDomainRows(transaction, next, previous) {
  for (const domain of domains.slice().reverse()) {
    const ids = new Set(next[domain.name].map(row => row.id));
    const removed = (previous[domain.name] || []).filter(row => !ids.has(row.id)).map(row => row.id);
    for (let offset = 0; offset < removed.length; offset += 250) await transaction.delete(domain.table).where(inArray(domain.table.id, removed.slice(offset, offset + 250)));
  }
  for (const domain of domains) {
    const old = new Map((previous[domain.name] || []).map(row => [row.id, row]));
    const changed = next[domain.name].filter(row => !isDeepStrictEqual(row, old.get(row.id)));
    const columns = getTableColumns(domain.table);
    const update = Object.fromEntries(Object.entries(columns).filter(([key]) => key !== 'id').map(([key, column]) => [key, sql.raw(`excluded."${column.name}"`)]));
    for (let offset = 0; offset < changed.length; offset += 250) await transaction.insert(domain.table).values(changed.slice(offset, offset + 250)).onConflictDoUpdate({ target: domain.table.id, set: update });
  }
}
