import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
const root = fileURLToPath(new URL('../../', import.meta.url));
function check(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, f.name);
    if (f.isDirectory()) check(file);
    else if (/\.m?js$/.test(f.name)) execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  }
}
for (const dir of ['worker/src', 'worker/scripts', 'worker/test']) check(path.join(root, dir));
new vm.Script(fs.readFileSync(path.join(root, 'studio', 'creative-studio.js'), 'utf8'));
for (const f of ['studio/cms-model.js', 'studio/cms-studio.js', 'scripts/public/content.js', 'scripts/public/market.js', 'scripts/public/site.js']) new vm.Script(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f });
const html = fs.readFileSync(path.join(root, 'studio', 'index.html'), 'utf8');
for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(m[1]);
console.log('Worker, verification scripts, tests, creative UI and inline Studio JavaScript parse successfully.');
