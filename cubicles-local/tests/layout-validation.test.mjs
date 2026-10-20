import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateFurniture, layoutError, FurnitureHistory } from '../src/layout-validation.js';
import { initialFurniture, ITEMS } from '../src/community.js';

const inventory = Object.fromEntries(ITEMS.map(item => [item.id, item.limit]));
const asset = { id: 'model-one', width: 1, height: 1, depth: 1, scale: 1, visibility: 'private', ownerId: 'owner' };
const options = { inventory, assets: [asset], userId: 'owner' };
const model = { id: 'placed-model', itemId: 'model:model-one', x: 0, z: 0, rotation: 0 };

test('shared furniture validation checks rotated bounds, inventory, private ownership and model counts', () => {
  assert.equal(layoutError(initialFurniture(), options), '');
  assert.equal(layoutError([model], options), '');
  assert.match(layoutError([{ ...model, x: 1.3, rotation: 45 }], options), /边界/);
  assert.match(layoutError([model], { ...options, userId: 'other' }), /私有模型/);
  assert.match(layoutError(Array.from({ length: 9 }, (_, index) => ({ ...model, id: `model-${index}` })), options), /8 个/);
  assert.match(layoutError([{ ...model, itemId: 'chair' }, { ...model, id: 'second-chair', itemId: 'chair' }], options), /背包/);
  assert.match(layoutError([{ ...model, itemId: 'cup' }], options), /书桌/);
  assert.throws(() => validateFurniture([{ ...model, x: NaN }], options));
});

test('furniture history restores distinct snapshots and clears redo after another edit', () => {
  const history = new FurnitureHistory();
  const original = [model];
  history.remember(original);
  const moved = [{ ...model, x: .25 }];
  history.remember(moved);
  const rotated = [{ ...moved[0], rotation: 90 }];
  assert.deepEqual(history.undo(rotated), moved);
  assert.deepEqual(history.undo(moved), original);
  assert.deepEqual(history.redo(original), moved);
  history.remember(moved);
  assert.equal(history.future.length, 0);
  moved[0].x = 10;
  assert.equal(history.past.at(-1)[0].x, .25);
});
