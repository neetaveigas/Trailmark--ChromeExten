'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { hostnameFromUrl, isValidSiteKey } = require('../extension/shared/events.js');

test('hostnameFromUrl returns the hostname of https:// and http:// URLs', () => {
  assert.equal(hostnameFromUrl('https://example.com/settings?tab=1#top'), 'example.com');
  assert.equal(hostnameFromUrl('http://shop.example.com:8080/cart'), 'shop.example.com');
  assert.equal(hostnameFromUrl('http://localhost:4317/test'), 'localhost');
  assert.equal(hostnameFromUrl('HTTPS://Example.COM/'), 'example.com');
});

test('hostnameFromUrl never returns the path, query or fragment', () => {
  const host = hostnameFromUrl('https://user:secret@mail.example.com/inbox/42?q=private#msg');
  assert.equal(host, 'mail.example.com');
});

test('hostnameFromUrl returns null for chrome:// and other non-web schemes', () => {
  assert.equal(hostnameFromUrl('chrome://extensions'), null);
  assert.equal(hostnameFromUrl('chrome://newtab/'), null);
  assert.equal(hostnameFromUrl('chrome-extension://abcdefghijklmnop/popup.html'), null);
  assert.equal(hostnameFromUrl('file:///C:/Users/me/notes.txt'), null);
  assert.equal(hostnameFromUrl('about:blank'), null);
  assert.equal(hostnameFromUrl('javascript:alert(1)'), null);
});

test('hostnameFromUrl returns null for empty input and random text', () => {
  assert.equal(hostnameFromUrl(''), null);
  assert.equal(hostnameFromUrl('   '), null);
  assert.equal(hostnameFromUrl('not a url at all'), null);
  assert.equal(hostnameFromUrl('example.com'), null);
  assert.equal(hostnameFromUrl('https://'), null);
  assert.equal(hostnameFromUrl(undefined), null);
  assert.equal(hostnameFromUrl(null), null);
  assert.equal(hostnameFromUrl(42), null);
});

test('isValidSiteKey accepts exactly 22 letters, numbers, _ and -', () => {
  assert.equal(isValidSiteKey('tmTestSiteKey_0123-abc'), true);
  assert.equal(isValidSiteKey('A'.repeat(22)), true);
});

test('isValidSiteKey rejects wrong lengths, spaces and other symbols', () => {
  assert.equal(isValidSiteKey('A'.repeat(21)), false);
  assert.equal(isValidSiteKey('A'.repeat(23)), false);
  assert.equal(isValidSiteKey('tmTestSiteKey 0123-abc'), false);
  assert.equal(isValidSiteKey('tmTestSiteKey.0123-abc'), false);
  assert.equal(isValidSiteKey(''), false);
  assert.equal(isValidSiteKey(undefined), false);
});
