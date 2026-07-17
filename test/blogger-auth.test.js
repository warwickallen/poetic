'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const crypto = require('crypto');

const {
  waitForCode,
  generateState,
  generatePkce,
  describeBlogAccess,
} = require('../src/tools/blogger-auth');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = http.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

// Fire the OAuth redirect at the loopback server, retrying briefly while it
// binds. Resolves with the HTTP status code.
function hitCallback(port, query) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const attempt = () => {
      const req = http.get(`http://127.0.0.1:${port}/${query}`, (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      });
      req.on('error', (err) => {
        if (err.code === 'ECONNREFUSED' && attempts < 20) {
          attempts += 1;
          setTimeout(attempt, 25);
        } else {
          reject(err);
        }
      });
    };
    attempt();
  });
}

test('generateState produces distinct URL-safe values', () => {
  const a = generateState();
  const b = generateState();
  assert.notStrictEqual(a, b);
  assert.match(a, /^[A-Za-z0-9_-]+$/);
});

test('generatePkce challenge is base64url(sha256(verifier))', () => {
  const { verifier, challenge } = generatePkce();
  assert.match(verifier, /^[A-Za-z0-9_-]+$/);
  assert.match(challenge, /^[A-Za-z0-9_-]+$/);
  const expected = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  assert.strictEqual(challenge, expected);
});

test('waitForCode resolves the code when the returned state matches', async () => {
  const port = await getFreePort();
  const pending = waitForCode(port, 'expected-state');
  const status = await hitCallback(port, '?code=auth-code&state=expected-state');
  assert.strictEqual(status, 200);
  assert.strictEqual(await pending, 'auth-code');
});

test('waitForCode rejects a callback whose state does not match', async () => {
  const port = await getFreePort();
  const pending = waitForCode(port, 'expected-state');
  // Attach the rejection assertion before firing the callback, so the
  // rejection is never momentarily unhandled.
  const rejection = assert.rejects(pending, /State parameter mismatch/);
  const status = await hitCallback(port, '?code=auth-code&state=forged');
  assert.strictEqual(status, 400);
  await rejection;
});

// ── describeBlogAccess ────────────────────────────────────────────────────────

const BLOG_ID = '7781143180070523245';
const MINE = { id: BLOG_ID, name: 'Fragments and Unity', url: 'https://fragments-and-unity.blogspot.com/' };
const OTHER = { id: '999', name: 'Other Blog', url: 'https://other.blogspot.com/' };

test('describeBlogAccess: unrecognised account is not ok and explains Workspace', () => {
  const { ok, text } = describeBlogAccess({ recognised: false, blogs: [] }, BLOG_ID);
  assert.strictEqual(ok, false);
  assert.match(text, /does not recognise this account/);
  assert.match(text, /Workspace/);
  // \s+ rather than a literal space: the guidance is hard-wrapped for a terminal.
  assert.match(text, /caller does not have\s+permission/);
});

test('describeBlogAccess: account owning no blogs is not ok', () => {
  const { ok, text } = describeBlogAccess({ recognised: true, blogs: [] }, BLOG_ID);
  assert.strictEqual(ok, false);
  assert.match(text, /does not administer any blogs/);
});

test('describeBlogAccess: configured blog present is ok and marked in the list', () => {
  const { ok, text } = describeBlogAccess({ recognised: true, blogs: [MINE, OTHER] }, BLOG_ID);
  assert.strictEqual(ok, true);
  assert.match(text, /can manage these blogs/);
  assert.match(text, new RegExp(`${BLOG_ID}.*Fragments and Unity.*← blogger\\.blog_id`));
  // Only the configured blog is marked.
  assert.doesNotMatch(text, /999.*←/);
});

test('describeBlogAccess: configured blog absent is not ok and lists the alternatives', () => {
  const { ok, text } = describeBlogAccess({ recognised: true, blogs: [OTHER] }, BLOG_ID);
  assert.strictEqual(ok, false);
  assert.match(text, new RegExp(`cannot manage blog ${BLOG_ID}`));
  assert.match(text, /999 {2}Other Blog/);
  assert.match(text, /before saving these credentials/);
});

test('describeBlogAccess: blog_id matched as a string when config yields a number', () => {
  // YAML parses an unquoted blog_id as a number; the ids from Blogger are strings.
  const { ok } = describeBlogAccess({ recognised: true, blogs: [{ ...MINE, id: '999' }] }, 999);
  assert.strictEqual(ok, true);
});

test('describeBlogAccess: no configured blog_id lists blogs and says to set one', () => {
  const { ok, text } = describeBlogAccess({ recognised: true, blogs: [MINE] }, null);
  assert.strictEqual(ok, true);
  assert.match(text, /Copy the ID/);
  assert.match(text, /quoted/);
  assert.doesNotMatch(text, /←/);
});
