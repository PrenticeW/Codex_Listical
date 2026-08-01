import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  getUserIdFromToken,
  checkAndRecordExportAttempt,
  exportUserData,
} from '../src/lib/server/dataExport.js';

/**
 * GDPR data export endpoint ("Download my data").
 *
 * POST /api/export-data
 * Authorization: Bearer <supabase access token>
 *
 * The caller's identity comes ONLY from the verified Supabase JWT — a user
 * id is never accepted from the request body or query string. Rate limited
 * to 3 exports per hour per user (export_rate_limits, migration
 * 20260801000002). Returns the full export as a JSON attachment named
 * Tacular-data-export-YYYY-MM-DD.json.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }

  const { userId, error: authError } = await getUserIdFromToken(token);
  if (!userId) {
    console.error('[export-data] Authentication failed:', authError);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { allowed, error: rateError } = await checkAndRecordExportAttempt(userId);
  if (!allowed) {
    if (rateError) {
      console.error('[export-data] Rate limit error:', rateError);
      return res.status(500).json({ error: 'Failed to process export request' });
    }
    return res.status(429).json({ error: 'Too many export requests. Please try again later.' });
  }

  try {
    const result = await exportUserData(userId);
    if (!result.success || !result.payload) {
      console.error('[export-data] Export failed:', result.error);
      return res.status(500).json({ error: 'Failed to generate export' });
    }

    const date = result.payload.exportedAt.slice(0, 10); // YYYY-MM-DD
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="Tacular-data-export-${date}.json"`
    );
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(JSON.stringify(result.payload, null, 2));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[export-data] Unexpected error:', message);
    return res.status(500).json({ error: 'Failed to generate export' });
  }
}
