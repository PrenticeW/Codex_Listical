// Weekly review decrypt bundle — run locally, keys never leave this machine.
// Usage:
//   TACULAR_MASTER_KEY=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/weekly-review-bundle.mjs
// (paste the two values from your password manager; prefix the command with a
//  space if your shell is configured with HIST_IGNORE_SPACE, or use `read -s`)
// Output: scripts/week-review-data.json (gitignored) — latest archived week,
// current planner rows, projects (incl. plan tables), inbox, statuses. Decrypted.

import { createClient } from '@supabase/supabase-js';
import { createDecipheriv } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const USER_ID = 'ed780e77-c2f2-4a63-b909-feb99eb9d6e2';
const SUPABASE_URL = 'https://hoxwpjxfcrborwufydxl.supabase.co';

const master = Buffer.from(req('TACULAR_MASTER_KEY'), 'base64');
if (master.length !== 32) die('TACULAR_MASTER_KEY must be 32 bytes base64');
const supa = createClient(SUPABASE_URL, req('SUPABASE_SERVICE_ROLE_KEY'));

function req(name) { const v = process.env[name]; if (!v) die(`Missing env var ${name}`); return v; }
function die(msg) { console.error(msg); process.exit(1); }

function decRaw(key, value) {
  const [, ivB64, ctB64] = value.split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const ct = Buffer.from(ctB64, 'base64');
  const tag = ct.subarray(ct.length - 16);
  const body = ct.subarray(0, ct.length - 16);
  const d = createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(body), d.final()]);
}
function dec(key, value) {
  if (typeof value !== 'string' || !value.startsWith('enc1:')) return value; // legacy plaintext
  return decRaw(key, value).toString('utf8');
}
const decJson = (key, encVal, plainVal) => encVal ? JSON.parse(dec(key, encVal)) : plainVal;

async function q(table, build) {
  let query = supa.from(table).select('*').eq('user_id', USER_ID);
  if (build) query = build(query);
  const { data, error } = await query;
  if (error) die(`${table}: ${error.message}`);
  return data;
}

// 1. unwrap DEK
const keys = await q('user_keys');
if (!keys.length) die('no user_keys row');
const dekBuf = decRaw(master, keys[0].wrapped_dek); // raw 32 bytes
if (dekBuf.length !== 32) die(`unwrapped DEK is ${dekBuf.length} bytes, expected 32`);

// 2. latest archived week
const [week] = await q('archived_weeks', s => s.order('archived_at', { ascending: false }).limit(1));
week.snapshot = decJson(dekBuf, week.snapshot_enc, week.snapshot);
delete week.snapshot_enc;

// 3. projects (incl. plan tables)
const projects = (await q('projects')).map(p => ({
  ...p,
  text: dec(dekBuf, p.text),
  project_name: dec(dekBuf, p.project_name),
  project_nickname: dec(dekBuf, p.project_nickname),
  project_tagline: dec(dekBuf, p.project_tagline),
  plan_table_entries: decJson(dekBuf, p.plan_table_entries_enc, p.plan_table_entries),
  plan_table_entries_enc: undefined,
}));

// 4. current planner rows (live planner + inbox live here)
const planner_rows = (await q('planner_rows')).map(r => ({
  ...r,
  task: dec(dekBuf, r.task),
  notes: dec(dekBuf, r.notes),
  subproject_label: dec(dekBuf, r.subproject_label),
}));

// 5. statuses (plaintext, for vocabulary/ordering)
const statuses = await q('statuses');

const out = new URL('./week-review-data.json', import.meta.url).pathname;
writeFileSync(out, JSON.stringify({ generated_at: new Date().toISOString(), week, projects, planner_rows, statuses }));
console.log(`Wrote ${out}`);
console.log(`Week: ${week.week_range_label} (archived ${week.archived_at}); ${planner_rows.length} planner rows, ${projects.length} projects.`);
