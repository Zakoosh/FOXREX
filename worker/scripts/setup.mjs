// Safe first-run setup. Existing credentials and storage configuration are never replaced.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const target = fileURLToPath(new URL('../.env', import.meta.url));
if (fs.existsSync(target)) {
  console.log('Existing worker/.env preserved. Edit it locally; do not copy .env.example over it.');
} else {
  const example = fs.readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
  fs.writeFileSync(target, example.replace('change-me-long-random-string', crypto.randomBytes(32).toString('hex')), { flag: 'wx', mode: 0o600 });
  console.log('Created worker/.env with a random token. Copy it privately into Studio Settings. Set ALLOWED_ORIGIN to the exact Studio origin, then npm start.');
}
