import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ojUrl } from '../src/server/config.mjs';
import { embeddedOjUrl, embeddedWikiBookUrl } from '../src/oj-panel.js';

test('OJ configuration accepts only public HTTP(S) URLs without embedded credentials', () => {
  assert.equal(ojUrl('https://school.example/oj/problems'), 'https://school.example/oj/problems');
  assert.equal(ojUrl('http://127.0.0.1:5009/oj/problems'), 'http://127.0.0.1:5009/oj/problems');
  assert.equal(ojUrl(''), '');
  for (const value of ['javascript:alert(1)', 'data:text/html,hi', '/oj/problems', 'https://user:password@example.com/oj']) assert.throws(() => ojUrl(value));
});

test('fishing URL is independently configurable and keeps its own iframe mode', () => {
  const url = 'http://211.154.20.65:20017/fishing?area=village#water';
  assert.equal(ojUrl(url, 'WIKIBOOK_FISHING_URL'), url);
  assert.equal(embeddedWikiBookUrl(url, 'fishing'), 'http://211.154.20.65:20017/fishing?area=village&embed=community-fishing#water');
  assert.throws(() => ojUrl('javascript:alert(1)', 'WIKIBOOK_FISHING_URL'), /WIKIBOOK_FISHING_URL/);
});

test('only the iframe gets the embedded chrome marker, retaining OJ query and hash', () => {
  const original = 'https://school.example/oj/problems?tag=python#list';
  assert.equal(embeddedOjUrl(original), 'https://school.example/oj/problems?tag=python&embed=community-oj#list');
  assert.equal(original, 'https://school.example/oj/problems?tag=python#list');
});
