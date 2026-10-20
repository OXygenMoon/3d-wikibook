export class ClassroomUI {
  constructor(context) { Object.assign(this, context); this.classId = null; this.data = null; this.busy = false; }
  async show({ fromPanel = null } = {}) {
    if (!this.state.user) return this.open('login');
    const userId = this.state.user.id;
    this.data = await this.request('/api/classroom');
    if (this.state.user?.id !== userId || (fromPanel && this.state.panel !== fromPanel)) return;
    if (!this.data.classes.some(zone => zone.id === this.classId)) this.classId = this.data.classes[0]?.id;
    this.open('classroom');
  }
  roleForm(user) {
    const esc = this.esc;
    return `<form class="role-settings" data-classroom-form="role" data-user-id="${user.id}"><label>账号角色<select name="role" aria-label="${esc(user.name)}的角色">${[['user','学生'],['teacher','教师'],['admin','管理员']].map(([role,label])=>`<option value="${role}" ${user.role===role?'selected':''}>${label}</option>`).join('')}</select></label><label>教师负责班级<select name="teachingClassIds" multiple aria-label="${esc(user.name)}负责的班级">${this.state.zones.map(zone=>`<option value="${zone.id}" ${user.teachingClassIds?.includes(zone.id)?'selected':''}>${esc(zone.name)}</option>`).join('')}</select></label><button class="secondary" type="submit">保存角色</button><p class="form-error" role="alert"></p></form>`;
  }
  render(name) {
    if (name !== 'classroom' || !this.data) return null;
    const esc = this.esc;
    const zone = this.data.classes.find(candidate => candidate.id === this.classId);
    if (!zone) return this.shell('班级课堂', '<p class="empty-note">还没有分配班级，请联系管理员。</p>');
    const manage = this.data.managedClassIds.includes(zone.id);
    const announcements = this.data.announcements.filter(item => item.classId === zone.id).slice().reverse();
    const tasks = this.data.tasks.filter(task => task.classId === zone.id).slice().reverse();
    return this.shell(`${esc(zone.name)} · 班级课堂`, `
      <nav class="admin-tabs" aria-label="选择班级">${this.data.classes.map(candidate=>`<button type="button" data-action="classroom-class" data-class-id="${candidate.id}" class="${candidate.id===zone.id?'active':''}">${esc(candidate.name)}</button>`).join('')}</nav>
      <section class="classroom-section"><h3>班级公告</h3>${announcements.map(item=>`<article class="classroom-announcement"><p>${esc(item.text)}</p><small>${esc(item.authorName)}</small></article>`).join('')||'<p class="empty-note">班级还没有公告。</p>'}
      ${manage?`<form data-classroom-form="announcement"><label class="form-label">公告内容<textarea name="text" maxlength="500" required></textarea></label><p class="form-error" role="alert"></p><button class="secondary">发布公告</button></form>`:''}</section>
      <section class="classroom-section"><h3>班级任务</h3>${tasks.map(task=>this.taskCard(task,manage)).join('')||'<p class="empty-note">还没有任务，发布后会显示在这里。</p>'}
      ${manage?`<details class="classroom-create"><summary>发布新任务</summary><form data-classroom-form="task"><label class="form-label">任务名称<input name="title" maxlength="80" required></label><label class="form-label">任务要求<textarea name="description" maxlength="1000" required></textarea></label><label class="form-label">截止时间（可选）<input name="dueAt" type="datetime-local"></label>${this.rewardFields()}<p class="form-error" role="alert"></p><button class="primary">发布任务</button></form></details>`:''}</section>
      ${manage?this.memberSection(zone):''}
      ${this.learningSummary(zone)}
    `, { wide: true, className: 'classroom-dialog', eyebrow: manage?'教师工作台':'我的班级' });
  }
  taskCard(task, manage) {
    const esc = this.esc;
    const submissions = this.data.submissions.filter(submission=>submission.taskId===task.id);
    const own = submissions.find(submission=>submission.userId===this.state.user.id);
    const status = { pending: '等待教师确认', approved: '已完成', revision: '请修改后重新提交' };
    const expired = task.dueAt && Date.now() > task.dueAt;
    const closed = task.status === 'closed' || expired;
    return `<article class="classroom-task" data-task-id="${task.id}"><header><h4>${esc(task.title)}</h4><span class="tag">${closed?'已结束':'进行中'}</span></header><p>${esc(task.description)}</p><p class="task-rewards">完成奖励：${task.reward?.score||0} 活力${Object.entries(task.reward?.items||{}).map(([id,quantity])=>` · ${esc(this.data.rewardCatalog.items.find(item=>item.id===id)?.name||id)} × ${quantity}`).join('')}${task.reward?.modelIds?.length?' · 解锁专属模型':''}</p>${task.dueAt?`<small>截止：${esc(new Date(task.dueAt).toLocaleString('zh-CN'))}</small>`:''}
    ${manage?`<div class="classroom-review-list">${submissions.map(submission=>`<article data-submission-id="${submission.id}"><strong>${esc(submission.userName)} · ${status[submission.status]}</strong><p>${esc(submission.text)}</p>${submission.link?`<a href="${esc(submission.link)}" target="_blank" rel="noopener noreferrer">查看作品</a>`:''}${submission.status!=='approved'?`<form data-classroom-form="review" data-submission-id="${submission.id}" data-revision="${submission.revision}"><label class="form-label">反馈<input name="feedback" maxlength="500"></label><p class="form-error" role="alert"></p><div class="classroom-actions"><button class="primary" name="decision" value="approved">确认完成</button><button class="secondary" name="decision" value="revision">退回修改</button></div></form>`:`<p class="subtle">${esc(submission.feedback)}</p>`}</article>`).join('')||'<p class="subtle">暂时没有提交。</p>'}</div><button type="button" class="quiet" data-action="classroom-status" data-task-id="${task.id}" data-status="${task.status==='open'?'closed':'open'}">${task.status==='open'?'关闭任务':'重新开放'}</button>`:`${own?`<p class="submission-status">${status[own.status]}${own.feedback?` · ${esc(own.feedback)}`:''}</p>`:''}${own?.status!=='approved'&&!closed?`<form data-classroom-form="submission" data-task-id="${task.id}"><label class="form-label">提交内容<textarea name="text" maxlength="2000">${esc(own?.text||'')}</textarea></label><label class="form-label">作品链接（可选）<input name="link" type="url" maxlength="1000" value="${esc(own?.link||'')}" placeholder="https://"></label><label class="publish-choice"><input type="checkbox" name="publish" ${own?.publish?'checked':''}>完成后展示到本班作品墙</label><p class="form-error" role="alert"></p><button class="primary">${own?'更新提交':'提交任务'}</button></form>`:''}`}
    </article>`;
  }
  memberSection(zone) {
    const esc = this.esc;
    return `<section class="classroom-section"><h3>班级成员与工位</h3><div class="classroom-members">${this.data.members.filter(member=>member.classId===zone.id).map(member=>`<article><b>${esc(member.name)}</b><small>${esc(member.username)} · ${member.officeId%1000} 号工位</small>${member.role==='user'||this.state.user.role==='admin'?`<form data-classroom-form="assign" data-user-id="${member.id}"><label class="form-label">分配工位<select name="officeId">${this.data.offices.filter(office=>office.zoneId===zone.id&&(!office.ownerId||office.ownerId===member.id)).map(office=>`<option value="${office.id}" ${office.id===member.officeId?'selected':''}>${office.id%1000} 号</option>`).join('')}</select></label><p class="form-error" role="alert"></p><button class="secondary">保存工位</button></form>`:''}</article>`).join('')}</div><details><summary>按名单添加本班学生</summary><form data-classroom-form="members"><label class="form-label">CSV 名单<textarea name="csv" rows="5" required placeholder="账号,密码,姓名,班级&#10;student01,123456,新同学,${esc(zone.name)}"></textarea></label><p class="subtle">包含表头：账号,密码,姓名,班级。班级名称必须是${esc(zone.name)}。</p><p class="form-error" role="alert"></p><button class="secondary">导入本班名单</button></form></details></section>`;
  }
  rewardFields() {
    const esc = this.esc;
    return `<fieldset class="reward-settings"><legend>完成奖励</legend><label class="form-label">奖励活力<input type="number" name="rewardScore" min="0" max="1000" value="5" required></label><label class="form-label">奖励家具<select name="rewardItem"><option value="">不发放家具</option>${this.data.rewardCatalog.items.map(item=>`<option value="${item.id}">${esc(item.name)}</option>`).join('')}</select></label><label class="form-label">家具数量<input type="number" name="rewardQuantity" min="1" max="5" value="1"></label><label class="form-label">解锁模型（可多选）<select name="rewardModelIds" multiple>${this.data.rewardCatalog.models.map(model=>`<option value="${model.id}">${esc(model.name)}</option>`).join('')}</select></label><p class="subtle">管理员可在共享模型的“编辑模型”中设置任务解锁。奖励在教师确认完成后自动发放一次。</p></fieldset>`;
  }
  learningSummary(zone) {
    const esc = this.esc;
    const records = this.data.records.filter(record=>record.classId===zone.id).slice().reverse();
    const ranking = this.data.leaderboard.filter(member=>member.classId===zone.id).slice(0,20);
    const works = this.data.works.filter(work=>work.classId===zone.id);
    return `<section class="classroom-section"><h3>我的学习记录</h3><div class="learning-records">${records.map(record=>`<article><strong>${esc(record.title)}</strong><p>+${record.score} 活力${Object.entries(record.items).map(([id,quantity])=>` · ${esc(this.data.rewardCatalog.items.find(item=>item.id===id)?.name||id)} × ${quantity}`).join('')}${record.modelIds.length?' · 已解锁专属模型':''}</p></article>`).join('')||'<p class="empty-note">任务完成后，奖励记录会显示在这里。</p>'}</div></section><section class="classroom-section"><h3>班级活力榜</h3><div class="rank-table">${ranking.map((member,index)=>`<div><b>${index+1}</b><span>${esc(member.name)}<small>完成 ${member.completed} 项任务</small></span><strong>${member.score} 活力</strong></div>`).join('')||'<p class="empty-note">还没有班级成绩。</p>'}</div></section><section class="classroom-section"><h3>班级作品墙</h3><div class="classroom-works">${works.map(work=>`<article><h4>${esc(work.title)}</h4><small>${esc(work.name)}</small><p>${esc(work.text)}</p>${work.link?`<a href="${esc(work.link)}" target="_blank" rel="noopener noreferrer">查看作品</a>`:''}</article>`).join('')||'<p class="empty-note">学生选择展示且教师确认完成后，作品会出现在这里。</p>'}</div></section>`;
  }
  async click(element) {
    const action = element.dataset.action;
    if (!['classroom','classroom-class','classroom-status'].includes(action)) return false;
    try {
      if (action === 'classroom-class') this.classId = Number(element.dataset.classId);
      if (action === 'classroom-status') await this.request(`/api/classroom/tasks/${element.dataset.taskId}`, { method: 'PATCH', data: { status: element.dataset.status } });
      await this.show();
    } catch (error) { this.toast(error.message); }
    return true;
  }
  handles(form) { return Boolean(form.dataset.classroomForm); }
  async submit(form, submitter) {
    if (this.busy) return;
    this.busy = true;
    const buttons = [...form.querySelectorAll('button')];
    buttons.forEach(button=>button.disabled=true);
    try {
      const data = Object.fromEntries(new FormData(form));
      const kind = form.dataset.classroomForm;
      const prefix = `/api/classroom/classes/${this.classId}`;
      let endpoint, method = 'POST';
      if (kind === 'role') {
        endpoint = `/api/admin/users/${form.dataset.userId}/role`; method = 'PATCH';
        data.teachingClassIds = new FormData(form).getAll('teachingClassIds').map(Number);
      } else if (kind === 'review') {
        endpoint = `/api/classroom/submissions/${form.dataset.submissionId}/review`;
        data.baseRevision = Number(form.dataset.revision); data.status = submitter?.value;
      } else if (kind === 'submission') {
        endpoint = `/api/classroom/tasks/${form.dataset.taskId}/submission`; method = 'PUT';
        data.publish = new FormData(form).has('publish');
      } else if (kind === 'members') {
        endpoint = `${prefix}/members`; data.users = this.parseCSV(data.csv);
      } else if (kind === 'assign') {
        endpoint = `${prefix}/assign`; data.userId = form.dataset.userId; data.officeId = Number(data.officeId);
      } else {
        endpoint = `${prefix}/${kind === 'task'?'tasks':'announcements'}`;
        if (kind === 'task') {
          data.dueAt = data.dueAt ? new Date(data.dueAt).getTime() : null;
          data.reward = { score: Number(data.rewardScore), items: data.rewardItem ? { [data.rewardItem]: Number(data.rewardQuantity) } : {}, modelIds: new FormData(form).getAll('rewardModelIds') };
        }
      }
      await this.request(endpoint, { method, data });
      await this.refresh(false);
      if (form.isConnected) {
        if (kind === 'role') await this.showAdmin(); else await this.show({ fromPanel: 'classroom' });
      }
      this.toast(kind==='review'?'提交记录已更新。':'已保存。');
    } catch (error) { form.querySelector('.form-error').textContent = error.message; }
    finally { this.busy = false; buttons.forEach(button=>button.disabled=false); }
  }
}
