import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WorldEditor } from '../src/world-editor.js';

test('world editor uses legacy footprint defaults only when model scale is missing or invalid', async () => {
  for (const scale of [undefined, null, 0, -1, '', NaN, Infinity, 1.2]) {
    const editor = new WorldEditor({ state: { modelAssets: [{ id: 'asset', name: '测试模型', width: 4, height: 3, depth: 2, scale }] } });
    editor.draft = [];
    editor.rerender = () => {};
    await editor.click({ dataset: { addWorldModel: 'asset' } });
    assert.equal(editor.draft[0].width, scale === 1.2 ? 2 : 4);
    assert.equal(editor.draft[0].depth, scale === 1.2 ? 1 : 4);
  }
});

test('a map click does not schedule a second render that could erase the next coordinate input', () => {
  const previousDocument = globalThis.document;
  const previousAnimationFrame = globalThis.requestAnimationFrame;
  const listeners = new Map();
  let scheduled = 0;
  const svg = { getBoundingClientRect: () => ({ width: 700 }), setPointerCapture: () => {} };
  globalThis.document = { addEventListener: (name, handler) => listeners.set(name, handler), querySelector: () => svg };
  globalThis.requestAnimationFrame = () => { scheduled += 1; };
  try {
    const editor = new WorldEditor({ state: { panel: 'world-editor' } });
    editor.draft = [{ id: 'class-1', gridX: 0, gridZ: 0 }];
    editor.mapView = { span: 140 };
    editor.bind();
    listeners.get('pointerdown')({ target: { closest: () => ({ dataset: { worldRect: 'class-1' } }) }, clientX: 100, clientY: 100, pointerId: 1, preventDefault: () => {} });
    listeners.get('pointerup')();
    assert.equal(scheduled, 0);
    assert.equal(editor.selectedId, 'class-1');
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousAnimationFrame === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = previousAnimationFrame;
  }
});
