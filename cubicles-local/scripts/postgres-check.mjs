import { Client } from 'pg';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../src/server/config.mjs';

if (!process.env.DATABASE_URL) throw new Error('请提供专用测试数据库 DATABASE_URL。');
const source = new URL(process.env.DATABASE_URL);
if (!/_(test|validation)(_|$)/.test(source.pathname)) throw new Error('只允许 test/validation 数据库作为验收入口。');
const client = new Client({ connectionString: source.toString() });
await client.connect();
const verified = [];
try {
  for (const [suite, variable] of [['backup','BACKUP_TEST_DATABASE_URL'],['domains','DOMAIN_TEST_DATABASE_URL'],['classroom','CLASSROOM_TEST_DATABASE_URL'],['wikibook-import','WIKIBOOK_TEST_DATABASE_URL']]) {
    const name = `cubicles_${suite}_test_${randomUUID().replaceAll('-','').slice(0,12)}`;
    const url = new URL(source);
    url.pathname = `/${name}`;
    await client.query(`CREATE DATABASE "${name}"`);
    try {
      await new Promise((resolve,reject)=>{
        const child=spawn(process.execPath,['--test',`tests/${suite}.test.mjs`],{cwd:config.root,env:{...process.env,[variable]:url.toString()},stdio:'inherit'});
        child.on('error',reject);
        child.on('exit',code=>code===0?resolve():reject(new Error(`${suite} failed with ${code}`)));
      });
      verified.push(suite);
    } finally { await client.query(`DROP DATABASE "${name}" WITH (FORCE)`); }
  }
  const result={ok:true,driver:'postgres',suites:verified,disposableDatabases:true};
  await mkdir(path.join(config.root,'.tmp','acceptance'),{recursive:true});
  await writeFile(path.join(config.root,'.tmp','acceptance','postgres-check.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
} finally { await client.end(); }
