import { createHmac, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const password = process.env.BEES_PASSWORD;
if (!password || password.length > 128 || /[^\x20-\x7e]/.test(password)) {
  console.error('Set BEES_PASSWORD to a password of 1–128 printable ASCII characters.');
  process.exit(1);
}
const directory = fileURLToPath(new URL('../.deploy/', import.meta.url));
mkdirSync(directory, { recursive: true, mode: 0o700 });
const signingKey = randomBytes(32).toString('hex');
const passwordHash = createHmac('sha256', signingKey).update('password:' + password).digest('hex');
writeFileSync(directory + '/access.json', JSON.stringify({ signingKey, passwordHash }) + '\n', { mode: 0o600 });
console.log('Access configuration saved privately. Run npm run deploy to apply it. Existing sessions will expire when the new configuration is deployed.');
