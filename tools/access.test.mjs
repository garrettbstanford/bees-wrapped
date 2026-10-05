import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHmac, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

const key = randomBytes(32).toString('hex');
const password = 'test-only-password';
const sign = value => createHmac('sha256', key).update(value).digest('hex');
const source = readFileSync(new URL('../infra/access.js', import.meta.url), 'utf8')
  .replace('__SIGNING_KEY__', key).replace('__PASSWORD_HASH__', sign('password:' + password));
const handler = runInNewContext(source + '\nhandler;', { require: createRequire(import.meta.url), Date });
const call = (uri = '/', options = {}) => handler({ request: { uri, method: 'GET', headers: {}, cookies: {}, ...options } });
const login = (value = password, headers = {}) => call('/__auth', {
  method: 'POST', headers: { 'x-bees-password': { value }, ...headers }
});
const cookie = value => ({ '__Host-bees_access': { value } });

test('unauthenticated requests cannot read the story, source, or media, including alternate paths', () => {
  for (const path of ['/', '/index.html', '/app.js', '/music.mp3', '/big-hit.mp4', '/bobbleheads/player-head.webp', '/gate.html/../index.html', '/%69ndex.html']) {
    const result = call(path);
    assert.equal(result.statusCode, 302, path);
    assert.equal(result.headers.location.value, '/gate.html');
    assert.equal(result.headers['cache-control'].value, 'no-store');
  }
});
test('only gate assets are public', () => {
  for (const path of ['/gate.html', '/gate.css', '/gate.js', '/bees-wordmark.png']) assert.equal(call(path).uri, path);
});
test('wrong, empty and oversized passwords do not create sessions', () => {
  for (const value of ['', 'incorrect', password.toUpperCase(), 'a'.repeat(129)]) {
    const result = login(value);
    assert.equal(result.statusCode, 401);
    assert.equal(result.cookies, undefined);
  }
  assert.equal(call('/__auth', { method: 'POST' }).statusCode, 401);
});
test('correct password issues a secure cookie and permits asset requests', () => {
  const result = login();
  assert.equal(result.statusCode, 200);
  assert.equal(result.headers['cache-control'].value, 'no-store');
  const session = result.cookies['__Host-bees_access'];
  for (const attribute of ['Secure', 'HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=86400']) assert.ok(session.attributes.includes(attribute));
  for (const path of ['/', '/app.js', '/big-hit.mp4']) assert.equal(call(path, { cookies: cookie(session.value) }).uri, path);
});
test('forged, expired and invalid session cookies are rejected', () => {
  const now = Math.floor(Date.now() / 1000);
  const expired = String(now - 1);
  const future = String(now + 90000);
  const valid = login().cookies['__Host-bees_access'].value;
  for (const value of ['', 'true', password, expired + '.' + sign('session:' + expired), future + '.' + sign('session:' + future), valid.slice(0, -1) + 'z']) {
    assert.equal(call('/', { cookies: cookie(value) }).statusCode, 302);
  }
});
test('cross-origin sign-in and unsupported methods are rejected', () => {
  assert.equal(login(password, { host: { value: 'bees.builtbyaether.com' }, origin: { value: 'https://evil.example' } }).statusCode, 403);
  assert.equal(login(password, { host: { value: 'bees.builtbyaether.com' }, origin: { value: 'https://bees.builtbyaether.com' } }).statusCode, 200);
  assert.equal(call('/__auth').statusCode, 405);
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']) assert.equal(call('/index.html', { method }).statusCode, 405);
});

// ---------- Shared links ----------
const shareCookie = value => ({ '__Host-bees_share': { value } });
const signedIn = () => cookie(login().cookies['__Host-bees_access'].value);
const mint = (slide, cookies = {}) => call('/__share', { querystring: slide == null ? {} : { slide: { value: slide } }, cookies });
const tokenFor = slide => JSON.parse(mint(slide, signedIn()).body).token;
const link = (token, extra = {}) => ({ s: { value: token }, ...extra });

test('only signed-in viewers can mint shared links, for well-formed slide names', () => {
  assert.equal(mint('mvp').statusCode, 401);
  assert.equal(mint('mvp', shareCookie(tokenFor('mvp'))).statusCode, 401);   // a shared link can't mint more
  for (const slide of [undefined, '', 'MVP', 'mvp!', '../x', 'a'.repeat(25)]) assert.equal(mint(slide, signedIn()).statusCode, 400, String(slide));
  const minted = mint('mvp', signedIn());
  assert.equal(minted.statusCode, 200);
  assert.equal(minted.headers['cache-control'].value, 'no-store');
  assert.match(JSON.parse(minted.body).token, /^mvp\.\d{10}\.[a-f0-9]{32}$/);
});
test('opening a shared link trades it for a scoped cookie, then allows only that slide', () => {
  const token = tokenFor('mvp');
  const trade = call('/', { querystring: link(token) });
  assert.equal(trade.statusCode, 302);
  assert.equal(trade.headers.location.value, '/?s=' + token + '&c=1');
  const set = trade.cookies['__Host-bees_share'];
  assert.equal(set.value, token);
  for (const attribute of ['Secure', 'HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=']) assert.ok(set.attributes.includes(attribute));
  const held = shareCookie(token);
  assert.equal(call('/', { querystring: link(token, { c: { value: '1' } }), cookies: held }).uri, '/');
  assert.equal(call('/index.html', { querystring: link(token), cookies: held }).uri, '/index.html');
  for (const path of ['/app.js', '/slides.css', '/mvp-card.webp', '/music.mp3']) assert.equal(call(path, { cookies: held }).uri, path);
  for (const path of ['/', '/index.html']) {   // the story without its link goes back to the shared slide
    const back = call(path, { cookies: held });
    assert.equal(back.statusCode, 302);
    assert.equal(back.headers.location.value, '/?s=' + token);
  }
  const other = tokenFor('games');   // opening a different shared link switches to it
  assert.equal(call('/', { querystring: link(other), cookies: held }).cookies['__Host-bees_share'].value, other);
});
test('forged, tampered, expired and cookie-less shared links stop at the gate', () => {
  const now = Math.floor(Date.now() / 1000);
  const token = tokenFor('mvp'), [, until] = token.split('.');
  const signed = (slide, at) => slide + '.' + at + '.' + sign('share:' + slide + '.' + at).slice(0, 32);
  const bad = [
    'mvp.' + until + '.' + 'a'.repeat(32),                       // forged signature
    token.replace(/^mvp/, 'games'),                              // signature for another slide
    signed('mvp', String(now - 1)),                              // expired
    signed('mvp', String(now + 2592000 + 3600)),                 // longer than links can last
    'mvp', 'mvp.' + until, token + 'x', token.toUpperCase(),     // malformed
  ];
  for (const value of bad) {
    for (const result of [call('/', { querystring: link(value) }), call('/', { cookies: shareCookie(value) }),
                          call('/app.js', { cookies: shareCookie(value) })]) {
      assert.equal(result.statusCode, 302, value);
      assert.equal(result.headers.location.value, '/gate.html', value);
    }
  }
  // a browser that didn't keep the cookie comes back with c=1 and stops at the gate instead of looping
  assert.equal(call('/', { querystring: link(token, { c: { value: '1' } }) }).headers.location.value, '/gate.html');
});
