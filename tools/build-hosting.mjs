import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
export function buildHosting() {
  let config;
  try { config = JSON.parse(readFileSync(root + '.deploy/access.json', 'utf8')); }
  catch { throw new Error('Missing access configuration. Set BEES_PASSWORD and run npm run configure:access first.'); }
  for (const name of ['signingKey', 'passwordHash']) {
    if (!/^[a-f0-9]{64}$/.test(config[name] || '')) throw new Error(`Invalid access configuration: ${name}`);
  }
  const template = JSON.parse(readFileSync(root + 'infra/hosting.json', 'utf8'));
  template.Resources.AccessFunction.Properties.FunctionCode = readFileSync(root + 'infra/access.js', 'utf8')
    .replace('__SIGNING_KEY__', config.signingKey).replace('__PASSWORD_HASH__', config.passwordHash);
  mkdirSync(root + '.deploy', { recursive: true, mode: 0o700 });
  const path = root + '.deploy/hosting.json';
  writeFileSync(path, JSON.stringify(template), { mode: 0o600 });
  return path;
}
