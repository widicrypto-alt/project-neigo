#!/usr/bin/env node
/**
 * scripts/i18n-parity-check.mjs
 *
 * Verifies that every key present in en.json also exists in every other
 * locale file. Run with: node scripts/i18n-parity-check.mjs
 *
 * Exit code 0 = all good, 1 = missing keys found.
 *
 * Add to package.json scripts:
 *   "i18n:check": "node scripts/i18n-parity-check.mjs"
 *
 * Add to CI:
 *   - run: npm run i18n:check
 */

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MESSAGES_DIR = join(__dirname, '..', 'messages');

// Locales that are actively served. Stubs (de, fr, etc.) are warned, not failed.
const ACTIVE_LOCALES = ['en', 'id'];

function flattenKeys(obj, prefix = '') {
  const keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      keys.push(...flattenKeys(v, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

const files = readdirSync(MESSAGES_DIR).filter((f) => f.endsWith('.json'));
const canonical = JSON.parse(readFileSync(join(MESSAGES_DIR, 'en.json'), 'utf-8'));
const canonicalKeys = new Set(flattenKeys(canonical));

let hasErrors = false;

for (const file of files) {
  if (file === 'en.json') continue;
  const locale = file.replace('.json', '');
  const data = JSON.parse(readFileSync(join(MESSAGES_DIR, file), 'utf-8'));
  const localeKeys = new Set(flattenKeys(data));

  const missing = [...canonicalKeys].filter((k) => !localeKeys.has(k));
  const extra = [...localeKeys].filter((k) => !canonicalKeys.has(k));

  if (missing.length > 0 || extra.length > 0) {
    const isActive = ACTIVE_LOCALES.includes(locale);
    if (isActive) hasErrors = true;
    const icon = isActive ? '❌' : '⚠️ [stub]';
    console[isActive ? 'error' : 'warn'](`\n${icon} Locale: ${locale} (${file})`);
    if (missing.length > 0) {
      console[isActive ? 'error' : 'warn'](`   Missing ${missing.length} keys:`);
      for (const k of missing.slice(0, 20)) {
        console[isActive ? 'error' : 'warn'](`     - ${k}`);
      }
      if (missing.length > 20) {
        console[isActive ? 'error' : 'warn'](`     ... and ${missing.length - 20} more`);
      }
    }
    if (extra.length > 0) {
      console[isActive ? 'error' : 'warn'](`   Extra ${extra.length} keys (not in en.json):`);
      for (const k of extra.slice(0, 10)) {
        console[isActive ? 'error' : 'warn'](`     + ${k}`);
      }
    }
  } else {
    console.log(`✓ ${locale}: full parity (${localeKeys.size} keys)`);
  }
}

if (hasErrors) {
  console.error('\n⚠ Parity check FAILED. Fix missing keys before deploying.');
  process.exit(1);
} else {
  console.log('\n✓ All locale files are in parity with en.json');
  process.exit(0);
}
