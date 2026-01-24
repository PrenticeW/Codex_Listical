import type { VercelRequest, VercelResponse } from '@vercel/node';
import { processScheduledDeletions } from '../../src/lib/server/accountDeletion';

/**
 * Vercel Cron Job: Process Scheduled Account Deletions
 *
 * Runs daily at 3am GMT to hard-delete users past the 30-day grace period.
 *
 * This endpoint:
 * 1. Queries users where deletion_requested_at is older than 30 days and deleted_at is null
 * 2. For each user:
 *    - Deletes all user data from related tables
 *    - Deletes the Supabase auth user
 *    - Sets deleted_at to now()
 *    - Updates deletion_audit_log status to 'completed'
 * 3. If any step fails for a user, logs the error, marks audit log as 'failed', continues to next user
 * 4. Returns a summary of the batch processing results
 *
 * Security: Protected by CRON_SECRET to ensure only Vercel cron can trigger it
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow GET requests (Vercel cron uses GET)
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify the request is from Vercel Cron
  // Vercel automatically adds this header for cron jobs
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.error('[process-deletions] Unauthorized cron request');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('[process-deletions] Starting scheduled deletion cron job');

  try {
    const result = await processScheduledDeletions();

    // Log results for monitoring
    console.log('[process-deletions] Cron job completed:', {
      processed: result.processed,
      succeeded: result.succeeded,
      failed: result.failed,
      timestamp: new Date().toISOString(),
    });

    // Alert on failures (these logs will appear in Vercel's function logs)
    if (result.failed > 0) {
      console.error('[process-deletions] ALERT: Deletion failures detected:', {
        failedCount: result.failed,
        errors: result.errors,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Scheduled deletions processed',
      result: {
        processed: result.processed,
        succeeded: result.succeeded,
        failed: result.failed,
        // Don't expose user IDs in the response for security
        hasErrors: result.failed > 0,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('[process-deletions] Critical error in cron job:', {
      error: errorMessage,
      timestamp: new Date().toISOString(),
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to process scheduled deletions',
      timestamp: new Date().toISOString(),
    });
  }
}
