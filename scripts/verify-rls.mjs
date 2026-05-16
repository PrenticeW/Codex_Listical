#!/usr/bin/env node
/**
 * RLS verification script
 *
 * Confirms that the policies added in
 * `supabase/migrations/20260516000002_planning_rls.sql` actually prevent
 * user A from reading or writing user B's data.
 *
 * Prerequisites:
 *   1. Both planning migrations applied to the target Supabase project.
 *   2. Two confirmed test accounts created in that project's Auth dashboard.
 *      (Email confirmation is on; the dashboard "Add user" form has an
 *      "Auto Confirm User" toggle that bypasses it for tests.)
 *
 * Required env vars:
 *   SUPABASE_URL              the project URL
 *   SUPABASE_ANON_KEY         the anon (public) key
 *   TEST_USER_A_EMAIL         test account A email
 *   TEST_USER_A_PASSWORD      test account A password
 *   TEST_USER_B_EMAIL         test account B email
 *   TEST_USER_B_PASSWORD      test account B password
 *
 * Run with:
 *   node scripts/verify-rls.mjs
 *
 * Exits non-zero on any failure so it slots into a CI step later.
 */

import { createClient } from '@supabase/supabase-js';

const required = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'TEST_USER_A_EMAIL',
  'TEST_USER_A_PASSWORD',
  'TEST_USER_B_EMAIL',
  'TEST_USER_B_PASSWORD',
];
for (const name of required) {
  if (!process.env[name]) {
    console.error(`Missing env var ${name}`);
    process.exit(1);
  }
}

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;

let failures = 0;
function ok(label) {
  console.log(`  PASS  ${label}`);
}
function fail(label, detail) {
  failures += 1;
  console.error(`  FAIL  ${label}`);
  if (detail) console.error(`        ${detail}`);
}

async function signInAs(email, password) {
  const client = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data?.user) {
    throw new Error(`Failed to sign in as ${email}: ${error?.message ?? 'no user'}`);
  }
  return { client, user: data.user };
}

async function main() {
  console.log('1. Signing in as user A');
  const { client: aClient, user: aUser } = await signInAs(
    process.env.TEST_USER_A_EMAIL,
    process.env.TEST_USER_A_PASSWORD,
  );
  ok(`signed in as A (${aUser.id})`);

  console.log('\n2. Creating a year as user A');
  const { data: aYear, error: aYearErr } = await aClient
    .from('years')
    .insert({
      user_id: aUser.id,
      year_number: 9001,         // unlikely to collide with real data
      status: 'active',
      start_date: '2099-01-01',
    })
    .select()
    .single();
  if (aYearErr) {
    fail('insert year as A', aYearErr.message);
    return;
  }
  ok(`year ${aYear.id} created by A`);

  console.log('\n3. Signing in as user B');
  const { client: bClient, user: bUser } = await signInAs(
    process.env.TEST_USER_B_EMAIL,
    process.env.TEST_USER_B_PASSWORD,
  );
  ok(`signed in as B (${bUser.id})`);

  console.log("\n4. B should NOT see A's year");
  const { data: bSelectAll } = await bClient.from('years').select('*');
  const leaked = (bSelectAll ?? []).filter((row) => row.id === aYear.id);
  if (leaked.length === 0) {
    ok('B cannot see A.year via SELECT *');
  } else {
    fail('B saw A.year via SELECT *', JSON.stringify(leaked));
  }

  const { data: bSelectById } = await bClient
    .from('years')
    .select('*')
    .eq('id', aYear.id);
  if ((bSelectById ?? []).length === 0) {
    ok('B cannot see A.year via SELECT WHERE id');
  } else {
    fail('B saw A.year via SELECT WHERE id');
  }

  console.log("\n5. B should NOT be able to update A's year");
  const { error: bUpdateErr, count: bUpdateCount } = await bClient
    .from('years')
    .update({ status: 'archived' })
    .eq('id', aYear.id);
  if (bUpdateErr || bUpdateCount === 0 || bUpdateCount == null) {
    ok('B cannot UPDATE A.year');
  } else {
    fail(`B updated A.year (count=${bUpdateCount})`);
  }

  console.log("\n6. B should NOT be able to delete A's year");
  const { error: bDeleteErr, count: bDeleteCount } = await bClient
    .from('years')
    .delete()
    .eq('id', aYear.id);
  if (bDeleteErr || bDeleteCount === 0 || bDeleteCount == null) {
    ok('B cannot DELETE A.year');
  } else {
    fail(`B deleted A.year (count=${bDeleteCount})`);
  }

  console.log("\n7. B should NOT be able to forge a row owned by A");
  const { error: forgeErr } = await bClient.from('years').insert({
    user_id: aUser.id,
    year_number: 9002,
    status: 'active',
    start_date: '2099-01-01',
  });
  if (forgeErr) {
    ok(`B cannot insert with user_id=A (${forgeErr.code})`);
  } else {
    fail("B inserted a row claiming user_id=A");
  }

  console.log('\n8. Cleanup: A deletes its own year');
  const { error: cleanupErr } = await aClient.from('years').delete().eq('id', aYear.id);
  if (cleanupErr) {
    fail('A could not delete its own year', cleanupErr.message);
  } else {
    ok('A deleted its own year');
  }
}

main()
  .then(() => {
    console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} failure(s).`}`);
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch((err) => {
    console.error('\nFatal:', err);
    process.exit(2);
  });
