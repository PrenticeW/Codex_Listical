#!/usr/bin/env node
/**
 * verify-export-tables.mjs
 *
 * Guards against drift between:
 *   1. The GDPR export table list (EXPORT_TABLES in src/lib/server/dataExport.ts)
 *   2. The deletion flow's explicit purge list (purge_user_data in
 *      supabase/migrations/20260801000001_complete_deletion_purge.sql)
 *   3. Every table actually created in supabase/migrations with a user_id
 *      column (so a new table can't silently escape both lists)
 *
 * Run: node scripts/verify-export-tables.mjs
 * Exits non-zero on any undocumented drift.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(root, 'supabase', 'migrations');

// ─── Documented, intentional differences ─────────────────────────────────────

// Purged on deletion but never exported (internal bookkeeping / hash-only).
const INTERNAL_NOT_EXPORTED = new Set([
  'deletion_rate_limits',
  'export_rate_limits',
  'deletion_audit_log',
]);

// Exported via a dedicated profiles query (keys on id, not user_id).
const EXPORTED_SEPARATELY = new Set(['profiles']);

// Known, documented drift between export and purge lists. Currently empty —
// as of 2026-08-01 the two lists fully agree. If a real drift is discovered,
// add the table here (the check then warns loudly instead of failing) and
// fix the underlying list as soon as possible.
const KNOWN_DRIFT_EXPORT_ONLY = new Set([]);

// ─── 1. Export list ──────────────────────────────────────────────────────────

const exportSource = readFileSync(join(root, 'src', 'lib', 'server', 'dataExport.ts'), 'utf8');
const exportBlock = exportSource.match(/EXPORT_TABLES\s*=\s*\[([\s\S]*?)\]/);
if (!exportBlock) {
  console.error('FAIL: could not find EXPORT_TABLES in src/lib/server/dataExport.ts');
  process.exit(1);
}
const exportTables = new Set(
  [...exportBlock[1].matchAll(/'([a-z_]+)'/g)].map(m => m[1])
);

// ─── 2. Purge list ───────────────────────────────────────────────────────────

const purgeSql = readFileSync(
  join(migrationsDir, '20260801000001_complete_deletion_purge.sql'),
  'utf8'
);
const purgeTables = new Set(
  [...purgeSql.matchAll(/table_name := '([a-z_]+)'/g)].map(m => m[1])
);

// ─── 3. Tables created in migrations with a user_id column ───────────────────

// Applies CREATE TABLE and DROP TABLE statements in filename order so
// superseded tables (e.g. the 20260102 schema dropped by 20260516) and
// renamed tables are handled correctly.
const liveTables = new Map(); // name -> has user_id column
const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
for (const file of files) {
  const sql = readFileSync(join(migrationsDir, file), 'utf8');
  for (const m of sql.matchAll(/DROP TABLE IF EXISTS\s+(?:public\.)?([a-z_]+)/gi)) {
    liveTables.delete(m[1]);
  }
  for (const m of sql.matchAll(
    /CREATE TABLE(?: IF NOT EXISTS)?\s+(?:public\.)?([a-z_]+)\s*\(([\s\S]*?)\n\);/gi
  )) {
    const [, name, body] = m;
    liveTables.set(name, /\buser_id\b/i.test(body));
  }
}
const userTables = new Set(
  [...liveTables.entries()].filter(([, hasUid]) => hasUid).map(([n]) => n)
);
userTables.add('profiles'); // keys on id, not user_id, but is user data

// ─── Checks ──────────────────────────────────────────────────────────────────

let failed = false;
const fail = msg => { failed = true; console.error(`FAIL: ${msg}`); };

// Export list vs purge list
for (const t of purgeTables) {
  if (INTERNAL_NOT_EXPORTED.has(t) || EXPORTED_SEPARATELY.has(t)) continue;
  if (!exportTables.has(t)) fail(`'${t}' is purged on deletion but missing from EXPORT_TABLES`);
}
for (const t of exportTables) {
  if (purgeTables.has(t)) continue;
  if (KNOWN_DRIFT_EXPORT_ONLY.has(t)) {
    console.warn(
      `KNOWN DRIFT: '${t}' is exported but missing from purge_user_data's explicit list ` +
      `(erasure covered only by CASCADE + dynamic verifier). Add it to purge_user_data.`
    );
    continue;
  }
  fail(`'${t}' is in EXPORT_TABLES but not in purge_user_data`);
}

// Migration cross-check: every live user-data table must be accounted for
for (const t of userTables) {
  const known =
    exportTables.has(t) ||
    EXPORTED_SEPARATELY.has(t) ||
    INTERNAL_NOT_EXPORTED.has(t);
  if (!known) fail(`table '${t}' (created in migrations, has user_id) is in neither the export list nor the documented exclusions`);
}
for (const t of exportTables) {
  if (!userTables.has(t)) fail(`EXPORT_TABLES contains '${t}' but no migration creates such a table with user_id`);
}

// ─── Result ──────────────────────────────────────────────────────────────────

console.log(`Export tables (${exportTables.size}):`, [...exportTables].sort().join(', '));
console.log(`Purge tables  (${purgeTables.size}):`, [...purgeTables].sort().join(', '));
console.log(`Live user tables (${userTables.size}):`, [...userTables].sort().join(', '));

if (failed) {
  console.error('\nverify-export-tables: FAILED');
  process.exit(1);
}
console.log('\nverify-export-tables: OK (export, purge, and migrations agree, modulo documented exceptions)');
