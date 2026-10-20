import { ITEMS } from '../community.js';
import { getState } from './store.mjs';
import { fail } from './http.mjs';

export function validateReward(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, '任务奖励格式无效。');
  const score = value.score ?? 0;
  if (!Number.isInteger(score) || score < 0 || score > 1000) fail(400, '奖励活力需要 0–1000 的整数。');
  const items = value.items ?? {};
  if (!items || typeof items !== 'object' || Array.isArray(items)) fail(400, '家具奖励格式无效。');
  for (const [id, quantity] of Object.entries(items)) {
    if (!ITEMS.some(item => item.id === id) || !Number.isInteger(quantity) || quantity < 1 || quantity > 5) fail(400, '家具奖励需选择目录内家具，每项 1–5 件。');
  }
  const modelIds = value.modelIds ?? [];
  if (!Array.isArray(modelIds) || modelIds.length > 5 || modelIds.some(id => !getState().modelAssets.some(asset => asset.id === id && asset.visibility === 'shared' && asset.access === 'reward'))) fail(400, '模型奖励只能使用需要任务解锁的共享模型，最多 5 个。');
  return { score, items: { ...items }, modelIds: [...new Set(modelIds)] };
}

export function grantTaskReward(task, submission, reviewer) {
  const state = getState();
  const id = `class-task:${task.id}:${submission.userId}`;
  const previous = state.rewardGrants.find(grant => grant.id === id);
  if (previous) return previous;
  const user = state.users.find(candidate => candidate.id === submission.userId);
  if (!user) fail(409, '提交记录对应的账号不存在。');
  const reward = validateReward(task.reward);
  const grant = { id, taskId: task.id, submissionId: submission.id, userId: user.id, classId: task.classId, reviewerId: reviewer.id, createdAt: Date.now(), ...reward };
  user.score += reward.score;
  for (const [itemId, quantity] of Object.entries(reward.items)) user.inventory[itemId] = (user.inventory[itemId] || 0) + quantity;
  user.unlockedModelIds = [...new Set([...(user.unlockedModelIds || []), ...reward.modelIds])];
  state.rewardGrants.push(grant);
  return grant;
}
