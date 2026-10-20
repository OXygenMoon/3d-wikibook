export function wikibookPreflightForm(esc, zoneId) {
  const example = { format: 'wikibook-roster', version: 1, namespace: 'school-demo', classes: [{ id: 101, name: '示例源班级' }], groups: [], students: [{ id: 1, username: 'wiki_student_demo', name: '示例学生', studentId: 'DEMO001', classId: 101, groupIds: [] }], classMappings: [{ sourceClassId: 101, targetZoneId: zoneId }], bindings: [] };
  return `<form id="wikibook-preflight-form"><h3>WikiBook 迁移 · 名单与工位预检</h3><p>当前仅检查，不创建账号、不改变工位、不迁移密码或奖励。班级需显式映射；不会自动合并同名账号。</p><label class="form-label">脱敏名单 JSON<textarea name="roster" rows="15" spellcheck="false" required aria-describedby="wikibook-preflight-help">${esc(JSON.stringify(example, null, 2))}</textarea></label><p class="subtle" id="wikibook-preflight-help">默认内容是虚构示例。请不要粘贴密码、邮箱或完整数据库记录；单次默认最多约 488 KiB。网页不执行导入；离线维护命令须先停服、备份并确认计划指纹。</p><p class="form-error" role="alert"></p><button class="primary" type="submit">运行预检（不写入）</button><div id="wikibook-preflight-result" role="status" aria-live="polite"></div></form>`;
}

export async function submitWikibookPreflight(form, request, esc) {
  const output = form.querySelector('#wikibook-preflight-result');
  const error = form.querySelector('[role="alert"]');
  output.textContent = '';
  error.textContent = '';
  const source = form.elements.roster.value;
  try {
    let data;
    try { data = JSON.parse(source); }
    catch { throw new Error('JSON 格式不正确，请检查引号、逗号和括号。'); }
    const result = await request('/api/admin/wikibook/preflight', { method: 'POST', data });
    if (!form.isConnected) return;
    if (form.elements.roster.value !== source) {
      output.textContent = '名单已变化，请重新运行预检。';
      return;
    }
    output.innerHTML = `<h3>${result.canPlan ? '预检可规划 · 尚未导入' : '存在异常 · 未执行导入'}</h3><p>${result.summary.students} 名学生，${result.summary.planned} 个工位方案；拟新增 ${result.summary.create}、保留 ${result.summary.keep}、转班 ${result.summary.transfer}；${result.summary.issues} 项异常。</p>${result.issues.length ? `<ul>${result.issues.map(issue => `<li>${issue.sourceUserId ? `学生 ${esc(issue.sourceUserId)}：` : ''}${esc(issue.message)}</li>`).join('')}</ul>` : ''}<p class="subtle">${esc(result.nextGate)}</p>`;
  } catch (failure) {
    if (form.isConnected) error.textContent = failure.message;
  }
}
