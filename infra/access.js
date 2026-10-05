// CloudFront viewer-request function. Secrets are inserted only into the private deployment bundle.
var crypto = require('crypto');
var signingKey = '__SIGNING_KEY__';
var passwordHash = '__PASSWORD_HASH__';
var cookieName = '__Host-bees_access';
var sessionSeconds = 86400;
// Shared links: a signed-in viewer can mint a link to one slide. Anyone opening it gets a cookie that lets
// their browser load that slide (the page and its styles, scripts and media), and nothing else in the story.
var shareCookieName = '__Host-bees_share';
var shareSeconds = 2592000;   // links last 30 days; a new password (signing key) ends them all
var publicPaths = ['/gate.html', '/gate.css', '/gate.js', '/bees-wordmark.png'];

function digest(value) {
  return crypto.createHmac('sha256', signingKey).update(value).digest('hex');
}

function equal(a, b) {
  if (a.length !== b.length) return false;
  var difference = 0;
  for (var i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

// "slide.expires.signature" -> the slide, if the signature is ours and the link hasn't expired
function sharedSlide(token, now) {
  var parts = /^([a-z0-9-]{1,24})\.(\d{10})\.([a-f0-9]{32})$/.exec(token || '');
  if (!parts || Number(parts[2]) <= now || Number(parts[2]) > now + shareSeconds) return null;
  return equal(digest('share:' + parts[1] + '.' + parts[2]).slice(0, 32), parts[3]) ? parts[1] : null;
}

function redirect(location) {
  var result = response(302, '');
  result.headers.location = { value: location };
  return result;
}

function response(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': { value: 'application/json; charset=utf-8' },
      'cache-control': { value: 'no-store' },
      'strict-transport-security': { value: 'max-age=31536000' },
      'x-content-type-options': { value: 'nosniff' }
    },
    body: body
  };
}

function handler(event) {
  var request = event.request;
  var now = Math.floor(Date.now() / 1000);

  if (request.uri === '/__auth') {
    if (request.method !== 'POST') return response(405, '{"ok":false}');
    var origin = request.headers.origin;
    var host = request.headers.host;
    if (origin && (!host || origin.value !== 'https://' + host.value)) return response(403, '{"ok":false}');
    // Functions cannot read request bodies. The password travels in a header over HTTPS, never in a URL.
    var password = request.headers['x-bees-password'];
    if (!password || password.value.length > 128 || !equal(digest('password:' + password.value), passwordHash)) {
      return response(401, '{"ok":false}');
    }
    var expires = String(now + sessionSeconds);
    var result = response(200, '{"ok":true}');
    result.cookies = {};
    result.cookies[cookieName] = {
      value: expires + '.' + digest('session:' + expires),
      attributes: 'Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=' + sessionSeconds
    };
    return result;
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') return response(405, '{"ok":false}');
  if (publicPaths.indexOf(request.uri) !== -1) return request;

  var cookie = request.cookies && request.cookies[cookieName];
  var session = false;
  if (cookie) {
    var parts = cookie.value.split('.');
    session = parts.length === 2 && /^\d{10}$/.test(parts[0]) && Number(parts[0]) > now &&
      Number(parts[0]) <= now + sessionSeconds && equal(digest('session:' + parts[0]), parts[1]);
  }

  // Minting a shared link to one slide: signed-in viewers only
  if (request.uri === '/__share') {
    var slide = request.querystring && request.querystring.slide && request.querystring.slide.value;
    if (!session) return response(401, '{"ok":false}');
    if (!slide || !/^[a-z0-9-]{1,24}$/.test(slide)) return response(400, '{"ok":false}');
    var until = String(now + shareSeconds);
    return response(200, '{"ok":true,"token":"' + slide + '.' + until + '.' + digest('share:' + slide + '.' + until).slice(0, 32) + '"}');
  }
  if (session) return request;

  var query = request.querystring || {};
  var offered = query.s && query.s.value;
  var home = request.uri === '/' || request.uri === '/index.html';
  var shareCookie = request.cookies && request.cookies[shareCookieName];
  var held = shareCookie && sharedSlide(shareCookie.value, now) ? shareCookie.value : null;

  // Opening a shared link: trade it for a cookie (a redirect is the only way to set one), then come back
  // to the same link. c=1 marks the return trip, so a browser that drops cookies stops at the gate
  // instead of redirecting forever.
  if (home && offered && offered !== held && sharedSlide(offered, now)) {
    if (query.c) return redirect('/gate.html');
    var trade = redirect('/?s=' + offered + '&c=1');
    trade.cookies = {};
    trade.cookies[shareCookieName] = {
      value: offered,
      attributes: 'Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=' + (Number(offered.split('.')[1]) - now)
    };
    return trade;
  }
  // Holding a shared link: its slide's page and the files it needs, nothing else
  if (held) {
    if (!home) return request;
    if (offered === held) return request;
    return redirect('/?s=' + held);
  }

  return redirect('/gate.html');
}
