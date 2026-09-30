#!/usr/bin/env node
/* Take a CMS backup now: node scripts/cms-backup.mjs  (safe while the worker runs). */
import { CONFIG } from '../src/config.js';
import { BackupService } from '../src/backup.js';
const b = new BackupService({ dataDir: CONFIG.dataDir, dir: CONFIG.backup.dir, keep: CONFIG.backup.keep }).snapshot('cli');
console.log(`Backup written: ${b.file} (${b.bytes} bytes)`);
