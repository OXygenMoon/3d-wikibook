import { emitKeypressEvents } from 'node:readline';
import { initDatabase, closeDatabase } from '../src/server/db.mjs';
import { config } from '../src/server/config.mjs';
import { adminPasswordError, changeAdminPassword } from '../src/server/admin-password.mjs';

function hiddenInput(prompt) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('请在交互终端运行；密码不通过命令参数、环境变量或管道接收。');
  emitKeypressEvents(process.stdin);
  process.stdout.write(prompt);
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = error => {
      process.stdin.off('keypress', input);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
      if (error) reject(error); else resolve(value);
    };
    const input = (characters, key = {}) => {
      if (key.ctrl && ['c', 'd'].includes(key.name)) return finish(new Error('已取消，密码未修改。'));
      if (['return', 'enter'].includes(key.name)) return finish();
      if (key.name === 'backspace') value = Array.from(value).slice(0, -1).join('');
      else if (!key.ctrl && !key.meta && characters && !/[\x00-\x1f\x7f]/.test(characters)) value += characters;
    };
    process.stdin.setRawMode(true);
    process.stdin.on('keypress', input);
    process.stdin.resume();
  });
}

try {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--username')) throw new Error('用法：node scripts/admin-password.mjs [--username 账号]');
  const username = args[1] || config.adminUsername;
  const password = await hiddenInput('新管理员密码（不显示输入）：');
  const error = adminPasswordError(password);
  if (error) throw new Error(error);
  if (password !== await hiddenInput('再次输入新密码：')) throw new Error('两次输入不一致，密码未修改。');
  await initDatabase({ migrate: false, reset: false });
  const result = await changeAdminPassword(username, password);
  console.log(`管理员 ${result.username} 密码已修改，旧登录会话已撤销。`);
  console.log(`修改前备份：${result.backup}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally { await closeDatabase().catch(() => {}); }
