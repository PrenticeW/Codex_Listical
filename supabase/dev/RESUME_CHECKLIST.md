# Dev database setup — resume checklist

Where things stand: the dev project "Listical Dev" exists with the full schema,
the data-key function is deployed, and .env.local already points at it.
What's left is copying the data in and setting the master key.

## 1. Get your production database password
- Go to supabase.com and open the **Listical GPS** project (the production one).
- Settings (gear icon, left sidebar) -> Database.
- If you don't know the password, click **Reset database password** and save the new one in your password manager.

## 2. Run the data copy
- Open the file `supabase/dev/dev_setup_paste.sql` in this repo (VS Code or any editor).
- Replace `YOUR_PROD_DB_PASSWORD` (one place, near the top of Part 2) with the password from step 1.
- In supabase.com, switch to the **Listical Dev** project.
- Open **SQL Editor** (left sidebar), paste the whole file, press **Run**.
- It may take a few minutes (site_snapshots is ~44 MB). At the end it prints row counts; planner_rows should be 1393 and auth.users 11.

## 3. Set the master key on dev
- Still in **Listical Dev**: Edge Functions (left sidebar) -> Secrets.
- Add a secret named `TACULAR_MASTER_KEY` with the same value as production (it's in your password manager).
- Without this, encrypted rows won't decrypt on localhost.

## 4. Verify
- Run `npm run dev` in this repo and open localhost.
- Log in with your normal email and password.
- Check the System page renders your tasks, including encrypted ones.
- Make a throwaway edit, then confirm it does NOT appear on tacular.app.

## Notes
- Localhost can no longer touch production: .env.local only holds dev credentials.
- To refresh dev data later, ask Claude to reset the dev tables and re-run the copy script.
- Also outstanding (production): enable RLS on planner_rows_backup_20261017 and planner_rows_orderkey_backup_20261017.
