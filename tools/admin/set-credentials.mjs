#!/usr/bin/env node
/* Writes admin/gate.json for the FOXREX admin login.
   Usage (credentials are read from the environment and never written to disk in plain text):
     FOXREX_ADMIN_USER=FOXREX FOXREX_ADMIN_PASSWORD='…' node tools/admin/set-credentials.mjs
   Running it again with a new password rotates the credentials and signs out every saved session. */
import { webcrypto as crypto } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ITERATIONS = 600000;
const user = process.env.FOXREX_ADMIN_USER, pass = process.env.FOXREX_ADMIN_PASSWORD;
if (!user || !pass) {
  console.error('Set FOXREX_ADMIN_USER and FOXREX_ADMIN_PASSWORD in the environment.');
  process.exit(1);
}
if (pass.length < 10) {
  console.error('Use a password of at least 10 characters.');
  process.exit(1);
}

const enc = new TextEncoder();
const b64 = u8 => Buffer.from(u8).toString('base64');
const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));
const base = await crypto.subtle.importKey('raw', enc.encode(user.trim().toUpperCase() + '\u0000' + pass), 'PBKDF2', false, ['deriveBits']);
const raw = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, base, 256));
const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
const verifier = { ok: 'foxrex-admin', user: user.trim().toUpperCase(), issuedAt: new Date().toISOString(), nonce: b64(crypto.getRandomValues(new Uint8Array(16))) };
const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(verifier))));

const gate = { schemaVersion: 1, kdf: 'PBKDF2-SHA256', iterations: ITERATIONS, cipher: 'AES-256-GCM', salt: b64(salt), iv: b64(iv), ct: b64(ct) };
fs.writeFileSync(path.join(ROOT, 'admin/gate.json'), JSON.stringify(gate, null, 2) + '\n');
console.log('admin/gate.json written for user ' + verifier.user + '. Existing admin sessions are now signed out.');
