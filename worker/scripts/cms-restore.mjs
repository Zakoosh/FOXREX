#!/usr/bin/env node
/* Restore the CMS from a backup. STOP THE WORKER FIRST.
   Usage: node scripts/cms-restore.mjs <backup-file> [--yes]
   The current state is snapshotted before anything is overwritten. */
import path from 'node:path';
import { CONFIG } from '../src/config.js';
import { readBackup, restoreBackup } from '../src/backup.js';
import { acquireLock } from '../src/fsx.js';
const file = process.argv[2]; const yes = process.argv.includes('--yes');
if (!file) { console.error('Usage: node scripts/cms-restore.mjs <backup-file> [--yes]'); process.exit(2); }
const b = readBackup(path.resolve(file));
console.log(`Backup ${path.basename(file)} from ${b.createdAt} — checksum OK.`);
if (!yes) { console.log('Re-run with --yes to restore (the worker must be stopped).'); process.exit(0); }
let release;
try { release = acquireLock(path.join(CONFIG.dataDir, 'cms')); } // refuses while a worker holds the data directory
catch (e) { console.error(e.code === 'DATA_LOCKED' ? 'The worker is running on this data directory — stop it first.' : e.message); process.exit(1); }
let r; try { r = restoreBackup(path.resolve(file), CONFIG.dataDir, { backupDir: CONFIG.backup.dir }); } finally { release(); }
console.log(`Restored. Previous state saved as ${r.safetySnapshot}.`);
